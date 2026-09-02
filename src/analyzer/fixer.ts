/**
 * `Finding.fix`를 실제 파일에 적용하는 모듈. `analyze()`는 순수 함수(파일을 읽기만
 * 한다)이므로 파일시스템 쓰기라는 부수효과는 별도 모듈로 분리한다 — 관심사는
 * analyzer와 가까우니 같은 디렉토리에 둔다.
 *
 * `fix`가 있는 finding만 다룬다. 다른 4개 rule은 `fix` 필드를 채우지 않으므로 이 모듈이
 * 알 필요도 없이 자동으로 "자동 수정 가능한 finding만" 대상이 된다 — 별도의
 * allowlist/blocklist는 없다.
 */
import { createProject } from "./analyzer.js";
import type { Finding } from "../core/types.js";

export interface FixResult {
  /** 실제로(또는 dry-run이면 "적용했을") 삽입한 fix 개수 */
  fixedCount: number;
  /** 쓰기가 일어난(또는 dry-run이면 "일어났을") 파일의 절대경로 목록. 정렬됨 */
  fixedFiles: string[];
}

type Fix = NonNullable<Finding["fix"]>;

/**
 * `findings`에서 `fix`가 있는 것만 골라 실제로 적용한다.
 *
 * - `dryRun: true`면 텍스트 삽입까지는 ts-morph in-memory 모델에 계산하되(정확한 개수를
 *   세기 위해) `saveSync()`를 호출하지 않는다 — 디스크의 원본 파일은 1바이트도 바뀌지 않는다.
 * - `dryRun: false`면 삽입 후 파일마다 `saveSync()`로 실제 디스크에 쓴다.
 * - 포매터(`formatText()` 등)는 절대 호출하지 않는다 — 삽입 지점 이외의 diff가 생기지
 *   않는 것이 이 기능의 핵심 신뢰성이다.
 */
export function applyFixes(findings: Finding[], options: { dryRun: boolean }): FixResult {
  const fixesByFile = new Map<string, Fix[]>();
  for (const finding of findings) {
    if (!finding.fix) continue;
    const fixes = fixesByFile.get(finding.file) ?? [];
    fixes.push(finding.fix);
    fixesByFile.set(finding.file, fixes);
  }

  if (fixesByFile.size === 0) {
    return { fixedCount: 0, fixedFiles: [] };
  }

  const project = createProject();
  const fixedFiles: string[] = [];
  let fixedCount = 0;

  for (const [filePath, fixes] of fixesByFile) {
    const sourceFile = project.getSourceFile(filePath) ?? project.addSourceFileAtPath(filePath);

    // 한 파일 안에 삽입이 여럿이면 반드시 insertAt 내림차순으로 적용한다 — 오름차순이면
    // 앞쪽 삽입이 텍스트를 늘려서 뒤쪽 삽입의 위치를 밀어버려 어긋난다. 내림차순이면 각
    // 삽입이 자신보다 뒤에 있는(이미 처리된) 텍스트에만 영향을 주므로 안전하다.
    const descending = [...fixes].sort((a, b) => b.insertAt - a.insertAt);
    for (const fix of descending) {
      sourceFile.insertText(fix.insertAt, fix.text);
      fixedCount += 1;
    }

    fixedFiles.push(filePath);
    if (!options.dryRun) {
      sourceFile.saveSync();
    }
  }

  return { fixedCount, fixedFiles: fixedFiles.sort() };
}
