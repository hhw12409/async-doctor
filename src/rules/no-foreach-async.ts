import { Node, SyntaxKind } from "ts-morph";
import type { AnalysisContext, AsyncDoctorRule, Finding } from "../core/types.js";

const RULE_NAME = "no-foreach-async";

/**
 * 함수 경계 노드인지 판별한다.
 * no-await-in-loop.ts의 동일 헬퍼와 같은 목적 — await에서 상위로 올라가다
 * 대상(여기서는 forEach 콜백)보다 먼저 이 노드를 만나면, 그 await는
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
 * "완료를 기다리지 못하는" 문제 자체가 발생하지 않으므로 탐지 대상에서 제외한다.
 * 콜백 안에 또 다른 async IIFE를 만들어 그 안에서만 await하는 경우도,
 * forEach 자체가 문제가 아니라 이미 별도로 처리 중인 패턴이므로 제외한다.
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
 * `.forEach`를 호출하는 대상이 실제로 배열(또는 튜플)인지 타입 체커로 확인한다.
 * `Set`/`Map`/`NodeList`나 동명의 커스텀 메서드를 가진 클래스는 forEach의 의미와
 * 반환값 처리 방식이 다를 수 있으므로, Array.prototype.forEach라고 확신할 수 있을 때만
 * 탐지한다 (오탐 회피). 타입을 알 수 없는 경우(`any`, 미해석 등)도 보수적으로 제외한다.
 */
function isArrayLikeReceiver(expression: Node): boolean {
  const type = expression.getType();
  return type.isArray() || type.isTuple();
}

/**
 * `array.forEach(async (item) => { await ... })` 패턴을 탐지한다.
 *
 * forEach는 콜백이 반환하는 Promise를 기다리지 않는다. 콜백을 async로 표시해도
 * forEach 호출 자체는 즉시 다음 코드로 넘어가므로:
 * - 반복 간 순서 보장이 사라지고 (순차 처리를 의도했어도 실제로는 fire-and-forget)
 * - 병렬 처리를 의도했어도 전체 완료 시점을 알 방법이 없으며
 * - 콜백 내부에서 발생한 rejection이 `unhandledRejection`으로 새어나간다.
 */
export const noForEachAsyncRule: AsyncDoctorRule = {
  name: RULE_NAME,
  description:
    "Detects Array.prototype.forEach() called with an async callback whose returned promise is never awaited.",
  severity: "warning",

  analyze(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];

    for (const call of context.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) continue;
      if (callee.getName() !== "forEach") continue;
      if (!isArrayLikeReceiver(callee.getExpression())) continue;

      const [callback] = call.getArguments();
      if (!callback) continue;
      if (!Node.isArrowFunction(callback) && !Node.isFunctionExpression(callback)) continue;
      if (!callback.isAsync()) continue;
      if (!hasDirectAwait(callback)) continue;

      const nameNode = callee.getNameNode();
      const { line, column } = context.sourceFile.getLineAndColumnAtPos(nameNode.getStart());

      const arrayText = callee.getExpression().getText();
      const paramName = callback.getParameters()[0]?.getName() ?? "item";

      findings.push({
        rule: RULE_NAME,
        severity: "warning",
        file: context.filePath,
        line,
        column,
        message: "forEach() does not wait for its async callback.",
        reason:
          "Array.prototype.forEach() ignores the promise returned by an async callback, so the " +
          "loop returns before any iteration's await settles — completion order isn't guaranteed " +
          "and a rejected promise becomes an unhandled rejection instead of a catchable error.",
        suggestion: [
          `await Promise.all(${arrayText}.map(async (${paramName}) => { /* ... */ })); ` +
            "// if the iterations are independent",
          `for (const ${paramName} of ${arrayText}) { /* await ... */ } ` +
            "// if each iteration must run after the previous one",
        ],
        code: call.getText(),
      });
    }

    return findings;
  },
};
