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

/**
 * `.async-doctorrc.json`의 `ignore` glob 패턴을 매칭하는 최소 구현.
 * 완전한 glob 스펙(`?`, `{a,b}`, `[abc]` 등)은 지원하지 않는다 — 새 npm 의존성을 추가하지
 * 않기 위한 의도적 축소, 이 프로젝트의 기존 dependencies는 ts-morph 하나뿐이라는 관례를 유지.
 *
 * 지원 문법:
 * - `*`  세그먼트 내부의 임의 문자열 (경로 구분자 `/`는 넘지 않는다)
 * - `**` 임의 깊이의 경로 세그먼트, 0단계 포함 (`**\/`는 그 뒤 슬래시까지 함께 삼킨다)
 * - 그 외 문자는 리터럴로 매칭
 */
const GLOB_ESCAPE = /[.+^${}()|[\]\\]/g;

function globToRegExp(pattern: string): RegExp {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];

    if (char === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 3;
      } else {
        out += ".*";
        i += 2;
      }
      continue;
    }

    if (char === "*") {
      out += "[^/]*";
      i += 1;
      continue;
    }

    out += char.replace(GLOB_ESCAPE, "\\$&");
    i += 1;
  }
  return new RegExp(`^${out}$`);
}

/** 절대 경로를 `cwd` 기준 POSIX 상대경로로 바꾼다 — ignore 패턴은 항상 `/`를 구분자로 쓴다 */
function toRelativePosix(filePath: string, cwd: string): string {
  return path.relative(cwd, filePath).split(path.sep).join("/");
}

/**
 * `collectFiles()`가 반환한 파일 목록에서 `patterns` 중 하나라도 매칭되는 파일을 제외한다.
 * 패턴은 `cwd` 기준 상대경로에 대해 매칭된다.
 */
export function filterIgnored(files: string[], patterns: string[], cwd: string): string[] {
  if (patterns.length === 0) return files;

  const regexes = patterns.map(globToRegExp);
  return files.filter((file) => {
    const rel = toRelativePosix(file, cwd);
    return !regexes.some((regex) => regex.test(rel));
  });
}
