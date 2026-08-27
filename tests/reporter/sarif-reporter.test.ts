import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { HOMEPAGE, VERSION } from "../../src/core/package-info.js";
import { rules } from "../../src/rules/index.js";
import { buildSarifLog, sarifReporter, toSarifLevel } from "../../src/reporter/sarif-reporter.js";
import type { SarifLog } from "../../src/reporter/sarif-reporter.js";
import type { Finding } from "../../src/core/types.js";

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/cli");
const BOTTLENECK = path.join(FIXTURE_DIR, "bottleneck.ts");
const CLEAN = path.join(FIXTURE_DIR, "clean.ts");

/** SARIF uri는 cwd 기준 상대경로이므로 기대값도 cwd에서 파생시킨다 */
function expectedUri(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath).split(path.sep).join("/");
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    rule: "no-await-in-loop",
    severity: "warning",
    file: path.join(process.cwd(), "src", "nested", "sample.ts"),
    line: 12,
    column: 5,
    message: "Sequential async operation detected inside loop.",
    ...overrides,
  };
}

function reportAndParse(findings: Finding[], verbose = false): SarifLog {
  return JSON.parse(sarifReporter.report(findings, { verbose })) as SarifLog;
}

function firstRegion(log: SarifLog) {
  return log.runs[0].results[0].locations[0].physicalLocation.region;
}

describe("sarif-reporter", () => {
  describe("로그 껍데기", () => {
    it("SARIF 2.1.0 스키마 키를 갖고 파싱 가능하다", () => {
      const output = sarifReporter.report([], {});

      expect(() => JSON.parse(output)).not.toThrow();

      const log = JSON.parse(output) as SarifLog;
      expect(log.$schema).toContain("sarif-schema-2.1.0.json");
      expect(log.version).toBe("2.1.0");
      expect(log.runs).toHaveLength(1);
    });

    it("format 식별자는 sarif이고 buildSarifLog와 동일한 객체를 직렬화한다", () => {
      expect(sarifReporter.format).toBe("sarif");
      expect(JSON.parse(sarifReporter.report([], {}))).toEqual(buildSarifLog([], {}));
    });

    it("driver 메타데이터는 package-info에서 파생된다", () => {
      const { driver } = reportAndParse([]).runs[0].tool;

      expect(driver.name).toBe("async-doctor");
      expect(driver.version).toBe(VERSION);
      expect(driver.informationUri).toBe(HOMEPAGE);
    });
  });

  describe("severity → level 매핑 3종", () => {
    it("toSarifLevel이 error/warning/info를 error/warning/note로 매핑한다", () => {
      expect(toSarifLevel("error")).toBe("error");
      expect(toSarifLevel("warning")).toBe("warning");
      expect(toSarifLevel("info")).toBe("note");
    });

    it("results[].level에도 동일한 매핑이 적용된다 (info는 note)", () => {
      const log = reportAndParse([
        makeFinding({ severity: "error" }),
        makeFinding({ severity: "warning" }),
        makeFinding({ severity: "info" }),
      ]);

      expect(log.runs[0].results.map((r) => r.level)).toEqual(["error", "warning", "note"]);
    });

    it("SARIF에 없는 info 레벨이 그대로 새어 나가지 않는다", () => {
      const log = reportAndParse([makeFinding({ severity: "info" })]);

      expect(log.runs[0].results[0].level).not.toBe("info");
    });
  });

  describe("driver.rules — 레지스트리 전체", () => {
    it("findings 0건이어도 rules 레지스트리 전체를 포함한다", () => {
      const { driver } = reportAndParse([]).runs[0].tool;

      expect(driver.rules).toHaveLength(rules.length);
      expect(driver.rules.map((r) => r.id)).toEqual(rules.map((r) => r.name));
    });

    it("findings 유무와 무관하게 rules 목록이 동일하다", () => {
      const empty = reportAndParse([]).runs[0].tool.driver.rules;
      const withFindings = reportAndParse([makeFinding()]).runs[0].tool.driver.rules;

      expect(withFindings).toEqual(empty);
    });

    it("각 descriptor가 rule의 name/description/severity를 반영한다", () => {
      const descriptors = reportAndParse([]).runs[0].tool.driver.rules;

      for (const [index, rule] of rules.entries()) {
        const descriptor = descriptors[index];
        expect(descriptor.id).toBe(rule.name);
        expect(descriptor.name).toBe(rule.name);
        expect(descriptor.shortDescription.text).toBe(rule.description);
        expect(descriptor.fullDescription.text).toBe(rule.description);
        expect(descriptor.defaultConfiguration.level).toBe(toSarifLevel(rule.severity));
        expect(descriptor.helpUri).toBe(HOMEPAGE);
      }
    });

    it("현재 등록된 세 rule이 등록 순서대로 노출된다", () => {
      const ids = reportAndParse([]).runs[0].tool.driver.rules.map((r) => r.id);

      expect(ids).toEqual(["no-await-in-loop", "sequential-await", "no-foreach-async"]);
    });
  });

  describe("ruleId / ruleIndex", () => {
    it("ruleIndex가 driver.rules의 실제 인덱스와 일치한다", () => {
      const log = reportAndParse([
        makeFinding({ rule: "sequential-await" }),
        makeFinding({ rule: "no-await-in-loop" }),
      ]);
      const ids = log.runs[0].tool.driver.rules.map((r) => r.id);

      for (const result of log.runs[0].results) {
        expect(result.ruleIndex).toBe(ids.indexOf(result.ruleId));
      }
      expect(log.runs[0].results.map((r) => r.ruleIndex)).toEqual([1, 0]);
    });

    it("레지스트리에 없는 rule은 ruleIndex 키 자체를 생략한다", () => {
      const [result] = reportAndParse([makeFinding({ rule: "not-registered" })]).runs[0].results;

      expect(result.ruleId).toBe("not-registered");
      expect("ruleIndex" in result).toBe(false);
    });
  });

  describe("locations — 경로와 위치", () => {
    it("uri는 cwd 기준 상대경로이며 절대경로가 아니다", () => {
      const absolute = path.join(process.cwd(), "src", "nested", "sample.ts");
      const { uri } = reportAndParse([makeFinding({ file: absolute })]).runs[0].results[0]
        .locations[0].physicalLocation.artifactLocation;

      expect(uri).toBe("src/nested/sample.ts");
      expect(path.isAbsolute(uri)).toBe(false);
      expect(uri.startsWith("/")).toBe(false);
    });

    it("uri는 POSIX 슬래시만 쓴다 (백슬래시 없음)", () => {
      const { uri } = reportAndParse([makeFinding()]).runs[0].results[0].locations[0]
        .physicalLocation.artifactLocation;

      expect(uri).not.toContain("\\");
      expect(uri.split("/").length).toBeGreaterThan(1);
    });

    it("startLine/startColumn은 1-based 값을 그대로 쓴다", () => {
      const region = firstRegion(reportAndParse([makeFinding({ line: 7, column: 3 })]));

      expect(region.startLine).toBe(7);
      expect(region.startColumn).toBe(3);
    });

    it("기지 한계 — cwd 밖 파일은 절대경로로 폴백한다", () => {
      const outside = path.resolve(process.cwd(), "..", "outside-cwd", "sample.ts");
      const { uri } = reportAndParse([makeFinding({ file: outside })]).runs[0].results[0]
        .locations[0].physicalLocation.artifactLocation;

      expect(path.isAbsolute(uri.split("/").join(path.sep))).toBe(true);
    });
  });

  describe("region.snippet — verbose일 때만", () => {
    it("비-verbose에서는 snippet 키가 없다", () => {
      const region = firstRegion(reportAndParse([makeFinding({ code: "await x();" })], false));

      expect("snippet" in region).toBe(false);
    });

    it("verbose에서는 snippet.text에 code가 담긴다", () => {
      const region = firstRegion(reportAndParse([makeFinding({ code: "await x();" })], true));

      expect(region.snippet).toEqual({ text: "await x();" });
    });

    it("verbose여도 code가 없으면 snippet을 만들지 않는다", () => {
      const region = firstRegion(reportAndParse([makeFinding()], true));

      expect("snippet" in region).toBe(false);
    });

    it("옵션 인자를 생략하면 비-verbose로 동작한다", () => {
      const log = JSON.parse(
        sarifReporter.report([makeFinding({ code: "await x();" })]),
      ) as SarifLog;

      expect("snippet" in log.runs[0].results[0].locations[0].physicalLocation.region).toBe(false);
    });
  });

  describe("message", () => {
    it("text는 항상 finding.message다", () => {
      const [result] = reportAndParse([makeFinding({ message: "hello" })]).runs[0].results;

      expect(result.message.text).toBe("hello");
    });

    it("reason/suggestion이 없으면 markdown 키가 없다", () => {
      const [result] = reportAndParse([makeFinding()]).runs[0].results;

      expect("markdown" in result.message).toBe(false);
    });

    it("reason과 suggestion을 문단/리스트 블록으로 합쳐 markdown을 만든다", () => {
      const [result] = reportAndParse([
        makeFinding({ message: "msg", reason: "왜냐하면", suggestion: ["첫째", "둘째"] }),
      ]).runs[0].results;

      expect(result.message.markdown).toBe("msg\n\n왜냐하면\n\n- 첫째\n- 둘째");
    });

    it("suggestion만 있어도 markdown을 만든다", () => {
      const [result] = reportAndParse([makeFinding({ message: "msg", suggestion: ["첫째"] })])
        .runs[0].results;

      expect(result.message.markdown).toBe("msg\n\n- 첫째");
    });
  });

  describe("실제 분석 결과 변환", () => {
    it("bottleneck.ts의 두 Finding을 results로 변환한다", () => {
      const log = reportAndParse(analyze([BOTTLENECK]));
      const results = log.runs[0].results;

      expect(results).toHaveLength(2);
      expect(
        results.map((r) => [
          r.ruleId,
          r.level,
          r.locations[0].physicalLocation.region.startLine,
          r.locations[0].physicalLocation.region.startColumn,
        ]),
      ).toEqual([
        ["sequential-await", "warning", 7, 3],
        ["no-await-in-loop", "warning", 12, 5],
      ]);
      expect(
        results.every(
          (r) => r.locations[0].physicalLocation.artifactLocation.uri === expectedUri(BOTTLENECK),
        ),
      ).toBe(true);
    });

    it("clean.ts는 results 빈 배열이지만 driver.rules는 그대로 유지된다", () => {
      const log = reportAndParse(analyze([CLEAN]));

      expect(log.runs[0].results).toEqual([]);
      expect(log.runs[0].tool.driver.rules).toHaveLength(rules.length);
    });

    it("verbose 분석 결과에는 실제 코드 스니펫이 snippet으로 담긴다", () => {
      const log = reportAndParse(analyze([BOTTLENECK]), true);

      expect(log.runs[0].results[1].locations[0].physicalLocation.region.snippet?.text).toContain(
        "await processItem(order);",
      );
    });
  });
});
