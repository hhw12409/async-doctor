import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyFixes } from "../../src/analyzer/fixer.js";
import type { Finding } from "../../src/core/types.js";

/**
 * applyFixes는 실제 파일시스템 쓰기가 핵심 동작이므로 mock하지 않는다 — 실제 임시
 * 디렉토리에 실제 .ts 파일을 만들고 진짜 fs 호출 결과를 검증한다.
 * (core-architect 요약 §"applyFixes 내부 동작" 참고: 내림차순 적용, dry-run 시 저장 안 함,
 * 포매터 미호출이 이 기능의 핵심 신뢰성이므로 이 세 가지를 가장 엄격하게 검증한다.)
 */
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "async-doctor-fixer-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

/** content 안에서 substring이 시작하는 0-based 문자 오프셋을 찾는다 (fix.insertAt 계산용) */
function offsetOf(content: string, substring: string): number {
  const idx = content.indexOf(substring);
  if (idx === -1) throw new Error(`substring not found in fixture: ${substring}`);
  return idx;
}

/** applyFixes가 채우지 않는 나머지 Finding 필드는 이 함수에서 더미 값으로 채운다 — fixer는 file/fix만 본다 */
function makeFinding(file: string, insertAt: number, text = "void "): Finding {
  return {
    rule: "no-floating-promise",
    severity: "warning",
    file,
    line: 1,
    column: 1,
    message: "test finding",
    fix: { insertAt, text },
  };
}

const SINGLE_CALL_SOURCE = `async function getUser(id: string): Promise<{ id: string }> {
  return { id };
}

async function run(id: string) {
  getUser(id);
}
`;

describe("applyFixes — dryRun: true", () => {
  it("파일을 1바이트도 바꾸지 않는다 (내용/mtime 실행 전후 동일)", () => {
    const filePath = writeFile("single.ts", SINGLE_CALL_SOURCE);
    const before = readFile(filePath);
    const mtimeBefore = fs.statSync(filePath).mtimeMs;

    const finding = makeFinding(filePath, offsetOf(SINGLE_CALL_SOURCE, "getUser(id)"));
    const result = applyFixes([finding], { dryRun: true });

    expect(result.fixedCount).toBe(1);
    expect(result.fixedFiles).toEqual([filePath]);

    const after = readFile(filePath);
    const mtimeAfter = fs.statSync(filePath).mtimeMs;

    expect(after).toBe(before);
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});

describe("applyFixes — dryRun: false", () => {
  it("정확히 insertAt 위치에 text를 삽입하고 그 외 문자는 전혀 바뀌지 않는다", () => {
    const filePath = writeFile("single.ts", SINGLE_CALL_SOURCE);
    const insertAt = offsetOf(SINGLE_CALL_SOURCE, "getUser(id)");
    const finding = makeFinding(filePath, insertAt);

    const result = applyFixes([finding], { dryRun: false });

    expect(result.fixedCount).toBe(1);
    expect(result.fixedFiles).toEqual([filePath]);

    const expected =
      SINGLE_CALL_SOURCE.slice(0, insertAt) + "void " + SINGLE_CALL_SOURCE.slice(insertAt);
    expect(readFile(filePath)).toBe(expected);
    expect(readFile(filePath)).toContain("  void getUser(id);\n");
  });

  it("한 파일에 fix가 여러 개일 때 배열에 오름차순으로 넣어도 최종 결과가 정확하다", () => {
    const source = `async function getUser(id: string): Promise<string> {
  return id;
}

async function getPosts(id: string): Promise<string[]> {
  return [id];
}

async function run(id: string) {
  getUser(id);
  getPosts(id);
}
`;
    const filePath = writeFile("multi.ts", source);
    const userOffset = offsetOf(source, "getUser(id);");
    const postsOffset = offsetOf(source, "getPosts(id);");
    expect(userOffset).toBeLessThan(postsOffset); // 전제 확인: 오름차순 배열을 실제로 구성했는지

    // 의도적으로 오름차순(파일 상 앞쪽 offset 먼저)으로 배열에 넣는다 — 내림차순 적용 로직이
    // 배열 순서가 아니라 insertAt 값 자체를 기준으로 동작함을 증명한다.
    const findings = [makeFinding(filePath, userOffset), makeFinding(filePath, postsOffset)];

    const result = applyFixes(findings, { dryRun: false });

    expect(result.fixedCount).toBe(2);
    expect(result.fixedFiles).toEqual([filePath]);

    const expected =
      source.slice(0, userOffset) +
      "void " +
      source.slice(userOffset, postsOffset) +
      "void " +
      source.slice(postsOffset);
    expect(readFile(filePath)).toBe(expected);
    expect(readFile(filePath)).toContain("  void getUser(id);\n");
    expect(readFile(filePath)).toContain("  void getPosts(id);\n");
  });

  it("fix 필드가 없는 finding은 무시되고 카운트되지 않는다", () => {
    const filePath = writeFile("single.ts", SINGLE_CALL_SOURCE);
    const withFix = makeFinding(filePath, offsetOf(SINGLE_CALL_SOURCE, "getUser(id)"));
    const withoutFix: Finding = {
      rule: "no-await-in-loop",
      severity: "warning",
      file: filePath,
      line: 5,
      column: 1,
      message: "no fix here",
    };

    const result = applyFixes([withoutFix, withFix], { dryRun: false });

    expect(result.fixedCount).toBe(1); // withoutFix는 세지 않음
    expect(result.fixedFiles).toEqual([filePath]);
    expect(readFile(filePath)).toContain("  void getUser(id);\n");
  });

  it("여러 파일에 걸친 fix가 각각 올바른 파일에만 적용된다", () => {
    const sourceA = `async function getUser(id: string): Promise<string> {
  return id;
}

async function run(id: string) {
  getUser(id);
}
`;
    const sourceB = `async function getComments(id: string): Promise<string[]> {
  return [id];
}

async function run2(id: string) {
  getComments(id);
}
`;
    const fileA = writeFile("a.ts", sourceA);
    const fileB = writeFile("b.ts", sourceB);

    const findings = [
      makeFinding(fileB, offsetOf(sourceB, "getComments(id);")),
      makeFinding(fileA, offsetOf(sourceA, "getUser(id);")),
    ];

    const result = applyFixes(findings, { dryRun: false });

    expect(result.fixedCount).toBe(2);
    expect(result.fixedFiles).toEqual([fileA, fileB].sort());

    expect(readFile(fileA)).toContain("  void getUser(id);\n");
    expect(readFile(fileA)).not.toContain("void getComments");
    expect(readFile(fileB)).toContain("  void getComments(id);\n");
    expect(readFile(fileB)).not.toContain("void getUser");
  });
});

describe("applyFixes — fix 후보 없음", () => {
  it("findings가 비어 있으면 { fixedCount: 0, fixedFiles: [] }를 반환한다", () => {
    expect(applyFixes([], { dryRun: false })).toEqual({ fixedCount: 0, fixedFiles: [] });
  });

  it("아무 finding도 fix가 없으면 { fixedCount: 0, fixedFiles: [] }를 반환하고 파일도 안 바뀐다", () => {
    const filePath = writeFile("single.ts", SINGLE_CALL_SOURCE);
    const findings: Finding[] = [
      {
        rule: "no-await-in-loop",
        severity: "warning",
        file: filePath,
        line: 5,
        column: 1,
        message: "no fix here",
      },
    ];

    const result = applyFixes(findings, { dryRun: false });

    expect(result).toEqual({ fixedCount: 0, fixedFiles: [] });
    expect(readFile(filePath)).toBe(SINGLE_CALL_SOURCE);
  });
});
