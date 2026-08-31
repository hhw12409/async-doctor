import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyze } from "../src/analyzer/analyzer.js";
import { collectFiles } from "../src/analyzer/file-discovery.js";
import { consoleReporter } from "../src/reporter/console-reporter.js";
import { parseArgs, run, CliError } from "../src/cli/index.js";
import { VERSION } from "../src/core/package-info.js";
import { rules } from "../src/rules/index.js";
import type { Severity } from "../src/core/types.js";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TESTS_DIR, "..");
const FIXTURE_DIR = path.resolve(TESTS_DIR, "fixtures/cli");
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
    // format은 --format을 실제로 지정했을 때만 채워진다(undefined가 기본) — run()이 설정
    // 파일과 병합한 뒤에만 "text" 기본값을 채우므로, 여기서는 키가 아예 없어야 한다.
    const options = parseArgs(["src"]);

    expect(options).toEqual({
      path: "src",
      verbose: false,
      help: false,
      version: false,
    });
    expect(options.format).toBeUndefined();
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

/**
 * run()을 실제로 호출하는 통합 테스트.
 * 프로세스를 스폰하지 않고 stdout/stderr만 스파이로 가로채 종료 코드와 출력을 함께 검증한다.
 */
describe("CLI — run() 통합", () => {
  interface RunResult {
    exitCode: number;
    stdout: string;
    stderr: string;
  }

  function invoke(argv: string[]): RunResult {
    const out: string[] = [];
    const err: string[] = [];

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
      err.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

    const exitCode = run(argv);

    return { exitCode, stdout: out.join(""), stderr: err.join("") };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("--format text (기본값)", () => {
    it("Finding이 있으면 exit 1과 요약 줄을 stdout으로 낸다", () => {
      const { exitCode, stdout, stderr } = invoke([BOTTLENECK]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain("2 problems (2 warnings)");
      expect(stdout).toContain("Independent awaits run sequentially.");
      expect(stderr).toBe("");
    });

    it("Finding이 없으면 exit 0과 안내 문구를 낸다", () => {
      const { exitCode, stdout, stderr } = invoke([CLEAN]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("No async bottlenecks found.");
      expect(stderr).toBe("");
    });

    it("--severity error로 전부 걸러지면 exit 0이 된다", () => {
      const { exitCode, stdout } = invoke([BOTTLENECK, "--severity", "error"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("No async bottlenecks found.");
    });
  });

  describe("--format json", () => {
    it("exit 1과 함께 stdout 전체가 파싱 가능한 JSON이다", () => {
      const { exitCode, stdout, stderr } = invoke([BOTTLENECK, "--format", "json"]);

      expect(exitCode).toBe(1);
      expect(stderr).toBe("");
      expect(() => JSON.parse(stdout)).not.toThrow();

      const report = JSON.parse(stdout);
      expect(report.asyncDoctorVersion).toBe(VERSION);
      expect(report.summary).toEqual({ total: 2, error: 0, warning: 2, info: 0 });
      expect(report.findings.map((f: { rule: string; line: number }) => [f.rule, f.line])).toEqual([
        ["sequential-await", 7],
        ["no-await-in-loop", 12],
      ]);
      expect(report.findings[0].file).toBe(BOTTLENECK);
    });

    it("0건이어도 exit 0과 유효한 JSON을 낸다", () => {
      const { exitCode, stdout } = invoke([CLEAN, "--format=json"]);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        summary: { total: 0, error: 0, warning: 0, info: 0 },
        findings: [],
      });
    });

    it("--verbose를 붙여도 stdout은 여전히 순수 JSON이다 (진행 로그는 stderr)", () => {
      const { exitCode, stdout, stderr } = invoke([BOTTLENECK, "--format", "json", "--verbose"]);

      expect(exitCode).toBe(1);
      expect(() => JSON.parse(stdout)).not.toThrow();
      expect(stdout).not.toContain("Analyzing");
      expect(stderr).toContain("Analyzing 1 file(s)...");
      expect(JSON.parse(stdout).findings[1].code).toContain("await processItem(order);");
    });
  });

  describe("--format sarif", () => {
    it("exit 1과 함께 SARIF 2.1.0 문서를 낸다", () => {
      const { exitCode, stdout, stderr } = invoke([BOTTLENECK, "--format", "sarif"]);

      expect(exitCode).toBe(1);
      expect(stderr).toBe("");

      const log = JSON.parse(stdout);
      expect(log.version).toBe("2.1.0");
      expect(log.$schema).toContain("sarif-schema-2.1.0.json");
      expect(log.runs[0].tool.driver.version).toBe(VERSION);
      expect(log.runs[0].tool.driver.rules).toHaveLength(rules.length);
      expect(
        log.runs[0].results.map((r: { ruleId: string; level: string }) => [r.ruleId, r.level]),
      ).toEqual([
        ["sequential-await", "warning"],
        ["no-await-in-loop", "warning"],
      ]);
      expect(log.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
        path.relative(process.cwd(), BOTTLENECK).split(path.sep).join("/"),
      );
    });

    it("0건이어도 exit 0과 함께 driver.rules를 유지한다", () => {
      const { exitCode, stdout } = invoke([CLEAN, "--format", "sarif"]);

      expect(exitCode).toBe(0);

      const log = JSON.parse(stdout);
      expect(log.runs[0].results).toEqual([]);
      expect(log.runs[0].tool.driver.rules.map((r: { id: string }) => r.id)).toEqual(
        rules.map((r) => r.name),
      );
    });

    it("--verbose일 때만 region.snippet이 붙는다", () => {
      const plain = JSON.parse(invoke([BOTTLENECK, "--format", "sarif"]).stdout);
      const verbose = JSON.parse(invoke([BOTTLENECK, "--format", "sarif", "--verbose"]).stdout);

      expect("snippet" in plain.runs[0].results[0].locations[0].physicalLocation.region).toBe(
        false,
      );
      expect(
        verbose.runs[0].results[0].locations[0].physicalLocation.region.snippet.text,
      ).toContain("await getUser();");
    });
  });

  describe("--format html", () => {
    it("exit 1과 함께 <!doctype html>로 시작하는 문서를 낸다", () => {
      const { exitCode, stdout, stderr } = invoke([BOTTLENECK, "--format", "html"]);

      expect(exitCode).toBe(1);
      expect(stderr).toBe("");
      expect(stdout.startsWith("<!doctype html>")).toBe(true);
      expect(stdout.trim().endsWith("</html>")).toBe(true);
      expect(stdout).toContain("Independent awaits run sequentially.");
      expect(stdout).toContain(`async-doctor v${VERSION} report`);
    });

    it("0건이어도 exit 0과 빈 상태 문서를 낸다", () => {
      const { exitCode, stdout } = invoke([CLEAN, "--format=html"]);

      expect(exitCode).toBe(0);
      expect(stdout.startsWith("<!doctype html>")).toBe(true);
      expect(stdout).toContain("No async bottlenecks found.");
    });

    it("--verbose일 때만 code 스니펫을 <pre><code>로 포함한다", () => {
      const plain = invoke([BOTTLENECK, "--format", "html"]).stdout;
      const verbose = invoke([BOTTLENECK, "--format", "html", "--verbose"]).stdout;

      expect(plain).not.toContain('<pre class="finding-code">');
      expect(verbose).toContain('<pre class="finding-code">');
      expect(verbose).toContain("await processItem(order);");
    });

    it("--verbose를 붙여도 stdout은 여전히 HTML 문서다 (진행 로그는 stderr)", () => {
      const { exitCode, stdout, stderr } = invoke([BOTTLENECK, "--format", "html", "--verbose"]);

      expect(exitCode).toBe(1);
      expect(stdout.startsWith("<!doctype html>")).toBe(true);
      expect(stdout).not.toContain("Analyzing");
      expect(stderr).toContain("Analyzing 1 file(s)...");
    });
  });

  describe("--format 검증", () => {
    it("KNOWN_FORMATS에 없는 값은 파싱 단계에서 exit 2로 막힌다", () => {
      const { exitCode, stdout, stderr } = invoke([BOTTLENECK, "--format", "xml"]);

      expect(exitCode).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain('Unknown format "xml"');
    });
  });

  describe("--help / --version", () => {
    it("-h와 --help 모두 exit 0으로 사용법을 출력한다", () => {
      const short = invoke(["-h"]);
      const long = invoke(["--help"]);

      expect(short.exitCode).toBe(0);
      expect(long.exitCode).toBe(0);
      expect(short.stdout).toBe(long.stdout);
      expect(short.stdout).toContain("Usage:");
      expect(short.stdout).toContain("--format <format>");
      expect(short.stdout).toContain("text (default), json, sarif, html");
      expect(short.stderr).toBe("");
    });

    it("-v와 --version은 VERSION 상수를 그대로 출력한다", () => {
      const short = invoke(["-v"]);
      const long = invoke(["--version"]);

      expect(short.exitCode).toBe(0);
      expect(short.stdout).toBe(`${VERSION}\n`);
      expect(long.stdout).toBe(`${VERSION}\n`);
      expect(short.stderr).toBe("");
    });

    it("VERSION은 package.json의 version과 일치한다 (package-info 회귀 테스트)", () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));

      expect(VERSION).toBe(pkg.version);
      expect(invoke(["--version"]).stdout.trim()).toBe(pkg.version);
    });

    it("사용법 헤더에도 같은 버전이 박힌다", () => {
      expect(invoke(["--help"]).stdout).toContain(`async-doctor v${VERSION}`);
    });
  });

  describe("에러 종료 (exit 2)", () => {
    it("존재하지 않는 경로는 exit 2와 Path not found를 낸다", () => {
      const { exitCode, stdout, stderr } = invoke([path.join(FIXTURE_DIR, "does-not-exist.ts")]);

      expect(exitCode).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toMatch(/Path not found/);
    });

    it("알 수 없는 옵션은 exit 2를 낸다", () => {
      const { exitCode, stdout, stderr } = invoke([BOTTLENECK, "--nope"]);

      expect(exitCode).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain('Unknown option "--nope"');
    });

    it("경로를 주지 않으면 exit 2와 사용법을 낸다", () => {
      const { exitCode, stderr } = invoke([]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Missing required <path> argument.");
      expect(stderr).toContain("Usage:");
    });

    it("값 없는 --format은 exit 2를 낸다", () => {
      const { exitCode, stderr } = invoke([BOTTLENECK, "--format"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Option --format requires a value.");
    });
  });

  describe("--verbose 진행 로그 스트림", () => {
    it("Analyzing 로그는 stdout이 아니라 stderr로 나간다", () => {
      const { stdout, stderr } = invoke([BOTTLENECK, "--verbose"]);

      expect(stderr).toContain("Analyzing 1 file(s)...");
      expect(stdout).not.toContain("Analyzing");
    });

    it("디렉토리 분석 시 파일 개수가 로그에 반영된다", () => {
      const { stderr } = invoke([FIXTURE_DIR, "--verbose"]);

      expect(stderr).toContain("Analyzing 2 file(s)...");
    });

    it("--verbose 없이는 진행 로그를 내지 않는다", () => {
      const { stderr } = invoke([BOTTLENECK]);

      expect(stderr).toBe("");
    });
  });
});
