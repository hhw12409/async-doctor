import { Project, ts } from "ts-morph";
import { rules as defaultRules } from "../rules/index.js";
import { createContext } from "./context.js";
import { collectSuppressions, isSuppressed } from "./suppressions.js";
import { compareSeverity, meetsThreshold } from "../core/severity.js";
import type { AsyncDoctorRule, Finding, Severity } from "../core/types.js";

export interface AnalyzeOptions {
  /** 지정 시 이 심각도 이상의 Finding만 반환한다 */
  severityThreshold?: Severity;
  /**
   * 실행할 rule 목록. 기본값은 src/rules/index.ts의 레지스트리.
   * 테스트에서 특정 rule만 실행할 때 주입한다.
   */
  rules?: AsyncDoctorRule[];
}

function createProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  });
}

/**
 * 확정된 파일 경로 목록에 대해 모든 rule을 실행한다.
 * analyzer의 책임은 "rule 실행"뿐이다 — 경로 탐색은 file-discovery.ts가 담당한다.
 *
 * rule 추가 시 이 함수는 절대 수정되지 않는다: rules 배열을 순회할 뿐이다.
 */
export function analyze(filePaths: string[], options: AnalyzeOptions = {}): Finding[] {
  const rules = options.rules ?? defaultRules;
  const project = createProject();
  const findings: Finding[] = [];

  for (const filePath of filePaths) {
    const sourceFile = project.getSourceFile(filePath) ?? project.addSourceFileAtPath(filePath);
    const context = createContext(sourceFile, filePath);
    const fileFindings: Finding[] = [];

    for (const rule of rules) {
      try {
        fileFindings.push(...rule.analyze(context));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Rule "${rule.name}" failed on ${filePath}: ${message}`);
      }
    }

    // 인라인 억제 코멘트(// async-doctor-disable-next-line 등)로 걸러낸 뒤에만
    // 전역 findings에 반영한다. rule 실행 자체와는 무관한 별도 관심사다.
    const suppressions = collectSuppressions(sourceFile);
    findings.push(...fileFindings.filter((finding) => !isSuppressed(finding, suppressions)));
  }

  const threshold = options.severityThreshold;
  const filtered = threshold
    ? findings.filter((f) => meetsThreshold(f.severity, threshold))
    : findings;

  return sortFindings(filtered);
}

/** 파일 → 라인 → 컬럼 → 심각도 순으로 정렬해 출력 순서를 안정화한다 */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    return compareSeverity(a.severity, b.severity);
  });
}
