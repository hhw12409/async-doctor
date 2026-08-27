import type { SourceFile } from "ts-morph";
import type { Finding } from "../core/types.js";

/**
 * 인라인 억제 코멘트 문법 (ESLint의 `eslint-disable-next-line`과 동일한 개념).
 *
 *   // async-doctor-disable-next-line
 *   // async-doctor-disable-next-line rule-a, rule-b
 *   // async-doctor-disable-line
 *   // async-doctor-disable-line rule-a
 *
 * `/* ... *\/` 블록 주석 형태도 동일하게 지원한다 (예: `/* async-doctor-disable-next-line *\/`).
 *
 * - `disable-next-line`: 주석이 있는 줄의 **다음 줄**에서 탐지를 억제한다.
 * - `disable-line`: 주석과 **같은 줄**(보통 코드 뒤에 붙는 trailing comment)에서 탐지를 억제한다.
 * - rule 이름을 쉼표로 나열하면 해당 rule만 억제하고, 생략하면 그 줄의 모든 rule을 억제한다.
 * - 존재하지 않는 rule 이름(오타 등)을 적어도 에러 없이 조용히 아무 효과가 없다 — 검증하지 않는다(알려진 한계, 의도된 스코프 제한).
 *
 * 반드시 실제 구문적 주석(syntactic comment)만 인식한다 — 문자열/템플릿 리터럴 안에 우연히
 * 같은 텍스트가 들어있어도 주석으로 오인하지 않는다. 이를 위해 `sourceFile.getFullText()`에
 * 정규식을 직접 돌리는 방식(naive string search)은 절대 쓰지 않고, ts-morph의 comment range API
 * (`Node.getLeadingCommentRanges()` / `getTrailingCommentRanges()`)로 실제 트리비아만 순회한다.
 */

export interface Suppression {
  /** 1-based, 억제 대상 줄 */
  line: number;
  rules: Set<string> | "all";
}

const DIRECTIVE_PATTERN = /^async-doctor-disable-(next-line|line)(?:\s+(.+))?$/;

interface CommentRangeLike {
  getPos(): number;
  getEnd(): number;
}

/**
 * `//`, `/* ... *\/` 주석 구분자를 벗겨 순수 지시문 텍스트만 남긴다.
 */
function stripCommentDelimiters(rawText: string): string {
  if (rawText.startsWith("//")) {
    return rawText.slice(2);
  }
  if (rawText.startsWith("/*")) {
    const withoutOpen = rawText.slice(2);
    return withoutOpen.endsWith("*/") ? withoutOpen.slice(0, -2) : withoutOpen;
  }
  return rawText;
}

function parseDirective(
  commentText: string,
): { kind: "next-line" | "line"; rulesPart?: string } | undefined {
  const match = DIRECTIVE_PATTERN.exec(commentText.trim());
  if (!match) return undefined;

  const kind = match[1] as "next-line" | "line";
  const rulesPart = match[2]?.trim();
  return rulesPart ? { kind, rulesPart } : { kind };
}

/**
 * 소스 파일 전체에서 억제 지시문 주석을 수집한다.
 *
 * `sourceFile.forEachDescendant()`로 모든 노드를 순회하며 각 노드의 leading/trailing
 * comment range를 모은다. 중첩된 노드들이 같은 위치(pos)에서 시작/종료하는 경우 동일한
 * comment range가 여러 노드에서 leading/trailing으로 반복 관측될 수 있으므로,
 * comment range의 시작 위치(getPos())로 dedupe한다.
 */
export function collectSuppressions(sourceFile: SourceFile): Suppression[] {
  const fullText = sourceFile.getFullText();
  const seenPos = new Set<number>();
  const suppressions: Suppression[] = [];

  const processRange = (range: CommentRangeLike): void => {
    const pos = range.getPos();
    if (seenPos.has(pos)) return;
    seenPos.add(pos);

    const rawText = fullText.slice(pos, range.getEnd());
    const commentText = stripCommentDelimiters(rawText);
    const directive = parseDirective(commentText);
    if (!directive) return;

    const rules: Set<string> | "all" = directive.rulesPart
      ? new Set(
          directive.rulesPart
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name.length > 0),
        )
      : "all";

    const { line: commentLine } = sourceFile.getLineAndColumnAtPos(pos);
    const line = directive.kind === "next-line" ? commentLine + 1 : commentLine;

    suppressions.push({ line, rules });
  };

  sourceFile.forEachDescendant((node) => {
    for (const range of node.getLeadingCommentRanges()) {
      processRange(range);
    }
    for (const range of node.getTrailingCommentRanges()) {
      processRange(range);
    }
  });

  return suppressions;
}

/** finding이 수집된 suppression 목록에 의해 억제되어야 하는지 판단한다. */
export function isSuppressed(finding: Finding, suppressions: Suppression[]): boolean {
  return suppressions.some(
    (suppression) =>
      suppression.line === finding.line &&
      (suppression.rules === "all" || suppression.rules.has(finding.rule)),
  );
}
