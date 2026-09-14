/**
 * JUnit XML reporter — GitHub 생태계 밖(Jenkins/GitLab CI/CircleCI 등)의 CI 대시보드가
 * 네이티브로 소비하는 "테스트 결과" 형식으로 findings를 표현한다. sarif가 GitHub Code
 * Scanning 전용인 것을 보완하는 목적.
 *
 * 경로 정책: text/html과 동일하게 cwd 기준 상대경로(`relativePath()`)를 쓴다. CI 대시보드에
 * 사람이 보는 리포트이기 때문이며, json의 절대경로 정책과는 다르다 — 혼동하지 말 것.
 * (sarif 전용의 POSIX 정규화(`toPosixPath()`)는 URI 스펙 요구사항이라 여기선 불필요.)
 *
 * 구조: 루트 `<testsuites>` 아래 파일 하나당 `<testsuite>` 하나, 그 안에 finding 하나당
 * `<testcase>` 하나. JUnit에는 "warning" 개념이 없으므로 severity와 무관하게 모든 finding을
 * `<failure>` 자식으로 표현하고(`type` 속성으로 severity 구분), 그 결과 `<testsuite>`의
 * `failures` 속성은 언제나 `tests`와 같고 `errors`는 언제나 0이다 — 이 리포터가 절대 `<error>`
 * 요소를 만들지 않기 때문에 자명하게 참이다(eslint의 junit formatter와 동일한 관례).
 *
 * findings가 0건이면 자식 `<testsuite>`가 없는 `<testsuites/>` 루트만 반환한다 — json
 * reporter의 "findings 0건이어도 항상 유효한 문서" 원칙과 동일.
 *
 * 보안: 분석 대상 소스에서 온 모든 문자열(message/reason/suggestion/file/rule/code)은
 * XML에 삽입되기 전 반드시 escapeXml()을 거친다. 특히 `code`(verbose 스니펫)는 원본 소스
 * 코드 그대로이므로 `<`/`&` 등이 그대로 들어있을 수 있다.
 *
 * XML은 HTML과 마찬가지로 최종 문자열 자체가 산출물이라 JSON/SARIF처럼 "문자열화 전 데이터
 * 빌드 함수"를 따로 두지 않는다. 대신 조립을 작은 순수 함수(renderTestcase/renderTestsuite)로
 * 나눠 각각 단위 테스트할 수 있게 한다(html-reporter와 동일한 패턴).
 */
import type { Finding } from "../core/types.js";
import { relativePath } from "./shared.js";
import type { ReportOptions, Reporter, ReportFormat } from "./types.js";

/**
 * XML 특수문자를 이스케이프한다.
 * 이 파일이 문서에 삽입하는 모든 소스/사용자 유래 문자열은 반드시 이 함수를 거쳐야 한다.
 * `&` 치환이 반드시 제일 먼저 와야 한다 — 나중에 하면 뒤이어 만든 `&lt;` 등의 `&`까지
 * 다시 이스케이프된다.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** finding 하나를 `<testcase>` 조각으로 렌더링한다. verbose면 code 스니펫을 failure 본문에 포함한다. */
export function renderTestcase(finding: Finding, verbose: boolean): string {
  const name = escapeXml(`${finding.rule} (${finding.line}:${finding.column})`);
  const classname = escapeXml(relativePath(finding.file));
  const message = escapeXml(finding.message);
  const type = escapeXml(finding.severity);

  const bodyBlocks: string[] = [];
  if (finding.reason) bodyBlocks.push(`Why: ${finding.reason}`);

  const suggestions = finding.suggestion ?? [];
  if (suggestions.length > 0) {
    bodyBlocks.push(
      ["Suggestions:", ...suggestions.map((suggestion) => `- ${suggestion}`)].join("\n"),
    );
  }

  if (verbose && finding.code) {
    bodyBlocks.push(`Code:\n${finding.code}`);
  }

  const failure =
    bodyBlocks.length > 0
      ? `<failure message="${message}" type="${type}">${escapeXml(bodyBlocks.join("\n\n"))}</failure>`
      : `<failure message="${message}" type="${type}"/>`;

  return `    <testcase name="${name}" classname="${classname}" time="0">
      ${failure}
    </testcase>`;
}

/** 파일 하나에 대한 `<testsuite>` — cwd 기준 상대경로를 name으로, 그 파일의 finding 전체를 testcase로 감싼다. */
export function renderTestsuite(file: string, findings: Finding[], verbose: boolean): string {
  const name = escapeXml(relativePath(file));
  const testcases = findings.map((finding) => renderTestcase(finding, verbose)).join("\n");

  // failures는 언제나 findings.length와 같다 — 이 리포터는 severity와 무관하게 모든 finding을
  // <failure>로 표현하고 <error>는 절대 만들지 않으므로(JUnit에 "warning" 개념이 없음).
  return `  <testsuite name="${name}" tests="${findings.length}" failures="${findings.length}" errors="0" time="0">
${testcases}
  </testsuite>`;
}

function groupByFile(findings: Finding[]): Map<string, Finding[]> {
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    const bucket = grouped.get(finding.file);
    if (bucket) {
      bucket.push(finding);
    } else {
      grouped.set(finding.file, [finding]);
    }
  }
  return grouped;
}

/** 전체 JUnit XML 문서를 조립한다. findings가 없으면 자식 없는 `<testsuites/>` 루트만 반환한다. */
function renderDocument(findings: Finding[], options: ReportOptions): string {
  const declaration = '<?xml version="1.0" encoding="UTF-8"?>';

  if (findings.length === 0) {
    return `${declaration}\n<testsuites/>\n`;
  }

  const verbose = options.verbose === true;
  const testsuites = Array.from(groupByFile(findings), ([file, fileFindings]) =>
    renderTestsuite(file, fileFindings, verbose),
  ).join("\n");

  return `${declaration}\n<testsuites>\n${testsuites}\n</testsuites>\n`;
}

export class JunitReporter implements Reporter {
  readonly format: ReportFormat = "junit";

  report(findings: Finding[], options: ReportOptions = {}): string {
    return renderDocument(findings, options);
  }
}

export const junitReporter = new JunitReporter();
