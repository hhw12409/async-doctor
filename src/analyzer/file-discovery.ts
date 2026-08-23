import fs from "node:fs";
import path from "node:path";

/**
 * 분석 대상 확장자. CLI의 디렉토리 탐색과 analyzer가 이 상수 하나만 공유한다 —
 * 양쪽에서 각자 하드코딩하면 경계면 불일치가 생긴다.
 */
export const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"] as const;

/** 디렉토리 재귀 탐색 시 건너뛰는 디렉토리 이름 */
export const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  ".turbo",
]);

export function isSupportedFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

/** .d.ts 등 선언 파일은 실행 코드가 없으므로 분석 대상에서 제외한다 */
function isDeclarationFile(filePath: string): boolean {
  return /\.d\.(ts|mts|cts)$/.test(filePath);
}

/**
 * 입력 경로(파일 하나 또는 디렉토리)를 실제 분석 대상 파일 경로 목록으로 확장한다.
 * - 파일이면: 지원 확장자인 경우에만 그 파일 하나
 * - 디렉토리면: 지원 확장자로 재귀 탐색
 *
 * 반환 경로는 절대 경로이며 정렬·중복 제거된 상태다.
 */
export function collectFiles(targetPath: string): string[] {
  const absolute = path.resolve(targetPath);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolute);
  } catch {
    throw new Error(`Path not found: ${targetPath}`);
  }

  const collected: string[] = [];

  if (stat.isFile()) {
    if (isSupportedFile(absolute) && !isDeclarationFile(absolute)) {
      collected.push(absolute);
    }
    return collected;
  }

  if (!stat.isDirectory()) {
    return collected;
  }

  const stack: string[] = [absolute];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          stack.push(entryPath);
        }
        continue;
      }

      if (entry.isFile() && isSupportedFile(entryPath) && !isDeclarationFile(entryPath)) {
        collected.push(entryPath);
      }
    }
  }

  return [...new Set(collected)].sort();
}
