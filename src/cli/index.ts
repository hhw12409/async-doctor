/**
 * CLI의 순수 로직 계층 — 인자 파싱(`parseArgs`)과 실행 파이프라인(`run`)만 export한다.
 *
 * 이 모듈은 **로드 시 부수효과가 없다**. `run()`은 스스로를 호출하지 않고 종료 코드를
 * 반환할 뿐이며, `process.exitCode` 설정과 `process.argv` 읽기는 실행 진입점인
 * `src/cli/bin.ts`가 담당한다. 덕분에 테스트나 다른 도구가 `parseArgs`/`run`을
 * import해도 CLI가 실행되지 않는다.
 */
import { analyze } from "../analyzer/analyzer.js";
import { applyFixes } from "../analyzer/fixer.js";
import { collectFiles, filterIgnored } from "../analyzer/file-discovery.js";
import { loadConfig } from "../core/config.js";
import { VERSION } from "../core/package-info.js";
import { isSeverity } from "../core/severity.js";
import { rules as ruleRegistry } from "../rules/index.js";
import { consoleReporter } from "../reporter/console-reporter.js";
import { htmlReporter } from "../reporter/html-reporter.js";
import { jsonReporter } from "../reporter/json-reporter.js";
import { sarifReporter } from "../reporter/sarif-reporter.js";
import { relativePath } from "../reporter/shared.js";
import { REPORT_FORMATS } from "../reporter/types.js";
import type { Reporter, ReportFormat } from "../reporter/types.js";
import type { AsyncDoctorRule, Severity } from "../core/types.js";

/**
 * --format 값 → Reporter 구현체 레지스트리.
 * 새 형식 추가는 Reporter를 구현하는 파일 하나 + 이 맵에 한 줄 등록으로 끝난다.
 * 미등록 형식이 있다면 아래 run()에서 데이터 기반 "not implemented" 에러로 처리된다.
 */
const REPORTERS: Partial<Record<ReportFormat, Reporter>> = {
  text: consoleReporter,
  json: jsonReporter,
  sarif: sarifReporter,
  html: htmlReporter,
};

const KNOWN_FORMATS = REPORT_FORMATS;

export interface CliOptions {
  path: string;
  verbose: boolean;
  /**
   * --format 플래그로 명시한 값. **미지정 시 `undefined`** — 여기서 곧바로 `"text"`를
   * 채우면 "플래그를 실제로 지정했는지"와 "기본값이 채워진 것인지"를 구분할 수 없어져
   * 설정 파일보다 항상 CLI 플래그가 우선한다는 규칙을 구현할 수 없다. 최종 기본값은
   * `run()`이 설정 파일과 병합한 뒤에만 채운다.
   */
  format?: ReportFormat;
  severity?: Severity;
  /** --fix: fix가 있는 finding을 실제로 파일에 적용한다 */
  fix: boolean;
  /** --fix-dry-run: 아무것도 쓰지 않고 몇 개가/어디가 고쳐질지만 미리 보여준다 */
  fixDryRun: boolean;
  help: boolean;
  version: boolean;
}

export class CliError extends Error {}

const USAGE = `async-doctor v${VERSION}
Detect sequential async bottlenecks in Node.js/TypeScript code.

Usage:
  async-doctor <path> [options]

Arguments:
  <path>                 File or directory to analyze (.ts .tsx .js .jsx .mts .cts)

Options:
  --verbose              Include the offending code snippet in the output
  --format <format>      Output format: text (default), json, sarif, html
  --severity <level>     Only report findings at or above this level: error | warning | info
  --fix                  Apply automatic fixes for findings that support them, then re-analyze
  --fix-dry-run          Preview what --fix would change without writing any files
  -h, --help             Show this help
  -v, --version          Show version

Config:
  A .async-doctorrc.json in the current directory can set defaults for --format/--severity
  and configure "ignore" globs or per-rule overrides. CLI flags always win.
  See the README's "Config File" section for the schema.

Auto-fix:
  Only findings that carry a fix (currently just no-floating-promise) are ever touched.
  --fix and --fix-dry-run cannot be combined. See the README's "Auto-fixing" section.

Examples:
  async-doctor src
  async-doctor src/user.service.ts --verbose
  async-doctor src --severity warning --format text
  async-doctor src --format json
  async-doctor src --format sarif > async-doctor.sarif
  async-doctor src --format html > report.html
  async-doctor src --fix-dry-run
  async-doctor src --fix`;

function readValue(argv: string[], index: number, flag: string): string {
  const inlineIndex = argv[index].indexOf("=");
  if (argv[index].startsWith("--") && inlineIndex !== -1) {
    return argv[index].slice(inlineIndex + 1);
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new CliError(`Option ${flag} requires a value.`);
  }
  return value;
}

/**
 * 수동 인자 파싱 — 외부 의존성 없이 `--flag value`와 `--flag=value` 두 형태를 모두 지원한다.
 * 새 옵션은 이 switch에 case 하나를 추가하면 된다.
 */
export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    path: "",
    verbose: false,
    fix: false,
    fixDryRun: false,
    help: false,
    version: false,
  };

  let positional: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const flag = arg.startsWith("--") && arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;

    switch (flag) {
      case "-h":
      case "--help":
        options.help = true;
        break;

      case "-v":
      case "--version":
        options.version = true;
        break;

      case "--verbose":
        options.verbose = true;
        break;

      case "--fix":
        options.fix = true;
        break;

      case "--fix-dry-run":
        options.fixDryRun = true;
        break;

      case "--format": {
        const value = readValue(argv, i, "--format");
        if (!KNOWN_FORMATS.includes(value as ReportFormat)) {
          throw new CliError(
            `Unknown format "${value}". Supported formats: ${KNOWN_FORMATS.join(", ")}.`,
          );
        }
        options.format = value as ReportFormat;
        if (arg === flag) i += 1;
        break;
      }

      case "--severity": {
        const value = readValue(argv, i, "--severity");
        if (!isSeverity(value)) {
          throw new CliError(`Unknown severity "${value}". Expected: error, warning or info.`);
        }
        options.severity = value;
        if (arg === flag) i += 1;
        break;
      }

      default: {
        if (arg.startsWith("-")) {
          throw new CliError(`Unknown option "${arg}". Run async-doctor --help.`);
        }
        if (positional !== undefined) {
          throw new CliError(`Unexpected extra argument "${arg}". Only one path is supported.`);
        }
        positional = arg;
      }
    }
  }

  if (positional !== undefined) {
    options.path = positional;
  }

  if (options.fix && options.fixDryRun) {
    throw new CliError("--fix and --fix-dry-run cannot be used together.");
  }

  return options;
}

export function run(argv: string[]): number {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (options.path === "") {
    process.stderr.write(`Missing required <path> argument.\n\n${USAGE}\n`);
    return 2;
  }

  // 설정 파일은 cwd에서만 찾는다(상위 walk-up 없음). 파일이 없으면 undefined —
  // 이 시점부터는 기존 동작(CLI 플래그만)과 100% 동일하게 흘러간다.
  // 파일이 있는데 파싱/스키마 오류면 조용히 무시하지 않고 즉시 exit 2로 종료한다.
  let config;
  try {
    config = loadConfig(process.cwd());
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  // 우선순위: CLI 플래그 > 설정 파일 > 내장 기본값("text", threshold 없음).
  // options.format/severity가 undefined일 때만 설정 파일 값을 내려받는다.
  const format: ReportFormat = options.format ?? config?.format ?? "text";
  const severity: Severity | undefined = options.severity ?? config?.severity;

  const reporter = REPORTERS[format];
  if (!reporter) {
    process.stderr.write(
      `Format "${format}" is not implemented yet. Currently supported: ${Object.keys(REPORTERS).join(", ")}.\n`,
    );
    return 2;
  }

  let files: string[];
  try {
    files = collectFiles(options.path);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (config?.ignore && config.ignore.length > 0) {
    files = filterIgnored(files, config.ignore, process.cwd());
  }

  if (files.length === 0) {
    process.stderr.write(`No analyzable files found at "${options.path}".\n`);
    return 2;
  }

  if (options.verbose) {
    // 진행 상황은 **stderr**로 보낸다. stdout은 리포터 출력 전용이어야
    // `--format json/sarif`를 파이프하거나 파일로 리다이렉트했을 때 문서가 깨지지 않는다.
    // (TTY에서는 stdout/stderr가 함께 보이므로 사람이 보는 화면은 그대로다.)
    process.stderr.write(`Analyzing ${files.length} file(s)...\n\n`);
  }

  // config.rules는 "off"(비활성화)와 severity 오버라이드를 함께 담는다.
  // "off"는 analyzer.ts의 기존 확장점(AnalyzeOptions.rules)에 걸러낸 배열을 주입해 처리하고,
  // severity 오버라이드는 rule이 Finding.severity를 스스로 하드코딩해 push하므로 rule 레벨에서
  // 처리할 수 없어 analyzer 파이프라인의 severityOverrides로 넘긴다. 둘 다 analyzer.ts 자체는
  // 수정하지 않는다 — rule 이름 오타는(레지스트리에 없는 키) 아무 rule에도 매치되지 않으므로
  // 조용히 무시된다(에러 아님), 억제 코멘트와 동일한 정책.
  const ruleOverrides = config?.rules ?? {};
  const disabledRuleNames = new Set(
    Object.entries(ruleOverrides)
      .filter(([, value]) => value === "off")
      .map(([name]) => name),
  );
  const activeRules: AsyncDoctorRule[] =
    disabledRuleNames.size > 0
      ? ruleRegistry.filter((rule) => !disabledRuleNames.has(rule.name))
      : ruleRegistry;

  const severityOverrides: Partial<Record<string, Severity>> = {};
  for (const [name, value] of Object.entries(ruleOverrides)) {
    if (value !== "off") severityOverrides[name] = value;
  }

  const analyzeOptions = {
    severityThreshold: severity,
    rules: activeRules,
    severityOverrides,
  };

  let findings;
  try {
    findings = analyze(files, analyzeOptions);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  // reportFindings는 stdout에 실제로 찍힐(=exit code 판정에도 쓰일) 최종 findings다.
  // --fix로 뭔가 실제로 고쳐진 경우에만 아래에서 재분석 결과로 교체된다. 그 외의 모든
  // 경로(플래그 없음, --fix-dry-run, --fix인데 고칠 게 없었음)는 findings 그대로 유지되므로
  // "--fix-dry-run은 플래그 없을 때와 exit code가 완전히 같아야 한다"는 요구가 자연히 성립한다.
  let reportFindings = findings;

  if (options.fix || options.fixDryRun) {
    const fixResult = applyFixes(findings, { dryRun: options.fixDryRun });

    if (options.fixDryRun) {
      if (fixResult.fixedCount > 0) {
        const preview = findings
          .filter((finding) => finding.fix !== undefined)
          .map((finding) => `  ${relativePath(finding.file)}:${finding.line} ${finding.rule}`)
          .join("\n");
        process.stderr.write(
          `Would fix ${fixResult.fixedCount} finding(s) in ${fixResult.fixedFiles.length} file(s):\n${preview}\n`,
        );
      }
    } else if (fixResult.fixedCount > 0) {
      // "고쳤다고 주장"하지 않는다 — 같은 파일 목록을 다시 analyze()해서 고친 finding이
      // 정말 사라졌는지, 부작용으로 새 finding이 생기지 않았는지 실제로 재검증한다.
      try {
        reportFindings = analyze(files, analyzeOptions);
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 2;
      }
      process.stderr.write(
        `Fixed ${fixResult.fixedCount} finding(s) in ${fixResult.fixedFiles.length} file(s).\n`,
      );
    }
  }

  process.stdout.write(`${reporter.report(reportFindings, { verbose: options.verbose })}\n`);

  return reportFindings.length > 0 ? 1 : 0;
}
