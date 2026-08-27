import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  collectSuppressions,
  isSuppressed,
  type Suppression,
} from "../../src/analyzer/suppressions.js";
import type { Finding } from "../../src/core/types.js";

/**
 * ts-morph `Project`로 임시(인메모리) 소스 파일을 만들어 순수 함수만 검증한다.
 * 디스크 fixture가 필요 없는 단위 테스트라서 라인 번호를 직접 통제하기 위해
 * 배열을 `\n`으로 join하는 방식으로 소스를 구성한다 (템플릿 리터럴의 선행 개행이
 * 라인 번호를 밀리는 것을 피하기 위함).
 */
function sourceFileFor(lines: string[]) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("virtual.ts", lines.join("\n"));
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    rule: "rule-a",
    severity: "warning",
    file: "virtual.ts",
    line: 1,
    column: 1,
    message: "message",
    ...overrides,
  };
}

describe("collectSuppressions / isSuppressed", () => {
  it("disable-next-line(rule 없음)은 다음 줄의 모든 rule을 억제한다", () => {
    const sourceFile = sourceFileFor([
      "function f() {",
      "  // async-doctor-disable-next-line",
      "  doSomething();",
      "}",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    expect(suppressions).toEqual<Suppression[]>([{ line: 3, rules: "all" }]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 3 }), suppressions)).toBe(true);
    expect(isSuppressed(makeFinding({ rule: "rule-b", line: 3 }), suppressions)).toBe(true);
    // 코멘트가 있는 줄 자체나 다른 줄은 영향받지 않는다
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 2 }), suppressions)).toBe(false);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 4 }), suppressions)).toBe(false);
  });

  it("disable-next-line rule-a는 지정 rule만 억제하고 다른 rule은 통과시킨다", () => {
    const sourceFile = sourceFileFor([
      "function f() {",
      "  // async-doctor-disable-next-line rule-a",
      "  doSomething();",
      "}",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    expect(suppressions).toEqual<Suppression[]>([{ line: 3, rules: new Set(["rule-a"]) }]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 3 }), suppressions)).toBe(true);
    expect(isSuppressed(makeFinding({ rule: "rule-b", line: 3 }), suppressions)).toBe(false);
  });

  it("disable-next-line rule-a, rule-b는 여러 rule을 동시에 억제한다", () => {
    const sourceFile = sourceFileFor([
      "function f() {",
      "  // async-doctor-disable-next-line rule-a, rule-b",
      "  doSomething();",
      "}",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    expect(suppressions).toEqual<Suppression[]>([
      { line: 3, rules: new Set(["rule-a", "rule-b"]) },
    ]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 3 }), suppressions)).toBe(true);
    expect(isSuppressed(makeFinding({ rule: "rule-b", line: 3 }), suppressions)).toBe(true);
    expect(isSuppressed(makeFinding({ rule: "rule-c", line: 3 }), suppressions)).toBe(false);
  });

  it("disable-line(rule 없음)은 같은 줄(trailing)의 모든 rule을 억제한다", () => {
    const sourceFile = sourceFileFor([
      "function f() {",
      "  doSomething(); // async-doctor-disable-line",
      "}",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    expect(suppressions).toEqual<Suppression[]>([{ line: 2, rules: "all" }]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 2 }), suppressions)).toBe(true);
    expect(isSuppressed(makeFinding({ rule: "rule-z", line: 2 }), suppressions)).toBe(true);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 3 }), suppressions)).toBe(false);
  });

  it("disable-line rule-a는 같은 줄에서 지정 rule만 억제한다", () => {
    const sourceFile = sourceFileFor([
      "function f() {",
      "  doSomething(); // async-doctor-disable-line rule-a",
      "}",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    expect(suppressions).toEqual<Suppression[]>([{ line: 2, rules: new Set(["rule-a"]) }]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 2 }), suppressions)).toBe(true);
    expect(isSuppressed(makeFinding({ rule: "rule-b", line: 2 }), suppressions)).toBe(false);
  });

  it("블록 주석 `/* async-doctor-disable-next-line */` 형태도 동일하게 동작한다", () => {
    const sourceFile = sourceFileFor([
      "function f() {",
      "  /* async-doctor-disable-next-line */",
      "  doSomething();",
      "}",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    expect(suppressions).toEqual<Suppression[]>([{ line: 3, rules: "all" }]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 3 }), suppressions)).toBe(true);
  });

  it("블록 주석 disable-line rule 지정 형태도 동작한다", () => {
    const sourceFile = sourceFileFor([
      "function f() {",
      "  doSomething(); /* async-doctor-disable-line rule-a */",
      "}",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    expect(suppressions).toEqual<Suppression[]>([{ line: 2, rules: new Set(["rule-a"]) }]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 2 }), suppressions)).toBe(true);
    expect(isSuppressed(makeFinding({ rule: "rule-b", line: 2 }), suppressions)).toBe(false);
  });

  it("존재하지 않는 rule 이름을 적어도 에러 없이 조용히 아무 효과가 없다", () => {
    const sourceFile = sourceFileFor([
      "function f() {",
      "  // async-doctor-disable-next-line typo-rule-name",
      "  doSomething();",
      "}",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    // suppression 자체는 typo-rule-name을 담은 채로 수집된다 (검증하지 않음)
    expect(suppressions).toEqual<Suppression[]>([{ line: 3, rules: new Set(["typo-rule-name"]) }]);
    // 하지만 실제 rule(rule-a)에는 아무 효과가 없다
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 3 }), suppressions)).toBe(false);
  });

  it("보안/정확성 회귀: 문자열 리터럴 안의 동일 텍스트는 주석으로 오인하지 않는다", () => {
    const sourceFile = sourceFileFor([
      'const s = "// async-doctor-disable-next-line";',
      "doSomething();",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    // 실제 구문적 주석이 하나도 없으므로 suppression도 전혀 수집되지 않아야 한다
    expect(suppressions).toEqual([]);
    // naive string search였다면 다음 줄(2번째 줄)이 억제됐을 것 — 정상적으로 탐지되어야 한다
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 2 }), suppressions)).toBe(false);
  });

  it("보안/정확성 회귀: 템플릿 리터럴 안의 동일 텍스트도 무시된다", () => {
    const sourceFile = sourceFileFor([
      "const s = `// async-doctor-disable-line`;",
      "doSomething();",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    expect(suppressions).toEqual([]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 1 }), suppressions)).toBe(false);
  });

  it("파일 마지막 줄의 disable-next-line은 다음 줄이 없어도 크래시하지 않는다", () => {
    const sourceFile = sourceFileFor(["doSomething();", "// async-doctor-disable-next-line"]);

    let suppressions: Suppression[] = [];
    expect(() => {
      suppressions = collectSuppressions(sourceFile);
    }).not.toThrow();

    // 존재하지 않는 3번째 줄을 가리키는 suppression이 생기지만 아무 finding도 거기 없으므로 무효과
    expect(suppressions).toEqual<Suppression[]>([{ line: 3, rules: "all" }]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 1 }), suppressions)).toBe(false);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 2 }), suppressions)).toBe(false);
  });

  it("같은 주석이 인접 문장의 leading/trailing으로 중복 관측되어도 dedupe되어 Suppression이 하나만 생긴다", () => {
    // `// async-doctor-disable-next-line`은 a();의 trailing comment이자 b();의 leading comment로
    // ts-morph forEachDescendant 순회 중 두 번 관측될 수 있는 전형적인 위치다.
    const sourceFile = sourceFileFor([
      "function f() {",
      "  a();",
      "  // async-doctor-disable-next-line",
      "  b();",
      "}",
    ]);

    const suppressions = collectSuppressions(sourceFile);

    expect(suppressions).toEqual<Suppression[]>([{ line: 4, rules: "all" }]);
    expect(isSuppressed(makeFinding({ rule: "rule-a", line: 4 }), suppressions)).toBe(true);
  });
});
