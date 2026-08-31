import type { Finding } from "../core/types.js";

/** 지원(또는 향후 지원 예정)하는 출력 형식 */
export type ReportFormat = "text" | "json" | "sarif" | "html";

/**
 * ReportFormat의 런타임 목록 — CLI `--format` 검증과 설정 파일(`format` 필드) 검증이
 * 이 배열 하나만 공유한다. 새 형식을 추가할 때 여기 한 줄만 늘리면 양쪽 다 반영된다.
 */
export const REPORT_FORMATS: ReportFormat[] = ["text", "json", "sarif", "html"];

export interface ReportOptions {
  /** Finding.code 스니펫까지 출력할지 여부 */
  verbose?: boolean;
}

/**
 * 출력 계층 추상화.
 * 새 형식(json/sarif/html)은 이 인터페이스를 구현하는 파일 하나를 추가하고
 * CLI의 --format 분기에 등록하는 것으로 끝나야 한다.
 */
export interface Reporter {
  /** 형식 식별자 (--format 값과 일치) */
  readonly format: ReportFormat;
  /** Finding 목록을 출력 문자열로 변환한다. 부수효과(콘솔 출력)는 호출자가 담당한다 */
  report(findings: Finding[], options: ReportOptions): string;
}
