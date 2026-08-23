import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { VERSION } from "../../src/core/package-info.js";
import { buildJsonReport, jsonReporter } from "../../src/reporter/json-reporter.js";
import type { JsonReport } from "../../src/reporter/json-reporter.js";
import type { Finding } from "../../src/core/types.js";

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/cli");
const BOTTLENECK = path.join(FIXTURE_DIR, "bottleneck.ts");
const CLEAN = path.join(FIXTURE_DIR, "clean.ts");

/** 리포터만 단독으로 압박하기 위한 합성 Finding — rule 구현에 의존하지 않는다 */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    rule: "no-await-in-loop",
    severity: "warning",
    file: path.join(process.cwd(), "src", "sample.ts"),
    line: 12,
    column: 5,
    message: "Sequential async operation detected inside loop.",
    ...overrides,
  };
}

/** 리포터 출력은 "항상 파싱 가능한 JSON"이 계약이므로 파싱을 거쳐서만 단언한다 */
function reportAndParse(findings: Finding[], verbose = false): JsonReport {
  const output = jsonReporter.report(findings, { verbose });
  return JSON.parse(output) as JsonReport;
}

describe("json-reporter", () => {
  describe("문서 구조 — 항상 유효한 JSON", () => {
    it("findings 0건에서도 유효한 JSON 문서를 낸다 (비-JSON 특수 문자열 금지)", () => {
      const output = jsonReporter.report([], {});

      // console-reporter는 0건에 "No async bottlenecks found."를 내지만 JSON은 절대 그러면 안 된다
      expect(output).not.toContain("No async bottlenecks found.");
      expect(() => JSON.parse(output)).not.toThrow();

      const report = JSON.parse(output) as JsonReport;
      expect(report.asyncDoctorVersion).toBe(VERSION);
      expect(report.summary).toEqual({ total: 0, error: 0, warning: 0, info: 0 });
      expect(report.findings).toEqual([]);
    });

    it("findings가 있어도 파싱 가능하고 최상위 키가 3개다", () => {
      const report = reportAndParse([makeFinding()]);

      expect(Object.keys(report)).toEqual(["asyncDoctorVersion", "summary", "findings"]);
    });

    it("format 식별자는 json이고 2-space 들여쓰기로 직렬화한다", () => {
      expect(jsonReporter.format).toBe("json");
      expect(jsonReporter.report([], {})).toBe(JSON.stringify(buildJsonReport([], {}), null, 2));
      expect(jsonReporter.report([], {})).toContain('\n  "summary": {');
    });

    it("asyncDoctorVersion은 package.json에서 파생된 VERSION과 일치한다", () => {
      expect(reportAndParse([]).asyncDoctorVersion).toBe(VERSION);
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe("summary — severity별 카운트", () => {
    it("error/warning/info를 각각 세고 total과 합이 맞는다", () => {
      const findings = [
        makeFinding({ severity: "error" }),
        makeFinding({ severity: "warning" }),
        makeFinding({ severity: "warning" }),
        makeFinding({ severity: "info" }),
      ];

      const report = reportAndParse(findings);

      expect(report.summary).toEqual({ total: 4, error: 1, warning: 2, info: 1 });
      expect(report.summary.error + report.summary.warning + report.summary.info).toBe(
        report.summary.total,
      );
    });

    it("total은 verbose 여부와 무관하게 findings 길이와 같다", () => {
      const findings = [makeFinding(), makeFinding()];

      expect(reportAndParse(findings, false).summary.total).toBe(2);
      expect(reportAndParse(findings, true).summary.total).toBe(2);
      expect(reportAndParse(findings, true).findings).toHaveLength(2);
    });
  });

  describe("finding 직렬화 — 필드값", () => {
    it("rule/severity/file/line/column/message를 그대로 실어 나른다", () => {
      const report = reportAndParse([
        makeFinding({
          rule: "sequential-await",
          severity: "error",
          line: 7,
          column: 3,
          message: "Independent awaits run sequentially.",
        }),
      ]);

      const [finding] = report.findings;
      expect(finding.rule).toBe("sequential-await");
      expect(finding.severity).toBe("error");
      expect(finding.line).toBe(7);
      expect(finding.column).toBe(3);
      expect(finding.message).toBe("Independent awaits run sequentially.");
    });

    it("reason/suggestion은 값이 있을 때만 키로 존재한다", () => {
      const withExtras = reportAndParse([
        makeFinding({ reason: "왜 느린지", suggestion: ["Promise.all을 쓰세요", "또는 배치"] }),
      ]).findings[0];
      const withoutExtras = reportAndParse([makeFinding()]).findings[0];

      expect(withExtras.reason).toBe("왜 느린지");
      expect(withExtras.suggestion).toEqual(["Promise.all을 쓰세요", "또는 배치"]);
      expect("reason" in withoutExtras).toBe(false);
      expect("suggestion" in withoutExtras).toBe(false);
    });

    it("code는 verbose일 때만 포함한다", () => {
      const finding = makeFinding({ code: "await processItem(order);" });

      expect("code" in reportAndParse([finding], false).findings[0]).toBe(false);
      expect(reportAndParse([finding], true).findings[0].code).toBe("await processItem(order);");
    });

    it("verbose여도 code가 없는 Finding에는 code 키를 만들지 않는다", () => {
      expect("code" in reportAndParse([makeFinding()], true).findings[0]).toBe(false);
    });

    it("옵션 인자를 생략해도 비-verbose로 동작한다", () => {
      const output = jsonReporter.report([makeFinding({ code: "await x();" })]);

      expect("code" in (JSON.parse(output) as JsonReport).findings[0]).toBe(false);
    });

    it("키 순서는 rule, severity, file, line, column, message 순이다", () => {
      const report = reportAndParse(
        [makeFinding({ reason: "r", suggestion: ["s"], code: "c" })],
        true,
      );

      expect(Object.keys(report.findings[0])).toEqual([
        "rule",
        "severity",
        "file",
        "line",
        "column",
        "message",
        "reason",
        "suggestion",
        "code",
      ]);
    });
  });

  describe("경로 정책 — 절대경로 그대로", () => {
    it("cwd 안의 파일이어도 상대경로로 바꾸지 않는다 (머신 소비용)", () => {
      const absolute = path.join(process.cwd(), "src", "sample.ts");
      const report = reportAndParse([makeFinding({ file: absolute })]);

      expect(report.findings[0].file).toBe(absolute);
      expect(path.isAbsolute(report.findings[0].file)).toBe(true);
    });
  });

  describe("실제 분석 결과 직렬화", () => {
    it("bottleneck.ts 분석 결과를 스키마대로 직렬화한다", () => {
      const findings = analyze([BOTTLENECK]);
      const report = reportAndParse(findings);

      expect(report.summary).toEqual({ total: 2, error: 0, warning: 2, info: 0 });
      expect(report.findings.map((f) => [f.rule, f.severity, f.line, f.column])).toEqual([
        ["sequential-await", "warning", 7, 3],
        ["no-await-in-loop", "warning", 12, 5],
      ]);
      expect(report.findings.every((f) => f.file === BOTTLENECK)).toBe(true);
      expect(report.findings[1].message).toBe("Sequential async operation detected inside loop.");
    });

    it("clean.ts는 findings 빈 배열로 직렬화된다", () => {
      const report = reportAndParse(analyze([CLEAN]));

      expect(report.findings).toEqual([]);
      expect(report.summary.total).toBe(0);
    });

    it("verbose 분석 결과에는 실제 코드 스니펫이 담긴다", () => {
      const report = reportAndParse(analyze([BOTTLENECK]), true);

      expect(report.findings[1].code).toContain("await processItem(order);");
    });
  });

  describe("buildJsonReport — 문자열화 전 객체", () => {
    it("report()가 직렬화하는 것과 동일한 객체를 만든다", () => {
      const findings = analyze([BOTTLENECK]);

      expect(buildJsonReport(findings, { verbose: true })).toEqual(
        JSON.parse(jsonReporter.report(findings, { verbose: true })),
      );
    });

    it("원본 Finding 배열을 변형하지 않는다", () => {
      const finding = makeFinding({ code: "await x();" });
      const snapshot = { ...finding };

      buildJsonReport([finding], { verbose: false });

      expect(finding).toEqual(snapshot);
    });
  });
});
