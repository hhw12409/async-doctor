/**
 * JSON reporter — CI/툴링이 파싱해서 소비하는 기계 판독용 출력.
 *
 * 경로 정책: `file`은 **절대경로를 그대로** 직렬화한다. 소비자가 어느 디렉토리에서
 * 결과를 읽는지 알 수 없으므로 cwd 의존적인 상대경로로 바꾸지 않는다.
 * (SARIF reporter는 스펙 관례상 정반대로 상대경로를 쓴다 — 혼동하지 말 것.)
 *
 * findings가 0건이어도 **항상 유효한 JSON 문서**를 반환한다. console-reporter의
 * "No async bottlenecks found." 같은 비-JSON 문자열을 절대 내보내지 않는다.
 */
import { VERSION } from "../core/package-info.js";
import type { Finding } from "../core/types.js";
import { countBySeverity } from "./shared.js";
import type { ReportOptions, Reporter, ReportFormat } from "./types.js";

export interface JsonReportSummary {
  total: number;
  error: number;
  warning: number;
  info: number;
}

export interface JsonReport {
  /** 이 결과를 만든 async-doctor 버전 */
  asyncDoctorVersion: string;
  summary: JsonReportSummary;
  findings: Finding[];
}

function serializeFinding(finding: Finding, verbose: boolean): Finding {
  const serialized: Finding = {
    rule: finding.rule,
    severity: finding.severity,
    file: finding.file,
    line: finding.line,
    column: finding.column,
    message: finding.message,
  };

  if (finding.reason !== undefined) serialized.reason = finding.reason;
  if (finding.suggestion !== undefined) serialized.suggestion = finding.suggestion;
  if (verbose && finding.code !== undefined) serialized.code = finding.code;

  return serialized;
}

/** Finding 목록을 JSON 문서 객체로 변환한다 (문자열화 전 단계 — 테스트/프로그래매틱 사용용) */
export function buildJsonReport(findings: Finding[], options: ReportOptions = {}): JsonReport {
  const counts = countBySeverity(findings);

  return {
    asyncDoctorVersion: VERSION,
    summary: {
      total: findings.length,
      error: counts.error,
      warning: counts.warning,
      info: counts.info,
    },
    findings: findings.map((finding) => serializeFinding(finding, options.verbose === true)),
  };
}

export class JsonReporter implements Reporter {
  readonly format: ReportFormat = "json";

  report(findings: Finding[], options: ReportOptions = {}): string {
    return JSON.stringify(buildJsonReport(findings, options), null, 2);
  }
}

export const jsonReporter = new JsonReporter();
