import type { SourceFile } from "ts-morph";

/**
 * Finding 심각도. 필터링 순서는 error > warning > info (core/severity.ts 참조).
 */
export type Severity = "error" | "warning" | "info";

/**
 * rule이 탐지한 단일 문제. reporter가 그대로 출력하는 최종 스키마다.
 */
export interface Finding {
  /** 탐지한 rule 이름 (AsyncDoctorRule.name과 동일해야 한다) */
  rule: string;
  /** 이 Finding의 심각도. 보통 rule.severity를 그대로 쓴다 */
  severity: Severity;
  /** 분석 대상 파일 경로 */
  file: string;
  /** 1-based 라인 번호 */
  line: number;
  /** 1-based 컬럼 번호 */
  column: number;
  /** 사용자에게 보여줄 한 줄 요약 */
  message: string;
  /** 왜 문제인지에 대한 부연 설명 */
  reason?: string;
  /** 개선 제안. 각 항목이 한 줄로 출력된다 */
  suggestion?: string[];
  /** 문제 지점의 소스 스니펫. --verbose일 때만 출력된다 */
  code?: string;
}

/**
 * rule 하나가 파일 하나를 분석할 때 받는 입력.
 * 확장이 필요하면 core-architect가 이 인터페이스를 수정한다.
 */
export interface AnalysisContext {
  /** ts-morph SourceFile — AST 순회 진입점 */
  sourceFile: SourceFile;
  /** 분석 대상 파일 경로 (Finding.file에 그대로 넣는다) */
  filePath: string;
}

/**
 * 확장점. 새 rule은 이 인터페이스를 구현하고 src/rules/index.ts의 배열에 등록하면 된다.
 * analyzer는 개별 rule을 알지 못하며 배열만 순회한다.
 */
export interface AsyncDoctorRule {
  /** kebab-case 고유 식별자 (예: "no-await-in-loop") */
  name: string;
  /** rule이 무엇을 탐지하는지에 대한 한 줄 설명 */
  description: string;
  /** 이 rule이 생성하는 Finding의 기본 심각도 */
  severity: Severity;
  /** 분석 실행. 문제가 없으면 빈 배열을 반환한다 */
  analyze(context: AnalysisContext): Finding[];
}
