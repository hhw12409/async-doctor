import { Node, SyntaxKind } from "ts-morph";
import type { AnalysisContext, AsyncDoctorRule, Finding } from "../core/types.js";

const RULE_NAME = "no-async-reduce";

/**
 * 함수 경계 노드인지 판별한다.
 * no-foreach-async.ts / no-await-in-loop.ts의 동일 헬퍼와 같은 목적 — await에서
 * 상위로 올라가다 대상(여기서는 reduce 콜백)보다 먼저 이 노드를 만나면, 그 await는
 * 이 콜백이 아니라 콜백 안에 중첩된 또 다른 함수(IIFE 등)의 실행 흐름에 속한다.
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
 * 콜백 함수 본문에 직접 속한(콜백보다 안쪽에 별도 함수 경계가 없는) await가
 * 하나라도 있는지 확인한다. 콜백이 `async`라도 내부에서 실제로 await하는 게 없다면
 * 반복 간 순차 실행을 강제하는 "누산기 promise를 다시 await" 하는 병목 자체가
 * 발생하지 않으므로 탐지 대상에서 제외한다. 콜백 안에 또 다른 async IIFE를 만들어
 * 그 안에서만 await하는 경우도, reduce 자체가 문제가 아니라 이미 별도로 처리 중인
 * 패턴이므로 제외한다.
 */
function hasDirectAwait(callback: Node): boolean {
  return callback.getDescendantsOfKind(SyntaxKind.AwaitExpression).some((awaitExpr) => {
    let parent: Node | undefined = awaitExpr.getParent();
    while (parent && parent !== callback) {
      if (isFunctionBoundary(parent)) return false;
      parent = parent.getParent();
    }
    return true;
  });
}

/**
 * `.reduce`를 호출하는 대상이 실제로 배열(또는 튜플)인지 타입 체커로 확인한다.
 * `Map`이나 동명의 커스텀 `reduce` 메서드를 가진 클래스(RxJS Observable, lodash wrapper 등)는
 * reduce의 시그니처와 반환값 처리 방식이 다를 수 있으므로, Array.prototype.reduce라고
 * 확신할 수 있을 때만 탐지한다 (오탐 회피). 타입을 알 수 없는 경우(`any`, 미해석 등)도
 * 보수적으로 제외한다.
 */
function isArrayLikeReceiver(expression: Node): boolean {
  const type = expression.getType();
  return type.isArray() || type.isTuple();
}

/**
 * `array.reduce(async (acc, item) => { ... await ... })` 패턴을 탐지한다.
 *
 * async 리듀서는 매 호출이 이전 반복이 반환한 accumulator promise를 await한 뒤에야
 * 자신의 비동기 작업을 시작할 수 있다. 그 결과 N개 항목이 엄격히 순차 실행되고,
 * 전체 지연이 항목 수에 비례해 늘어난다 — 대부분의 경우 각 항목의 비동기 작업은
 * 서로 독립이라 `Promise.all(arr.map(...))`로 병렬화한 뒤 동기 reduce로 합칠 수 있다.
 */
export const noAsyncReduceRule: AsyncDoctorRule = {
  name: RULE_NAME,
  description:
    "Detects Array.prototype.reduce()/reduceRight() called with an async callback that awaits inside the reducer, forcing strictly sequential iteration.",
  severity: "warning",

  analyze(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];

    for (const call of context.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) continue;
      const methodName = callee.getName();
      if (methodName !== "reduce" && methodName !== "reduceRight") continue;
      if (!isArrayLikeReceiver(callee.getExpression())) continue;

      const [callback] = call.getArguments();
      if (!callback) continue;
      if (!Node.isArrowFunction(callback) && !Node.isFunctionExpression(callback)) continue;
      if (!callback.isAsync()) continue;
      if (!hasDirectAwait(callback)) continue;

      const nameNode = callee.getNameNode();
      const { line, column } = context.sourceFile.getLineAndColumnAtPos(nameNode.getStart());

      const arrayText = callee.getExpression().getText();
      // reduce 콜백은 첫 파라미터가 accumulator, 두 번째가 현재 항목이다.
      // `.map(...)` 제안에 쓸 이름은 "현재 항목"인 두 번째 파라미터가 맞다.
      const itemName = callback.getParameters()[1]?.getName() ?? "item";

      findings.push({
        rule: RULE_NAME,
        severity: "warning",
        file: context.filePath,
        line,
        column,
        message: "reduce() with an async callback forces sequential iteration.",
        reason:
          "An async reducer returns a promise as its accumulator, so every call must await the " +
          "previous iteration's accumulator promise before it can start its own work. The N items " +
          "therefore run strictly one after another and the total latency grows in proportion to " +
          "the number of items.",
        suggestion: [
          `const values = await Promise.all(${arrayText}.map(async (${itemName}) => { /* ... */ })); ` +
            "then fold them with a synchronous reduce // if the iterations are independent",
          "Keep the async reduce only if each iteration genuinely needs the resolved result of the previous one.",
        ],
        code: call.getText(),
      });
    }

    return findings;
  },
};
