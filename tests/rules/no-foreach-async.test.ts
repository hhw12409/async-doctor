import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { noForEachAsyncRule } from "../../src/rules/no-foreach-async.js";
import type { Finding } from "../../src/core/types.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/no-foreach-async",
);

/** 이 rule만 주입해 실행한다 — 다른 rule의 Finding이 섞여 개수 단언이 우연히 맞는 것을 막는다 */
function analyzeFixture(name: string): Finding[] {
  return analyze([path.join(FIXTURE_DIR, `${name}.ts`)], { rules: [noForEachAsyncRule] });
}

describe("no-foreach-async", () => {
  describe("positive — 탐지되어야 하는 패턴", () => {
    it("배열 변수의 forEach(async ...)를 forEach 식별자 위치에서 탐지한다", () => {
      const findings = analyzeFixture("positive-array-variable");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-foreach-async");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(4);
      expect(findings[0].column).toBe(9);
      expect(findings[0].file).toBe(path.join(FIXTURE_DIR, "positive-array-variable.ts"));
      expect(findings[0].message).toBe("forEach() does not wait for its async callback.");
    });

    it("배열 리터럴의 forEach(async ...)를 탐지한다", () => {
      const findings = analyzeFixture("positive-array-literal");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-foreach-async");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(4);
      expect(findings[0].column).toBe(13);
    });

    it("readonly 배열 파라미터의 forEach(async ...)를 탐지한다", () => {
      const findings = analyzeFixture("positive-readonly-array");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-foreach-async");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(4);
      expect(findings[0].column).toBe(9);
    });

    it("Array<T> 제네릭 파라미터 타입의 forEach(async ...)를 탐지한다", () => {
      const findings = analyzeFixture("positive-array-generic-param");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-foreach-async");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(4);
      expect(findings[0].column).toBe(9);
    });

    it("Finding에 Promise.all/for-of 개선 제안과 호출 스니펫을 담는다", () => {
      const [finding] = analyzeFixture("positive-array-variable");

      expect(finding.suggestion?.[0]).toContain("Promise.all(items.map(async (item)");
      expect(finding.suggestion?.[1]).toContain("for (const item of items)");
      expect(finding.code).toContain("items.forEach(async (item) => {");
      expect(finding.reason).toBeTruthy();
    });
  });

  describe("negative — 탐지되면 안 되는 패턴", () => {
    it("Set.forEach는 배열이 아니므로 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-set-foreach")).toEqual([]);
    });

    it("Map.forEach는 배열이 아니므로 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-map-foreach")).toEqual([]);
    });

    it("NodeList.forEach는 배열이 아니므로 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-nodelist-foreach")).toEqual([]);
    });

    it("동명의 커스텀 forEach 메서드는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-custom-foreach")).toEqual([]);
    });

    it("콜백이 async가 아닌 일반 forEach는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-sync-callback")).toEqual([]);
    });

    it("async 콜백이지만 내부에 await가 없으면 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-no-await-in-callback")).toEqual([]);
    });

    it(".map/.reduce 등 forEach가 아닌 다른 배열 메서드는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-other-array-method")).toEqual([]);
    });
  });
});
