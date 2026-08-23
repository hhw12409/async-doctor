import type { Severity } from "./types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

export const SEVERITIES: Severity[] = ["error", "warning", "info"];

/** 임의의 문자열이 Severity인지 좁혀준다 (CLI --severity 검증에 사용) */
export function isSeverity(value: string): value is Severity {
  return Object.prototype.hasOwnProperty.call(SEVERITY_RANK, value);
}

/** severity가 threshold 이상인지 판단 (--severity 옵션 필터링에 사용) */
export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}

/** 심각도 내림차순 정렬용 비교 함수 (error가 먼저) */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANK[b] - SEVERITY_RANK[a];
}
