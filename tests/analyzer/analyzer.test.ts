import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { sequentialAwaitRule } from "../../src/rules/sequential-await.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/suppressions",
);

/**
 * sequential-await 하나만 주입해 실행한다 — 억제 코멘트의 효과와 무관한 다른 rule의
 * Finding이 섞여 개수 단언을 흔드는 것을 막는다.
 */
function analyzeFixture(name: string) {
  return analyze([path.join(FIXTURE_DIR, `${name}.ts`)], { rules: [sequentialAwaitRule] });
}

describe("analyze() — 인라인 억제 코멘트 통합", () => {
  it("억제 코멘트가 없으면 정상적으로 finding이 탐지된다 (대조군)", () => {
    const findings = analyzeFixture("no-suppression-control");

    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("sequential-await");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].line).toBe(2);
  });

  it("// async-doctor-disable-next-line(rule 없음)은 다음 줄의 finding을 억제한다", () => {
    const findings = analyzeFixture("next-line-all");

    expect(findings).toHaveLength(0);
  });

  it("disable-next-line sequential-await는 일치하는 rule의 finding을 억제한다", () => {
    const findings = analyzeFixture("next-line-matching-rule");

    expect(findings).toHaveLength(0);
  });

  it("disable-next-line no-await-in-loop는 다른 rule(sequential-await)의 finding을 억제하지 않는다", () => {
    const findings = analyzeFixture("next-line-other-rule");

    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("sequential-await");
    expect(findings[0].line).toBe(3);
  });

  it("// async-doctor-disable-line(같은 줄 trailing)은 그 줄의 finding을 억제한다", () => {
    const findings = analyzeFixture("disable-line");

    expect(findings).toHaveLength(0);
  });

  it("보안/정확성 회귀: 문자열 리터럴 안의 동일 텍스트는 억제 효과가 없다 (finding이 정상 탐지된다)", () => {
    const findings = analyzeFixture("string-literal-lookalike");

    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("sequential-await");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].line).toBe(3);
  });
});
