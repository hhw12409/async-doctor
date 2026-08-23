import { Node, SyntaxKind } from "ts-morph";
import type { AnalysisContext, AsyncDoctorRule, Finding } from "../core/types.js";

const RULE_NAME = "no-await-in-loop";

/**
 * 함수 경계 노드인지 판별한다.
 * await에서 상위로 올라가다 루프보다 먼저 이 노드를 만나면,
 * 그 await는 루프가 아니라 콜백(중첩 함수)의 실행 흐름에 속한다.
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

/** 대상 루프(for / for-of / for-in / while)면 본문 statement를, 아니면 undefined를 반환한다 */
function getLoopBody(node: Node): Node | undefined {
  if (
    Node.isForStatement(node) ||
    Node.isForOfStatement(node) ||
    Node.isForInStatement(node) ||
    Node.isWhileStatement(node)
  ) {
    return node.getStatement();
  }
  return undefined;
}

/**
 * await를 감싸는 "가장 가까운" 루프를 찾는다. 다음 경우에는 undefined를 반환한다.
 *
 * - 루프보다 먼저 함수 경계를 만난 경우 → 콜백 내부의 await (예: items.forEach(async (i) => { await f(i); }))
 * - 루프에 도달했지만 경로가 본문이 아닌 경우 → 초기화/조건/증감식의 await
 *   (예: `for (const x of await getItems())`는 한 번만 실행되므로 병목이 아니다)
 *
 * 중첩 루프에서는 가장 안쪽 루프 하나만 반환하므로 동일한 await가 중복 보고되지 않는다.
 */
function findEnclosingLoop(awaitExpr: Node): Node | undefined {
  let child: Node = awaitExpr;
  let parent = awaitExpr.getParent();

  while (parent) {
    if (isFunctionBoundary(parent)) return undefined;

    const body = getLoopBody(parent);
    if (body) {
      return body === child ? parent : undefined;
    }

    child = parent;
    parent = parent.getParent();
  }

  return undefined;
}

/**
 * 루프 본문에서 직접 실행되는 await를 탐지한다.
 * 반복마다 이전 비동기 작업이 끝나기를 기다리므로 전체 지연이 반복 횟수에 비례해 늘어난다.
 */
export const noAwaitInLoopRule: AsyncDoctorRule = {
  name: RULE_NAME,
  description: "Detects await expressions executed sequentially inside a loop.",
  severity: "warning",

  analyze(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];

    for (const awaitExpr of context.sourceFile.getDescendantsOfKind(SyntaxKind.AwaitExpression)) {
      const loop = findEnclosingLoop(awaitExpr);
      if (!loop) continue;

      const { line, column } = context.sourceFile.getLineAndColumnAtPos(awaitExpr.getStart());

      findings.push({
        rule: RULE_NAME,
        severity: "warning",
        file: context.filePath,
        line,
        column,
        message: "Sequential async operation detected inside loop.",
        reason:
          "Each iteration waits for the previous async operation to complete, " +
          "which may significantly reduce throughput.",
        suggestion: [
          "Promise.all(items.map(item => process(item)))",
          "Or use controlled concurrency / batch processing for large item counts.",
        ],
        code: loop.getText(),
      });
    }

    return findings;
  },
};
