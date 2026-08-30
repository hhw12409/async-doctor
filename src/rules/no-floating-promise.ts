import { Node, SyntaxKind } from "ts-morph";
import type { AnalysisContext, AsyncDoctorRule, Finding } from "../core/types.js";

const RULE_NAME = "no-floating-promise";

/**
 * `(((expr)))`처럼 감싼 괄호를 모두 벗겨 실제 표현식 노드를 얻는다.
 * `(await f());`나 `(void f());`처럼 괄호로 감싸도 판단이 달라지면 안 되므로
 * 아래의 모든 판별에 앞서 항상 이 함수를 거친다.
 */
function unwrapParens(node: Node): Node {
  let current = node;
  while (Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

/**
 * 표현식의 최상위가 `.then(...)` 또는 `.catch(...)` 호출로 끝나는지 확인한다.
 * 둘 중 하나만 있어도(예: `.then()`만 있고 `.catch()`는 없음) 개발자가 이미 결과를
 * 명시적으로 처리하기로 선택한 것이므로 탐지에서 제외한다.
 *
 * `.finally(...)`만 있는 경우는 의도적으로 제외 대상에 넣지 않는다 — finally는
 * rejection을 처리하지 않고 그대로 다시 던지므로, 여전히 unhandled rejection이
 * 발생할 수 있는 진짜 floating promise다.
 */
function endsWithHandledChain(expression: Node): boolean {
  if (!Node.isCallExpression(expression)) return false;

  const callee = expression.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return false;

  const name = callee.getName();
  return name === "then" || name === "catch";
}

/**
 * 호출 표현식이 평가한 값이 `Promise`인지 타입 체커로 확인한다.
 * 텍스트나 `async` 키워드 존재 여부가 아니라 **호출 표현식 자체의 타입**을 보므로:
 * - `async function`뿐 아니라 `function foo(): Promise<void>`처럼 명시적으로
 *   Promise를 반환하는 일반 함수 호출도 동일하게 잡는다.
 * - 타입을 알 수 없는 경우(`any`, 미해석 import 등)는 심볼 이름이 "Promise"가 아니므로
 *   자동으로 false가 되어 보수적으로 제외된다(오탐보다 미탐을 택하는 프로젝트 원칙).
 * - 유니온 타입(`Promise<T> | string` 등)처럼 심볼이 하나로 확정되지 않는 경우도
 *   같은 이유로 제외된다 — 알려진 한계로 문서화.
 *   주의: `Promise<T> | undefined`는 예시로 쓰지 않는다 — analyzer.ts의 `createProject()`가
 *   `strictNullChecks`를 켜지 않으므로 TypeScript가 `undefined`를 서브타입으로 흡수해
 *   `T | undefined`가 `T`로 접혀버려, 이 케이스는 실제로는 제외되지 않고 정상 탐지된다.
 */
function isPromiseReturningCall(call: Node): boolean {
  const type = call.getType();
  const symbol = type.getSymbol();
  return symbol?.getName() === "Promise";
}

/**
 * `array.forEach(async ...)` 같은 패턴과 이 rule이 겹치지 않는 이유는 별도 로직이
 * 아니라 이 타입 체크 자체에서 자연스럽게 갈린다: `Array.prototype.forEach`의
 * 반환 타입은 항상 `void`이지 `Promise`가 아니다. 콜백이 async여도 forEach 호출
 * 표현식 자체의 타입은 여전히 void이므로 여기서 제외되고, 그 문제는 `no-foreach-async`
 * 가 콜백 내부를 별도로 검사해 담당한다. 따라서 이 파일에는 forEach 관련 예외 처리를
 * 추가하지 않는다 — 추가하면 오히려 근거 없는 특례가 된다.
 */
export const noFloatingPromiseRule: AsyncDoctorRule = {
  name: RULE_NAME,
  description:
    "Detects Promise-returning calls whose result is discarded as a bare expression statement " +
    "without await, return, storage, or .then()/.catch() handling.",
  severity: "warning",

  analyze(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];

    for (const statement of context.sourceFile.getDescendantsOfKind(
      SyntaxKind.ExpressionStatement,
    )) {
      const expression = unwrapParens(statement.getExpression());

      // 이미 await됨 — 정상 처리
      if (Node.isAwaitExpression(expression)) continue;
      // `void expr()` — 의도적 fire-and-forget 관용구, 그대로 통과
      if (Node.isVoidExpression(expression)) continue;
      // ExpressionStatement의 최상위가 호출이 아니면(할당/이미 다른 형태 등) 대상이 아님.
      // 참고로 반환문/변수 선언/인자 전달은 애초에 ExpressionStatement가 아니므로
      // 이 순회 자체에 걸리지 않는다.
      if (!Node.isCallExpression(expression)) continue;
      // `.then(...)`/`.catch(...)`로 이미 후속 처리/에러 처리가 되어 있음
      if (endsWithHandledChain(expression)) continue;
      // 호출 결과가 Promise가 아니거나(동기/void 반환) 타입을 확신할 수 없으면 제외
      if (!isPromiseReturningCall(expression)) continue;

      const { line, column } = context.sourceFile.getLineAndColumnAtPos(expression.getStart());
      const callText = expression.getText();

      findings.push({
        rule: RULE_NAME,
        severity: "warning",
        file: context.filePath,
        line,
        column,
        message: "Promise-returning call result is discarded (floating promise).",
        reason:
          "The call's result is neither awaited, returned, stored, nor chained with .catch(), so " +
          "a rejection becomes an unhandled rejection instead of a catchable error, and no code can " +
          "observe when the call actually completes.",
        suggestion: [
          `await ${callText};  // if subsequent code depends on this completing first`,
          `${callText}.catch((error) => { /* handle or log */ });  // if it's intentionally fire-and-forget`,
        ],
        code: callText,
      });
    }

    return findings;
  },
};
