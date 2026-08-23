import path from "node:path";
import type { Finding, Severity } from "../core/types.js";
import type { ReportOptions, Reporter, ReportFormat } from "./types.js";

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  underline: "\u001b[4m",
} as const;

function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  return Boolean(process.stdout.isTTY);
}

function paint(text: string, ...codes: string[]): string {
  if (!colorEnabled()) return text;
  return `${codes.join("")}${text}${ANSI.reset}`;
}

function severityLabel(severity: Severity): string {
  switch (severity) {
    case "error":
      return paint("error", ANSI.red, ANSI.bold);
    case "warning":
      return paint("warning", ANSI.yellow);
    case "info":
      return paint("info", ANSI.cyan);
  }
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

function relative(filePath: string): string {
  const rel = path.relative(process.cwd(), filePath);
  return rel === "" || rel.startsWith("..") ? filePath : rel;
}

function summarize(findings: Finding[]): string {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }

  const parts: string[] = [];
  if (counts.error > 0) parts.push(`${counts.error} error${counts.error === 1 ? "" : "s"}`);
  if (counts.warning > 0) parts.push(`${counts.warning} warning${counts.warning === 1 ? "" : "s"}`);
  if (counts.info > 0) parts.push(`${counts.info} info`);

  const total = findings.length;
  const head = `${total} problem${total === 1 ? "" : "s"}`;
  return parts.length > 0 ? `${head} (${parts.join(", ")})` : head;
}

/**
 * 1차 버전의 유일한 Reporter 구현체 — text 출력.
 * json/sarif/html은 동일 인터페이스를 구현하는 새 파일로 추가한다.
 */
export class ConsoleReporter implements Reporter {
  readonly format: ReportFormat = "text";

  report(findings: Finding[], options: ReportOptions = {}): string {
    if (findings.length === 0) {
      return "No async bottlenecks found.";
    }

    const lines: string[] = [];

    for (const [file, fileFindings] of groupByFile(findings)) {
      lines.push(paint(relative(file), ANSI.underline, ANSI.bold));

      for (const finding of fileFindings) {
        const location = paint(`${finding.line}:${finding.column}`, ANSI.dim);
        const rule = paint(finding.rule, ANSI.dim);
        lines.push(
          `  ${location}  ${severityLabel(finding.severity)}  ${finding.message}  ${rule}`,
        );

        if (finding.reason) {
          lines.push(`      ${paint("why:", ANSI.dim)} ${finding.reason}`);
        }

        for (const suggestion of finding.suggestion ?? []) {
          lines.push(`      ${paint("fix:", ANSI.dim)} ${suggestion}`);
        }

        if (options.verbose && finding.code) {
          for (const codeLine of finding.code.split("\n")) {
            lines.push(`      ${paint(`| ${codeLine}`, ANSI.dim)}`);
          }
        }
      }

      lines.push("");
    }

    lines.push(summarize(findings));
    return lines.join("\n");
  }
}

export const consoleReporter = new ConsoleReporter();
