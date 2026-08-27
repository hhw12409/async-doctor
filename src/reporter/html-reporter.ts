/**
 * HTML reporter — 브라우저에서 바로 열어보는, 사람이 읽기 좋은 단일 파일 리포트.
 *
 * 경로 정책: text(console)와 동일하게 cwd 기준 상대경로(`relativePath()`)를 쓴다.
 * 사람이 보는 리포트이기 때문이며, json의 절대경로 정책과는 다르다 — 혼동하지 말 것.
 *
 * 완전히 독립적인 단일 HTML 문서를 반환한다: `<!doctype html>`부터 `</html>`까지,
 * 외부 CDN/폰트/스크립트 요청 없이 인라인 `<style>`만 사용한다. 사용자가 파일로 저장해
 * 브라우저에서 바로 열어보는 용도다.
 *
 * 보안: 분석 대상 소스에서 온 모든 문자열(message/reason/suggestion/file/rule/code)은
 * 문서에 삽입되기 전에 반드시 escapeHtml()을 거친다. 특히 `code`(verbose 스니펫)는 원본
 * 소스 코드 그대로이므로 `<script>`나 `</style>` 같은 문자열이 들어있을 수 있다.
 *
 * HTML은 최종 문자열 자체가 산출물이라 JSON/SARIF처럼 "문자열화 전 데이터 빌드 함수"를
 * 따로 두지 않는다. 대신 조립을 작은 순수 함수로 나눠 각각 단위 테스트할 수 있게 한다.
 */
import { VERSION } from "../core/package-info.js";
import type { Finding, Severity } from "../core/types.js";
import { countBySeverity, relativePath } from "./shared.js";
import type { ReportOptions, Reporter, ReportFormat } from "./types.js";

/**
 * HTML 특수문자를 이스케이프한다.
 * 이 파일이 문서에 삽입하는 모든 소스/사용자 유래 문자열은 반드시 이 함수를 거쳐야 한다.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function severityClass(severity: Severity): string {
  return `severity-${severity}`;
}

/** 문서 상단 요약 블록 — 총 개수 + severity별 개수 (countBySeverity 재사용) */
export function renderSummary(findings: Finding[]): string {
  const counts = countBySeverity(findings);
  const total = findings.length;

  return `<section class="summary">
  <h1>async-doctor report</h1>
  <p class="summary-total">${total} problem${total === 1 ? "" : "s"} found</p>
  <ul class="summary-counts">
    <li class="${severityClass("error")}">${counts.error} error${counts.error === 1 ? "" : "s"}</li>
    <li class="${severityClass("warning")}">${counts.warning} warning${counts.warning === 1 ? "" : "s"}</li>
    <li class="${severityClass("info")}">${counts.info} info</li>
  </ul>
</section>`;
}

/** finding 하나를 `<li>` 조각으로 렌더링한다. verbose면 code 스니펫을 `<pre><code>`로 포함한다. */
export function renderFinding(finding: Finding, verbose: boolean): string {
  const reasonHtml = finding.reason
    ? `<p class="finding-reason"><strong>Why:</strong> ${escapeHtml(finding.reason)}</p>`
    : "";

  const suggestions = finding.suggestion ?? [];
  const suggestionsHtml =
    suggestions.length > 0
      ? `<ul class="finding-suggestions">${suggestions
          .map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`)
          .join("")}</ul>`
      : "";

  const codeHtml =
    verbose && finding.code
      ? `<pre class="finding-code"><code>${escapeHtml(finding.code)}</code></pre>`
      : "";

  return `<li class="finding ${severityClass(finding.severity)}">
  <div class="finding-header">
    <span class="finding-severity">${escapeHtml(finding.severity)}</span>
    <span class="finding-location">${finding.line}:${finding.column}</span>
    <span class="finding-message">${escapeHtml(finding.message)}</span>
    <span class="finding-rule">${escapeHtml(finding.rule)}</span>
  </div>
  ${reasonHtml}
  ${suggestionsHtml}
  ${codeHtml}
</li>`;
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

/** 파일 하나에 대한 섹션 — cwd 기준 상대경로 헤더 + 그 파일의 finding 목록 */
export function renderFileSection(file: string, findings: Finding[], verbose: boolean): string {
  return `<section class="file-group">
  <h2 class="file-path">${escapeHtml(relativePath(file))}</h2>
  <ul class="finding-list">
    ${findings.map((finding) => renderFinding(finding, verbose)).join("\n")}
  </ul>
</section>`;
}

/** `<body>` 내부 콘텐츠 — findings가 없으면 요약 + 빈 상태 메시지만 보여준다 */
export function renderBody(findings: Finding[], verbose: boolean): string {
  if (findings.length === 0) {
    return `${renderSummary(findings)}
<p class="empty-state">No async bottlenecks found.</p>`;
  }

  const sections = Array.from(groupByFile(findings), ([file, fileFindings]) =>
    renderFileSection(file, fileFindings, verbose),
  ).join("\n");

  return `${renderSummary(findings)}
<main>${sections}</main>`;
}

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #6b7280;
  --border: #e5e7eb;
  --card-bg: #f9fafb;
  --error: #dc2626;
  --error-bg: #fef2f2;
  --warning: #b45309;
  --warning-bg: #fffbeb;
  --info: #2563eb;
  --info-bg: #eff6ff;
  --code-bg: #111827;
  --code-fg: #f3f4f6;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --fg: #e5e7eb;
    --muted: #9ca3af;
    --border: #1f2937;
    --card-bg: #1e293b;
    --error-bg: #3f1d1d;
    --warning-bg: #3f2d0f;
    --info-bg: #0f2942;
    --code-bg: #020617;
    --code-fg: #e5e7eb;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.5;
}

h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }

.summary {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.summary-total { color: var(--muted); margin: 0 0 0.75rem; }

.summary-counts {
  list-style: none;
  display: flex;
  gap: 0.75rem;
  padding: 0;
  margin: 0;
  flex-wrap: wrap;
}

.summary-counts li {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 600;
  background: var(--card-bg);
}

.summary-counts .severity-error { color: var(--error); background: var(--error-bg); }
.summary-counts .severity-warning { color: var(--warning); background: var(--warning-bg); }
.summary-counts .severity-info { color: var(--info); background: var(--info-bg); }

.file-group { margin-bottom: 2rem; }

.file-path {
  font-size: 1.05rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  padding-bottom: 0.5rem;
  margin: 0 0 0.75rem;
  border-bottom: 1px solid var(--border);
}

.finding-list { list-style: none; padding: 0; margin: 0; }

.finding {
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  border-left-width: 4px;
  background: var(--card-bg);
}

.finding.severity-error { border-left-color: var(--error); }
.finding.severity-warning { border-left-color: var(--warning); }
.finding.severity-info { border-left-color: var(--info); }

.finding-header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
}

.finding-severity {
  text-transform: uppercase;
  font-weight: 700;
  font-size: 0.75rem;
  letter-spacing: 0.03em;
}

.finding.severity-error .finding-severity { color: var(--error); }
.finding.severity-warning .finding-severity { color: var(--warning); }
.finding.severity-info .finding-severity { color: var(--info); }

.finding-location {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--muted);
  font-size: 0.875rem;
}

.finding-message { font-weight: 500; }

.finding-rule {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.8rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.finding-reason,
.finding-suggestions {
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
  color: var(--muted);
}

.finding-suggestions { padding-left: 1.25rem; }

.finding-code {
  margin: 0.5rem 0 0;
  padding: 0.75rem;
  border-radius: 0.375rem;
  background: var(--code-bg);
  color: var(--code-fg);
  overflow-x: auto;
  font-size: 0.85rem;
}

.finding-code code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre;
}

.empty-state { color: var(--muted); font-size: 1rem; }
`;

/** 전체 HTML 문서를 조립한다. HTML은 문자열 자체가 산출물이므로 문서 조립은 여기서 끝난다. */
function renderDocument(findings: Finding[], options: ReportOptions): string {
  const verbose = options.verbose === true;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>async-doctor v${escapeHtml(VERSION)} report</title>
<style>${STYLE}</style>
</head>
<body>
${renderBody(findings, verbose)}
</body>
</html>
`;
}

export class HtmlReporter implements Reporter {
  readonly format: ReportFormat = "html";

  report(findings: Finding[], options: ReportOptions = {}): string {
    return renderDocument(findings, options);
  }
}

export const htmlReporter = new HtmlReporter();
