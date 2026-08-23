/**
 * SARIF 2.1.0 reporter — GitHub Code Scanning 업로드용 출력.
 *
 * 경로 정책: `artifactLocation.uri`는 SARIF 관례에 따라 **cwd 기준 상대경로 + POSIX 슬래시**를
 * 쓴다. GitHub Code Scanning이 이 uri를 저장소 루트 기준으로 해석해 PR에 인라인 주석을 달기
 * 때문이다. (JSON reporter는 정반대로 절대경로를 그대로 쓴다 — 혼동하지 말 것.)
 *
 * 기지 한계: 분석 대상이 cwd 밖에 있으면 `relativePath()`가 절대경로로 폴백하므로 uri도
 * 절대경로가 되어 SARIF 관례와 어긋난다. 실사용(저장소 루트에서 실행)에서는 발생하지 않아
 * 이번 스코프에서는 보정하지 않는다.
 */
import { HOMEPAGE, VERSION } from "../core/package-info.js";
import type { Finding, Severity } from "../core/types.js";
import { rules } from "../rules/index.js";
import { relativePath, toPosixPath } from "./shared.js";
import type { ReportOptions, Reporter, ReportFormat } from "./types.js";

const SARIF_SCHEMA =
  "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";
const SARIF_VERSION = "2.1.0";
const TOOL_NAME = "async-doctor";

/** SARIF의 result.level 값 — info는 SARIF에 없으므로 note로 매핑한다 */
export type SarifLevel = "error" | "warning" | "note";

export interface SarifReportingDescriptor {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  defaultConfiguration: { level: SarifLevel };
  helpUri: string;
}

export interface SarifResult {
  ruleId: string;
  ruleIndex?: number;
  level: SarifLevel;
  message: { text: string; markdown?: string };
  locations: [
    {
      physicalLocation: {
        artifactLocation: { uri: string };
        region: {
          startLine: number;
          startColumn: number;
          snippet?: { text: string };
        };
      };
    },
  ];
}

export interface SarifLog {
  $schema: string;
  version: string;
  runs: [
    {
      tool: {
        driver: {
          name: string;
          version: string;
          informationUri: string;
          rules: SarifReportingDescriptor[];
        };
      };
      results: SarifResult[];
    },
  ];
}

/** async-doctor severity → SARIF level */
export function toSarifLevel(severity: Severity): SarifLevel {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
      return "note";
  }
}

/**
 * driver.rules[] — Finding 발생 여부와 무관하게 **레지스트리 전체**를 항상 포함한다.
 * Code Scanning UI가 탐지되지 않은 rule까지 목록으로 보여줄 수 있게 하기 위함이다.
 */
function buildRuleDescriptors(): SarifReportingDescriptor[] {
  return rules.map((rule) => ({
    id: rule.name,
    name: rule.name,
    shortDescription: { text: rule.description },
    fullDescription: { text: rule.description },
    defaultConfiguration: { level: toSarifLevel(rule.severity) },
    helpUri: HOMEPAGE,
  }));
}

/**
 * reason/suggestion이 있을 때만 message.markdown을 만든다.
 * 블록(문단/리스트)은 빈 줄로 구분하되, 제안 목록은 하나의 리스트로 붙여 쓴다.
 */
function buildMarkdown(finding: Finding): string | undefined {
  const blocks: string[] = [];
  if (finding.reason) blocks.push(finding.reason);

  const suggestions = finding.suggestion ?? [];
  if (suggestions.length > 0) {
    blocks.push(suggestions.map((suggestion) => `- ${suggestion}`).join("\n"));
  }

  if (blocks.length === 0) return undefined;
  return [finding.message, ...blocks].join("\n\n");
}

function buildResult(
  finding: Finding,
  ruleIndexes: Map<string, number>,
  verbose: boolean,
): SarifResult {
  const region: SarifResult["locations"][0]["physicalLocation"]["region"] = {
    // rule이 이미 1-based로 계산해 두므로 그대로 쓴다 (SARIF도 1-based).
    startLine: finding.line,
    startColumn: finding.column,
  };

  if (verbose && finding.code !== undefined) {
    region.snippet = { text: finding.code };
  }

  const message: SarifResult["message"] = { text: finding.message };
  const markdown = buildMarkdown(finding);
  if (markdown !== undefined) message.markdown = markdown;

  // 레지스트리에 없는 rule(외부 주입 Finding 등)은 ruleIndex를 생략한다 — 잘못된 인덱스는
  // SARIF 검증기가 오류로 취급한다.
  const ruleIndex = ruleIndexes.get(finding.rule);

  return {
    ruleId: finding.rule,
    ...(ruleIndex !== undefined ? { ruleIndex } : {}),
    level: toSarifLevel(finding.severity),
    message,
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: toPosixPath(relativePath(finding.file)) },
          region,
        },
      },
    ],
  };
}

/** Finding 목록을 SARIF 로그 객체로 변환한다 (문자열화 전 단계) */
export function buildSarifLog(findings: Finding[], options: ReportOptions = {}): SarifLog {
  const descriptors = buildRuleDescriptors();
  const ruleIndexes = new Map(descriptors.map((descriptor, index) => [descriptor.id, index]));
  const verbose = options.verbose === true;

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: VERSION,
            informationUri: HOMEPAGE,
            rules: descriptors,
          },
        },
        results: findings.map((finding) => buildResult(finding, ruleIndexes, verbose)),
      },
    ],
  };
}

export class SarifReporter implements Reporter {
  readonly format: ReportFormat = "sarif";

  report(findings: Finding[], options: ReportOptions = {}): string {
    return JSON.stringify(buildSarifLog(findings, options), null, 2);
  }
}

export const sarifReporter = new SarifReporter();
