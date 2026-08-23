import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { sequentialAwaitRule } from "../../src/rules/sequential-await.js";
import type { Finding } from "../../src/core/types.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/sequential-await",
);

/** 이 rule만 주입해 no-await-in-loop의 Finding이 섞이지 않게 한다 */
function analyzeFixture(name: string): Finding[] {
  return analyze([path.join(FIXTURE_DIR, `${name}.ts`)], { rules: [sequentialAwaitRule] });
}

describe("sequential-await", () => {
  describe("positive — 탐지되어야 하는 패턴", () => {
    it("서로 무관한 await 2개를 묶음 첫 문장의 const 위치에서 탐지한다", () => {
      const findings = analyzeFixture("positive-independent");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("sequential-await");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(6);
      expect(findings[0].column).toBe(3);
      expect(findings[0].file).toBe(path.join(FIXTURE_DIR, "positive-independent.ts"));
      expect(findings[0].message).toBe("Independent awaits run sequentially.");
    });

    it("독립 await 3개는 묶음 단위로 1건만 보고한다", () => {
      const findings = analyzeFixture("positive-three-independent");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("sequential-await");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(7);
      expect(findings[0].column).toBe(3);
    });

    it("묶음 전체를 합친 Promise.all 제안을 생성한다", () => {
      const [two] = analyzeFixture("positive-independent");
      const [three] = analyzeFixture("positive-three-independent");

      expect(two.suggestion?.[0]).toBe(
        "const [user, inventory] = await Promise.all([getUser(), getInventory()]);",
      );
      expect(three.suggestion?.[0]).toBe(
        "const [user, inventory, orders] = await Promise.all([getUser(), getInventory(), getOrders()]);",
      );
      expect(two.code).toContain("const user = await getUser();");
      expect(two.code).toContain("const inventory = await getInventory();");
    });
  });

  describe("negative — 탐지되면 안 되는 패턴", () => {
    it("앞 결과를 인자로 전달하는 순차 처리는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-dependent-arg")).toEqual([]);
    });

    it("앞 결과의 프로퍼티(메서드)에 접근하는 순차 처리는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-dependent-property")).toEqual([]);
    });

    it("두 await 사이에 다른 문장이 끼면 연속으로 보지 않는다", () => {
      expect(analyzeFixture("negative-interrupted")).toEqual([]);
    });

    it("이미 Promise.all로 병렬화된 코드는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-already-parallel")).toEqual([]);
    });
  });
});
