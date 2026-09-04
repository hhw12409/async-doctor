import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { sequentialThenRule } from "../../src/rules/sequential-then.js";
import type { Finding } from "../../src/core/types.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/sequential-then",
);

/** 이 rule만 주입해 다른 rule의 Finding이 섞이지 않게 한다 */
function analyzeFixture(name: string): Finding[] {
  return analyze([path.join(FIXTURE_DIR, `${name}.ts`)], { rules: [sequentialThenRule] });
}

describe("sequential-then", () => {
  describe("positive — 탐지되어야 하는 패턴", () => {
    it("바깥 매개변수에 의존하지 않는 중첩 .then()을 탐지한다", () => {
      const findings = analyzeFixture("positive-independent");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("sequential-then");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(2);
      expect(findings[0].column).toBe(10);
      expect(findings[0].file).toBe(path.join(FIXTURE_DIR, "positive-independent.ts"));
      expect(findings[0].message).toBe(
        "Independent .then() chain nested inside another .then() callback.",
      );
      expect(findings[0].code).toBe(
        "getPosts().then((posts) => {\n      return render(user, posts);\n    })",
      );
      expect(findings[0].suggestion?.[0]).toBe(
        "Promise.all([getUser(), getPosts()]).then(([user, posts]) => { /* use both results together */ });",
      );
    });

    it(".catch()가 뒤에 체이닝되어도 독립적인 중첩 .then()은 여전히 탐지한다", () => {
      const findings = analyzeFixture("positive-catch-chained");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("sequential-then");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(2);
      expect(findings[0].column).toBe(10);
      expect(findings[0].code).toBe("getPosts()\n      .then((posts) => render(user, posts))");
      expect(findings[0].suggestion?.[0]).toBe(
        "Promise.all([getUser(), getPosts()]).then(([user, posts]) => { /* use both results together */ });",
      );
    });

    it("같은 핸들러 안에 나란히 있는 독립 중첩 .then() 2개는 각각 별도 Finding으로 보고한다", () => {
      const findings = analyzeFixture("positive-two-independent-nested");

      expect(findings).toHaveLength(2);
      for (const finding of findings) {
        expect(finding.rule).toBe("sequential-then");
        expect(finding.severity).toBe("warning");
        expect(finding.line).toBe(2);
      }
      expect(findings[0].code).toBe("getPosts().then((posts) => render(user, posts))");
      expect(findings[1].code).toBe("getStats().then((stats) => renderStats(user, stats))");
      expect(findings[0].suggestion?.[0]).toBe(
        "Promise.all([getUser(), getPosts()]).then(([user, posts]) => { /* use both results together */ });",
      );
      expect(findings[1].suggestion?.[0]).toBe(
        "Promise.all([getUser(), getStats()]).then(([user, stats]) => { /* use both results together */ });",
      );
    });
  });

  describe("negative — 탐지되면 안 되는 패턴", () => {
    it("안쪽 호출이 바깥 매개변수의 프로퍼티를 인자로 사용하면 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-dependent-arg")).toEqual([]);
    });

    it("안쪽 호출이 바깥 매개변수 전체를 그대로 인자로 전달해도 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-dependent-arg-whole-param")).toEqual([]);
    });

    it("안쪽 프로미스 생성 호출이 바깥 매개변수의 메서드(클로저)여도 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-closure-method")).toEqual([]);
    });

    it("이미 Promise.all로 묶인 중첩은 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-promise-all")).toEqual([]);
    });

    it(".catch() 전용 중첩(안쪽에 .then()이 없음)은 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-catch-only")).toEqual([]);
    });

    it("바깥 매개변수를 경유한 지역 변수 간접 의존은 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-local-variable-indirect")).toEqual([]);
    });

    it("중첩 .then()이 forEach 콜백처럼 별도 함수 경계 안에 있으면 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-foreach-nested")).toEqual([]);
    });

    it("바깥 핸들러가 인라인 함수가 아닌 식별자 참조면 탐지하지 않는다(의도된 false negative)", () => {
      expect(analyzeFixture("negative-identifier-handler")).toEqual([]);
    });
  });
});
