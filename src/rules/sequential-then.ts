import { Node, SyntaxKind } from "ts-morph";
import type { AnalysisContext, AsyncDoctorRule, Finding } from "../core/types.js";

const RULE_NAME = "sequential-then";

/**
 * 함수 경계 노드인지 판별한다.
 * no-await-in-loop.ts / no-foreach-async.ts / no-async-reduce.ts의 동일 헬퍼와 같은 목적 —
 * 어떤 노드에서 상위로 올라가다 대상(여기서는 바깥 `.then()` 핸들러)보다 먼저 이 노드를
 * 만나면, 그 노드는 이 핸들러가 아니라 안쪽에 별도로 중첩된 함수(다른 콜백, IIFE 등)의
 * 실행 흐름에 속한다.
 */
function isFunctionBoundary(node: Node): boolean {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isArrowFunction(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isConstructorDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  );
}

/**
 * `(((expr)))`처럼 감싼 괄호를 모두 벗겨 실제 표현식 노드를 얻는다.
 * `Promise.all(...)`을 괄호로 감싼 채 `.then()`을 체이닝해도 판단이 달라지면 안 되므로
 * 배제 조건 검사에 앞서 항상 이 함수를 거친다.
 */
function unwrapParens(node: Node): Node {
  let current = node;
  while (Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

/**
 * `X.then(handler)` 형태의 호출이면 프로미스 생성 표현식(`X`)을 반환하고,
 * 아니면(콜백 이름이 다르거나 `.then` 프로퍼티 접근이 아니면) undefined를 반환한다.
 * 이 함수 하나로 "이것이 then 호출인가"와 "그 수신자가 무엇인가"를 동시에 판별한다.
 */
function getThenReceiver(node: Node): Node | undefined {
  if (!Node.isCallExpression(node)) return undefined;
  const callee = node.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return undefined;
  if (callee.getName() !== "then") return undefined;
  return callee.getExpression();
}

/**
 * `.then()` 호출의 첫 번째 인자가 인라인 함수(화살표 함수 또는 함수 표현식)일 때만
 * 그 함수 노드를 반환한다. `getUser().then(handleUser)`처럼 식별자를 참조하는 핸들러는
 * 본문을 이 파일에서 추적할 수 없으므로 의도적으로 제외한다(보수적 미탐 허용 —
 * no-async-reduce/no-foreach-async가 콜백을 인라인 함수로만 한정한 전례와 동일한 원칙).
 */
function getInlineHandler(thenCall: Node): Node | undefined {
  if (!Node.isCallExpression(thenCall)) return undefined;
  const [first] = thenCall.getArguments();
  if (!first) return undefined;
  if (Node.isArrowFunction(first) || Node.isFunctionExpression(first)) return first;
  return undefined;
}

/**
 * `node`가 `handler`의 본문에 "직접" 속하는지 확인한다 — `handler`보다 안쪽에
 * 별도 함수 경계(다른 콜백, `.catch()` 핸들러, IIFE 등)를 거치지 않고 도달할 수 있어야 한다.
 * 이렇게 해야 `.catch()` 핸들러 안에 중첩된 `.then()`이나 `forEach` 콜백 안에 중첩된
 * `.then()`처럼, 바깥 `.then()`의 성공 경로와 무관한 코드까지 잘못 엮이지 않는다.
 */
function isDirectlyInHandlerBody(node: Node, handler: Node): boolean {
  let parent: Node | undefined = node.getParent();
  while (parent && parent !== handler) {
    if (isFunctionBoundary(parent)) return false;
    parent = parent.getParent();
  }
  return true;
}

/**
 * 식별자가 `PropertyAccessExpression`의 `.name` 위치(예: `data.user`의 `user`)에 있는지 확인한다.
 * sequential-await.ts의 동일 헬퍼와 같은 목적 — 이 위치의 식별자는 프로퍼티 "이름표"일 뿐
 * 값으로 평가되는 참조가 아니므로 의존성 판단에서 제외해야 한다.
 */
function isPropertyAccessName(identifier: Node): boolean {
  const parent = identifier.getParent();
  return Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier;
}

/**
 * 안쪽 프로미스 생성 표현식(`receiver`)이 바깥 핸들러 `handler`의 스코프 안에서
 * 선언된 무언가(매개변수뿐 아니라 핸들러 본문 안의 지역 변수까지)를 참조하는지 확인한다.
 *
 * 매개변수만 검사하지 않고 "handler의 소스 범위 안에 정의 지점이 있는가"로 넓게 판단하는 이유:
 * `const cached = someLookup(user); return getPosts(cached).then(...)`처럼 매개변수를 한 단계
 * 거쳐 참조하는 경우까지 놓치면, 실제로는 의존성이 있는데 독립적이라고 오판(오탐)할 수 있다.
 * 구조적 포함 관계만으로 판단하므로 값이 실제로 전파되는지까지는 증명하지 못하지만,
 * "핸들러 안에서 새로 선언된 이름을 하나라도 참조하면 의심스러우니 조용히 넘어간다"는
 * 보수적 원칙(정밀도 우선, 오탐보다 미탐을 택함)에 부합한다.
 */
function referencesHandlerScope(receiver: Node, handler: Node): boolean {
  const identifiers = receiver
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => !isPropertyAccessName(identifier));

  return identifiers.some((identifier) =>
    identifier
      .getDefinitionNodes()
      .some((def) => def.getStart() >= handler.getStart() && def.getEnd() <= handler.getEnd()),
  );
}

/**
 * 수신자가 이미 `Promise.all(...)`/`Promise.allSettled(...)`로 묶인 결과인지 확인한다.
 * 이미 병렬화되어 있으므로 이 rule이 다시 문제 삼을 대상이 아니다.
 */
function isPromiseCombinatorCall(node: Node): boolean {
  const unwrapped = unwrapParens(node);
  if (!Node.isCallExpression(unwrapped)) return false;
  const callee = unwrapped.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return false;
  const object = callee.getExpression();
  const name = callee.getName();
  return (
    Node.isIdentifier(object) &&
    object.getText() === "Promise" &&
    (name === "all" || name === "allSettled")
  );
}

function paramsText(handler: Node): string {
  if (!Node.isArrowFunction(handler) && !Node.isFunctionExpression(handler)) return "";
  return handler
    .getParameters()
    .map((p) => p.getText())
    .join(", ");
}

function createFinding(
  outerCall: Node,
  nestedCall: Node,
  outerHandler: Node,
  outerReceiverText: string,
  innerReceiverText: string,
  context: AnalysisContext,
): Finding {
  const { line, column } = context.sourceFile.getLineAndColumnAtPos(outerCall.getStart());

  const outerParams = paramsText(outerHandler) || "_outerResult";
  const innerHandler = getInlineHandler(nestedCall);
  const innerParams = (innerHandler ? paramsText(innerHandler) : "") || "innerResult";

  return {
    rule: RULE_NAME,
    severity: "warning",
    file: context.filePath,
    line,
    column,
    message: "Independent .then() chain nested inside another .then() callback.",
    reason:
      "The inner call does not reference anything from the outer callback's scope, so it could " +
      "start at the same time as the outer promise. Nesting it inside the outer .then() instead " +
      "delays it until the outer promise resolves, making total latency the sum of both instead " +
      "of the maximum.",
    suggestion: [
      `Promise.all([${outerReceiverText}, ${innerReceiverText}]).then(([${outerParams}, ${innerParams}]) => { /* use both results together */ });`,
      "Keep the nesting only if the inner call genuinely needs data produced by the outer result.",
    ],
    code: nestedCall.getText(),
  };
}

/**
 * `A().then(a => B().then(b => ...))` 형태 — 독립적인 두 비동기 작업이 `.then()` 콜백
 * 안에 중첩되어 실제로는 순차 실행되는 패턴을 탐지한다.
 *
 * `sequential-await`가 같은 개념(서로 의존하지 않는 두 비동기 작업이 병렬화 가능한데도
 * 순차 배치됨)을 `await` 문법(문장 리스트)에서 다루는 것과 짝을 이루지만, `.then()` 체인은
 * "중첩된 콜백 표현식"이라는 근본적으로 다른 AST 형태를 가지므로 별도 rule로 분리했다
 * (no-await-in-loop/no-foreach-async/no-async-reduce처럼 개념이 겹쳐도 별도 rule을
 * 유지해온 이 프로젝트의 전례를 따른다).
 *
 * 이 rule은 바깥 `.then()` 핸들러의 인라인 콜백 본문에 "직접" 중첩된(별도 함수 경계를
 * 거치지 않은) `.then()` 호출만 후보로 본다 — 따라서 `.catch()` 핸들러 안에 중첩된
 * `.then()`이나 순수 에러 복구 목적의 `.catch()` 전용 중첩은 애초에 탐색 범위에
 * 들어오지 않는다(별도 특례 코드 없이 탐색 범위 제한 자체로 오탐을 회피).
 */
export const sequentialThenRule: AsyncDoctorRule = {
  name: RULE_NAME,
  description:
    "Detects an independent .then() chain nested inside another .then() callback, forcing it to " +
    "wait for the outer promise even though it does not depend on the outer result.",
  severity: "warning",

  analyze(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];

    for (const outerCall of context.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const outerReceiver = getThenReceiver(outerCall);
      if (!outerReceiver) continue;

      const outerHandler = getInlineHandler(outerCall);
      if (!outerHandler) continue;

      const nestedCandidates = outerHandler
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(
          (call) =>
            getThenReceiver(call) !== undefined && isDirectlyInHandlerBody(call, outerHandler),
        );

      for (const nested of nestedCandidates) {
        const innerReceiver = getThenReceiver(nested);
        if (!innerReceiver) continue;

        // 이미 Promise.all/allSettled로 묶여 있으면 이 rule이 다시 문제 삼지 않는다
        if (isPromiseCombinatorCall(innerReceiver)) continue;
        // 바깥 매개변수를 인자로 쓰거나(예: getPosts(user.id)) 클로저로 참조하는 경우
        // (예: user.getPosts()) 또는 핸들러 본문의 지역 변수를 경유해 참조하는 경우는
        // 진짜 순차 의존성이므로 제외한다
        if (referencesHandlerScope(innerReceiver, outerHandler)) continue;

        findings.push(
          createFinding(
            outerCall,
            nested,
            outerHandler,
            outerReceiver.getText(),
            innerReceiver.getText(),
            context,
          ),
        );
      }
    }

    return findings;
  },
};
