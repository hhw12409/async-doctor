import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { noAwaitInLoopRule } from "../../src/rules/no-await-in-loop.js";
import type { Finding } from "../../src/core/types.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/no-await-in-loop",
);

/**
 * 이 rule만 주입해 실행한다 — 같은 fixture에 다른 rule이 반응해
 * 개수 단언이 우연히 맞아떨어지는 것을 막는다.
 */
function analyzeFixture(name: string): Finding[] {
  return analyze([path.join(FIXTURE_DIR, `${name}.ts`)], { rules: [noAwaitInLoopRule] });
}

describe("no-await-in-loop", () => {
  describe("positive — 탐지되어야 하는 패턴", () => {
    it("for-of 본문의 await를 await 키워드 위치에서 탐지한다", () => {
      const findings = analyzeFixture("positive-for-of");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-await-in-loop");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(5);
      expect(findings[0].column).toBe(5);
      expect(findings[0].file).toBe(path.join(FIXTURE_DIR, "positive-for-of.ts"));
      expect(findings[0].message).toBe("Sequential async operation detected inside loop.");
    });

    it("while 본문의 await를 탐지한다", () => {
      const findings = analyzeFixture("positive-while");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-await-in-loop");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(6);
      expect(findings[0].column).toBe(5);
    });

    it("중첩 루프에서는 가장 안쪽 루프 기준으로 정확히 1건만 보고한다", () => {
      const findings = analyzeFixture("positive-nested-loop");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-await-in-loop");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(6);
      expect(findings[0].column).toBe(7);
    });

    it("Finding에 개선 제안과 감싸는 루프 스니펫을 담는다", () => {
      const [finding] = analyzeFixture("positive-for-of");

      expect(finding.suggestion?.[0]).toContain("Promise.all");
      expect(finding.code).toContain("for (const item of items)");
      expect(finding.reason).toBeTruthy();
    });

    it("(d) do-while 본문의 await를 탐지한다", () => {
      const findings = analyzeFixture("positive-do-while");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-await-in-loop");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(7);
      expect(findings[0].column).toBe(5);
      expect(findings[0].code).toContain("do {");
    });
  });

  describe("negative — 탐지되면 안 되는 패턴", () => {
    it("이미 Promise.all로 병렬화된 코드는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-parallel-already")).toEqual([]);
    });

    it("콜백(중첩 함수) 내부의 await는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-callback-await")).toEqual([]);
    });

    it("루프 헤더(iterable 표현식)의 await는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-loop-header-await")).toEqual([]);
    });

    it("(d) do-while의 조건식 await는 본문이 아니므로 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-do-while-condition")).toEqual([]);
    });
  });
});
