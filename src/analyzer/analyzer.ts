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
   * 테스트에서 특정 rule만 실행할 때, 또는 CLI가 설정 파일의 `rules.<name>: "off"`를
   * 걸러낸 배열을 주입할 때 사용한다.
   */
  rules?: AsyncDoctorRule[];
  /**
   * rule 이름 → 이 rule이 만드는 모든 Finding의 severity를 덮어쓸 값.
   * 각 rule은 `Finding.severity`를 자체 로직으로 하드코딩해 push하므로(rule.severity를
   * 참조하는 간접 구조가 아니다), severity 오버라이드는 rule 레벨이 아니라 여기서 처리한다.
   * 억제 코멘트 필터링보다 먼저, `severityThreshold` 필터링보다 먼저 적용된다 — 오버라이드로
   * 심각도가 바뀐 뒤의 값을 기준으로 억제/threshold 판단이 이뤄져야 하기 때문이다.
   */
  severityOverrides?: Partial<Record<string, Severity>>;
}

/**
 * export된 이유: `fixer.ts`가 fix를 적용할 때 동일한 컴파일러 옵션으로 파일을 열어야
 * `analyze()`가 본 것과 같은 방식으로 텍스트 삽입 위치를 해석한다. 옵션을 두 곳에
 * 따로 하드코딩하면 언젠가 드리프트해 fix 위치가 어긋나는 버그로 이어질 수 있어
 * 하나의 정의를 공유한다 — `analyze()` 함수 자체의 동작은 바뀌지 않는다.
 */
export function createProject(): Project {
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
        const ruleFindings = rule.analyze(context);
        const override = options.severityOverrides?.[rule.name];
        if (override) {
          for (const finding of ruleFindings) finding.severity = override;
        }
        fileFindings.push(...ruleFindings);
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
