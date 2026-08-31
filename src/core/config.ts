/**
 * 프로젝트 루트 설정 파일(`.async-doctorrc.json`) 로딩/검증.
 *
 * 탐색 범위는 `process.cwd()` 한 곳뿐이다 — 상위 디렉토리 walk-up은 하지 않는다(v0.8.0에서
 * 의도적으로 좁힌 범위, 필요해지면 후속 버전에서 확장). 파일이 없으면 `undefined`를 반환해
 * 기존 동작(CLI 플래그만)과 100% 동일하게 만든다. 파일은 있지만 JSON 파싱에 실패하거나
 * 스키마를 위반하면 조용히 무시하지 않고 `ConfigError`를 던진다 — 사용자가 직접 작성한
 * 파일이므로 오타를 조용히 넘기면 오히려 혼란스럽다.
 *
 * 예외: `rules`의 **키**(rule 이름)는 검증하지 않는다. 오타난/제거된/이름이 바뀐 rule 이름은
 * 조용히 무시한다 — 이 프로젝트의 억제 코멘트(suppressions.ts)가 이미 이렇게 동작하고,
 * rule이 리네임/제거돼도 오래된 설정 파일이 깨지지 않게 하기 위함이다. 값(`"off"` 또는
 * `Severity`)은 여전히 엄격하게 검증한다.
 */
import fs from "node:fs";
import path from "node:path";
import { isSeverity } from "./severity.js";
import type { Severity } from "./types.js";
import { REPORT_FORMATS } from "../reporter/types.js";
import type { ReportFormat } from "../reporter/types.js";

export const CONFIG_FILE_NAME = ".async-doctorrc.json";

/** `.async-doctorrc.json`의 검증된 형태. 모든 필드는 선택적이다. */
export interface AsyncDoctorConfig {
  /** 제외할 파일의 glob 패턴 목록 (`*`/`**`/리터럴 세그먼트만 지원, file-discovery.ts 참고) */
  ignore?: string[];
  /** rule 이름 → `"off"`(비활성화) 또는 이 rule이 만드는 Finding의 severity를 덮어쓸 값 */
  rules?: Record<string, "off" | Severity>;
  /** `--format` 미지정 시 기본값 */
  format?: ReportFormat;
  /** `--severity` 미지정 시 기본값 */
  severity?: Severity;
}

/** 설정 파일 파싱/스키마 검증 실패. CLI는 이 에러 메시지를 그대로 stderr에 출력하고 exit 2로 종료한다 */
export class ConfigError extends Error {}

/**
 * `cwd`에서 `.async-doctorrc.json`을 찾아 로드한다.
 * - 파일 없음 → `undefined` (설정 없음, 기존 동작과 동일)
 * - JSON 파싱 실패/스키마 위반 → `ConfigError` throw
 */
export function loadConfig(cwd: string): AsyncDoctorConfig | undefined {
  const configPath = path.join(cwd, CONFIG_FILE_NAME);

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Failed to parse ${CONFIG_FILE_NAME}: ${message}`);
  }

  return validateConfig(parsed);
}

function validateConfig(value: unknown): AsyncDoctorConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigError(`Invalid ${CONFIG_FILE_NAME}: expected a JSON object at the top level.`);
  }

  const input = value as Record<string, unknown>;
  const config: AsyncDoctorConfig = {};

  if ("ignore" in input) {
    const ignore = input.ignore;
    if (!Array.isArray(ignore) || !ignore.every((entry) => typeof entry === "string")) {
      throw new ConfigError(`Invalid ${CONFIG_FILE_NAME}: "ignore" must be an array of strings.`);
    }
    config.ignore = ignore;
  }

  if ("rules" in input) {
    const rulesValue = input.rules;
    if (typeof rulesValue !== "object" || rulesValue === null || Array.isArray(rulesValue)) {
      throw new ConfigError(`Invalid ${CONFIG_FILE_NAME}: "rules" must be an object.`);
    }
    const rules: Record<string, "off" | Severity> = {};
    for (const [ruleName, ruleValue] of Object.entries(rulesValue as Record<string, unknown>)) {
      if (ruleValue === "off" || (typeof ruleValue === "string" && isSeverity(ruleValue))) {
        rules[ruleName] = ruleValue as "off" | Severity;
        continue;
      }
      throw new ConfigError(
        `Invalid ${CONFIG_FILE_NAME}: "rules.${ruleName}" must be "off", "error", "warning", or "info".`,
      );
    }
    config.rules = rules;
  }

  if ("format" in input) {
    const format = input.format;
    if (typeof format !== "string" || !REPORT_FORMATS.includes(format as ReportFormat)) {
      throw new ConfigError(
        `Invalid ${CONFIG_FILE_NAME}: "format" must be one of ${REPORT_FORMATS.join(", ")}.`,
      );
    }
    config.format = format as ReportFormat;
  }

  if ("severity" in input) {
    const severity = input.severity;
    if (typeof severity !== "string" || !isSeverity(severity)) {
      throw new ConfigError(
        `Invalid ${CONFIG_FILE_NAME}: "severity" must be one of error, warning, info.`,
      );
    }
    config.severity = severity;
  }

  return config;
}
