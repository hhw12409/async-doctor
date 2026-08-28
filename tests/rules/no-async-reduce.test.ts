import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { noAsyncReduceRule } from "../../src/rules/no-async-reduce.js";
import type { Finding } from "../../src/core/types.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/no-async-reduce",
);

/** 이 rule만 주입해 실행한다 — 다른 rule의 Finding이 섞여 개수 단언이 우연히 맞는 것을 막는다 */
function analyzeFixture(name: string): Finding[] {
  return analyze([path.join(FIXTURE_DIR, `${name}.ts`)], { rules: [noAsyncReduceRule] });
}

describe("no-async-reduce", () => {
  describe("positive — 탐지되어야 하는 패턴", () => {
    it("배열 변수의 reduce(async ...)를 reduce 식별자 위치에서 탐지한다", () => {
      const findings = analyzeFixture("positive-array-variable");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-async-reduce");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(3);
      expect(findings[0].column).toBe(22);
      expect(findings[0].file).toBe(path.join(FIXTURE_DIR, "positive-array-variable.ts"));
      expect(findings[0].message).toBe(
        "reduce() with an async callback forces sequential iteration.",
      );
    });

    it("배열 리터럴의 reduce(async ...) (concise-body arrow)를 탐지한다", () => {
      const findings = analyzeFixture("positive-array-literal");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-async-reduce");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(3);
      expect(findings[0].column).toBe(26);
    });

    it("reduceRight(async ...)를 reduceRight 식별자 위치에서 탐지한다", () => {
      const findings = analyzeFixture("positive-reduce-right");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-async-reduce");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(3);
      expect(findings[0].column).toBe(22);
      expect(findings[0].code).toContain("reduceRight(");
    });

    it("인라인 FunctionExpression 콜백의 reduce(async function ...)를 탐지한다", () => {
      const findings = analyzeFixture("positive-function-expression-callback");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-async-reduce");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(3);
      expect(findings[0].column).toBe(22);
    });

    it("튜플 수신자의 reduce(async ...)를 탐지한다", () => {
      const findings = analyzeFixture("positive-tuple-receiver");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-async-reduce");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(3);
      expect(findings[0].column).toBe(21);
    });

    it("배열을 반환하는 메서드 체이닝(.filter(...).reduce(async ...)) 수신자도 탐지한다", () => {
      const findings = analyzeFixture("positive-chained-receiver");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-async-reduce");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(6);
      expect(findings[0].column).toBe(6);
    });

    it("Finding에 Promise.all 개선 제안과 유지 단서, reason, 호출 스니펫을 담는다", () => {
      const [finding] = analyzeFixture("positive-array-variable");

      expect(finding.suggestion?.[0]).toContain("Promise.all(items.map(async (item)");
      expect(finding.suggestion?.[1]).toBeTruthy();
      expect(finding.suggestion?.[1]).toContain("each iteration genuinely needs");
      expect(finding.reason).toBeTruthy();
      expect(finding.code).toContain("reduce(");
    });

    it("map 제안의 항목 이름으로 콜백의 두 번째 파라미터(현재 항목)를 쓴다", () => {
      const [finding] = analyzeFixture("positive-reduce-right");

      // reduce 콜백은 (accumulator, currentItem) 순 — .map 제안엔 두 번째 이름 `s`가 맞다.
      expect(finding.suggestion?.[0]).toContain("items.map(async (s)");
    });
  });

  describe("negative — 탐지되면 안 되는 패턴", () => {
    it("동기 리듀서(콜백이 async 아님)는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-sync-reducer")).toEqual([]);
    });

    it("async 콜백이지만 본문에 직접 await가 없으면 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-async-no-await")).toEqual([]);
    });

    it("동명의 커스텀 reduce 메서드를 가진 클래스는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-custom-reduce")).toEqual([]);
    });

    it("배열이 아닌 수신자(캐스팅된 Map 객체)의 reduce는 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-not-array")).toEqual([]);
    });

    it("인라인이 아닌 식별자 콜백(arr.reduce(fn, init))은 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-named-callback")).toEqual([]);
    });

    it(".map(async ...) + 뒤따르는 동기 reduce는 어느 쪽도 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-other-method")).toEqual([]);
    });

    it("await가 콜백 안 중첩 함수에만 있으면(직접 await 아님) 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-nested-await")).toEqual([]);
    });

    it("수신자 타입이 any(미해석)면 보수적으로 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-untyped-receiver")).toEqual([]);
    });
  });
});
