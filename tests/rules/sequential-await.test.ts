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

    it("(a) 한 문장 안의 여러 선언자(const a = await f(), b = await g();)를 탐지한다", () => {
      const findings = analyzeFixture("positive-multi-declarator");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("sequential-await");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(6);
      expect(findings[0].column).toBe(3);
      expect(findings[0].suggestion?.[0]).toBe("const [a, b] = await Promise.all([f(), g()]);");
      // 형제 선언자가 statement 노드를 공유해도 code는 한 번만 담긴다(중복 제거)
      expect(findings[0].code).toBe("const a = await f(),\n    b = await g();");
    });

    it("(b) 선언 없는 표현식문(await f(); await g();)을 탐지한다", () => {
      const findings = analyzeFixture("positive-bare-awaits");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("sequential-await");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(5);
      expect(findings[0].column).toBe(3);
      expect(findings[0].suggestion?.[0]).toBe("await Promise.all([f(), g()]);");
    });

    it("(b) 선언 있는 await와 선언 없는 await가 섞인 그룹도 탐지하고, 구조 분해 구멍을 제안한다", () => {
      const findings = analyzeFixture("positive-mixed-bare-and-declared");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("sequential-await");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(6);
      expect(findings[0].column).toBe(3);
      expect(findings[0].suggestion?.[0]).toBe("const [a, ] = await Promise.all([f(), g()]);");
    });

    it("(c) 프로퍼티명이 앞 변수명과 우연히 같아도(data.user) 독립 await로 탐지한다", () => {
      const findings = analyzeFixture("positive-property-collision");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("sequential-await");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(7);
      expect(findings[0].column).toBe(3);
      expect(findings[0].suggestion?.[0]).toBe(
        "const [user, orders] = await Promise.all([getUser(), getOrders(data.user)]);",
      );
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

    it("(a) 같은 문장 안에서 뒤 선언자가 앞 선언자에 의존하면 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-multi-declarator-dependent")).toEqual([]);
    });

    it("(c) 섀도잉된 변수에 진짜로 의존하는 경우(user.id)는 여전히 탐지하지 않는다 — 회귀 확인", () => {
      expect(analyzeFixture("negative-shadowed-real-dependency")).toEqual([]);
    });
  });
});
