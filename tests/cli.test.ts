import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyzer/analyzer.js";
import { collectFiles } from "../src/analyzer/file-discovery.js";
import { consoleReporter } from "../src/reporter/console-reporter.js";
import { parseArgs, CliError } from "../src/cli/index.js";
import type { Severity } from "../src/core/types.js";

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/cli");
const BOTTLENECK = path.join(FIXTURE_DIR, "bottleneck.ts");
const CLEAN = path.join(FIXTURE_DIR, "clean.ts");

/** CLI의 파이프라인(경로 확장 → 분석 → 리포트)을 프로세스 스폰 없이 그대로 재현한다 */
function runPipeline(targetPath: string, severity?: Severity, verbose = false) {
  const files = collectFiles(targetPath);
  const findings = analyze(files, { severityThreshold: severity });
  return { files, findings, output: consoleReporter.report(findings, { verbose }) };
}

describe("CLI — 단일 파일 분석", () => {
  it("파일 하나를 지정하면 그 파일만 분석한다", () => {
    const { files, findings } = runPipeline(BOTTLENECK);

    expect(files).toEqual([BOTTLENECK]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.file)).toEqual([BOTTLENECK, BOTTLENECK]);
  });

  it("두 rule의 Finding을 라인 순으로 정렬해 반환한다", () => {
    const { findings } = runPipeline(BOTTLENECK);

    expect(findings.map((f) => [f.rule, f.severity, f.line, f.column])).toEqual([
      ["sequential-await", "warning", 7, 3],
      ["no-await-in-loop", "warning", 12, 5],
    ]);
  });

  it("문제가 없는 파일은 Finding 0건과 안내 문구를 낸다", () => {
    const { files, findings, output } = runPipeline(CLEAN);

    expect(files).toEqual([CLEAN]);
    expect(findings).toEqual([]);
    expect(output).toBe("No async bottlenecks found.");
  });

  it("--verbose일 때만 코드 스니펫을 출력한다", () => {
    const plain = runPipeline(BOTTLENECK).output;
    const verbose = runPipeline(BOTTLENECK, undefined, true).output;

    expect(plain).not.toContain("| ");
    expect(verbose).toContain("| ");
    expect(verbose).toContain("await processItem(order);");
  });
});

describe("CLI — 디렉토리 분석", () => {
  it("디렉토리를 재귀 탐색해 지원 확장자 파일을 모두 수집한다", () => {
    const { files } = runPipeline(FIXTURE_DIR);

    expect(files).toEqual([BOTTLENECK, CLEAN]);
  });

  it("문제가 있는 파일의 Finding만 모아 보고한다", () => {
    const { findings, output } = runPipeline(FIXTURE_DIR);

    expect(findings).toHaveLength(2);
    expect(new Set(findings.map((f) => f.file))).toEqual(new Set([BOTTLENECK]));
    expect(output).toContain("2 problems (2 warnings)");
  });

  it("존재하지 않는 경로는 에러를 던진다", () => {
    expect(() => collectFiles(path.join(FIXTURE_DIR, "does-not-exist"))).toThrow(/Path not found/);
  });
});

describe("CLI — --severity 필터링", () => {
  it("--severity info는 warning Finding을 통과시킨다", () => {
    const { findings } = runPipeline(FIXTURE_DIR, "info");

    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "warning")).toBe(true);
  });

  it("--severity warning은 warning Finding을 통과시킨다", () => {
    const { findings } = runPipeline(FIXTURE_DIR, "warning");

    expect(findings).toHaveLength(2);
  });

  it("--severity error는 임계값 미만인 warning Finding을 모두 걸러낸다", () => {
    const { findings, output } = runPipeline(FIXTURE_DIR, "error");

    expect(findings).toEqual([]);
    expect(output).toBe("No async bottlenecks found.");
  });
});

describe("CLI — 인자 파싱", () => {
  it("경로와 기본값을 파싱한다", () => {
    expect(parseArgs(["src"])).toEqual({
      path: "src",
      verbose: false,
      format: "text",
      help: false,
      version: false,
    });
  });

  it("--severity를 공백 구분과 = 구분 양쪽으로 받는다", () => {
    expect(parseArgs(["src", "--severity", "error"]).severity).toBe("error");
    expect(parseArgs(["src", "--severity=warning"]).severity).toBe("warning");
  });

  it("--severity 뒤 경로를 값으로 삼키지 않는다", () => {
    const options = parseArgs(["--severity", "warning", "src"]);

    expect(options.severity).toBe("warning");
    expect(options.path).toBe("src");
  });

  it("--verbose 플래그를 인식한다", () => {
    expect(parseArgs(["src", "--verbose"]).verbose).toBe(true);
  });

  it("알 수 없는 severity 값은 CliError를 던진다", () => {
    expect(() => parseArgs(["src", "--severity", "critical"])).toThrow(CliError);
  });

  it("알 수 없는 옵션은 CliError를 던진다", () => {
    expect(() => parseArgs(["src", "--nope"])).toThrow(CliError);
  });
});
