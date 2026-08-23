/**
 * Reporter 구현체들이 공유하는 순수 헬퍼.
 *
 * 경로 표기 정책이 형식마다 다르다는 점에 주의한다:
 * - text(console): 사람이 읽기 좋게 cwd 기준 상대경로
 * - json: 머신 소비용이라 절대경로 그대로
 * - sarif: 스펙 관례상 상대경로 + POSIX 슬래시
 */
import path from "node:path";
import type { Finding, Severity } from "../core/types.js";

/**
 * cwd 기준 상대경로로 바꾼다.
 *
 * cwd 밖(`..`로 시작)이거나 cwd 자기 자신인 경우에는 상대경로가 오히려 읽기 어려우므로
 * 원본 절대경로를 그대로 돌려준다.
 */
export function relativePath(filePath: string): string {
  const rel = path.relative(process.cwd(), filePath);
  return rel === "" || rel.startsWith("..") ? filePath : rel;
}

/**
 * 플랫폼 구분자를 POSIX 슬래시로 정규화한다.
 * SARIF의 `artifactLocation.uri`는 URI 형식이라 Windows에서도 `/`를 써야 한다.
 */
export function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

/** severity별 Finding 개수 — 요약 줄과 JSON summary가 함께 쓴다 */
export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}
