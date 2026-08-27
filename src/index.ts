/**
 * 프로그래매틱 진입점.
 *
 * ```ts
 * import { analyze, collectFiles, consoleReporter } from "async-doctor";
 *
 * const findings = analyze(collectFiles("src"), { severityThreshold: "warning" });
 * console.log(consoleReporter.report(findings, { verbose: true }));
 * ```
 */
export type { Severity, Finding, AnalysisContext, AsyncDoctorRule } from "./core/types.js";
export { meetsThreshold, compareSeverity, isSeverity, SEVERITIES } from "./core/severity.js";

export { analyze, sortFindings } from "./analyzer/analyzer.js";
export type { AnalyzeOptions } from "./analyzer/analyzer.js";
export { createContext } from "./analyzer/context.js";
export {
  collectFiles,
  isSupportedFile,
  SUPPORTED_EXTENSIONS,
  IGNORED_DIRECTORIES,
} from "./analyzer/file-discovery.js";

export { rules } from "./rules/index.js";

export type { Reporter, ReportOptions, ReportFormat } from "./reporter/types.js";
export { ConsoleReporter, consoleReporter } from "./reporter/console-reporter.js";
export { JsonReporter, jsonReporter, buildJsonReport } from "./reporter/json-reporter.js";
export type { JsonReport, JsonReportSummary } from "./reporter/json-reporter.js";
export {
  SarifReporter,
  sarifReporter,
  buildSarifLog,
  toSarifLevel,
} from "./reporter/sarif-reporter.js";
export type { SarifLog, SarifResult, SarifLevel } from "./reporter/sarif-reporter.js";
export { HtmlReporter, htmlReporter, escapeHtml } from "./reporter/html-reporter.js";
export { relativePath, toPosixPath, countBySeverity } from "./reporter/shared.js";

export { VERSION, HOMEPAGE } from "./core/package-info.js";
