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
export { loadConfig, ConfigError, CONFIG_FILE_NAME } from "./core/config.js";
export type { AsyncDoctorConfig } from "./core/config.js";

export { analyze, sortFindings, createProject } from "./analyzer/analyzer.js";
export type { AnalyzeOptions } from "./analyzer/analyzer.js";
export { createContext } from "./analyzer/context.js";
export { applyFixes } from "./analyzer/fixer.js";
export type { FixResult } from "./analyzer/fixer.js";
export { collectSuppressions, isSuppressed } from "./analyzer/suppressions.js";
export type { Suppression } from "./analyzer/suppressions.js";
export {
  collectFiles,
  filterIgnored,
  isSupportedFile,
  SUPPORTED_EXTENSIONS,
  IGNORED_DIRECTORIES,
} from "./analyzer/file-discovery.js";

export { rules } from "./rules/index.js";

export type { Reporter, ReportOptions, ReportFormat } from "./reporter/types.js";
export { REPORT_FORMATS } from "./reporter/types.js";
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
