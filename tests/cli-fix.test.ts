import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/index.js";
import { CONFIG_FILE_NAME } from "../src/core/config.js";

/**
 * `--fix`/`--fix-dry-run`은 이 프로젝트 역사상 처음으로 사용자 소스 파일을 실제로 쓰는
 * 기능이므로, tests/cli-config.test.ts와 동일하게 실제 임시 디렉토리로 chdir해 진짜 파일
 * I/O를 검증한다 (mock 금지 — 이 기능의 핵심은 "파일이 정확히 바뀌는가/안 바뀌는가").
 */
let originalCwd: string;
let tmpDir: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "async-doctor-cli-fix-"));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeConfig(content: string): void {
  fs.writeFileSync(path.join(tmpDir, CONFIG_FILE_NAME), content, "utf8");
}

function writeFixture(name: string, content: string): void {
  fs.writeFileSync(path.join(tmpDir, name), content, "utf8");
}

function readFixture(name: string): string {
  return fs.readFileSync(path.join(tmpDir, name), "utf8");
}

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function invoke(argv: string[]): RunResult {
  const out: string[] = [];
  const err: string[] = [];

  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write);

  const exitCode = run(argv);

  return { exitCode, stdout: out.join(""), stderr: err.join("") };
}

/** rule-engineer 요약의 검증 fixture와 동일한 형태 — no-floating-promise 1건만 나온다 */
const SINGLE_FLOATING_PROMISE = `async function getUser(id: string): Promise<{ id: string }> {
  return { id };
}

async function run(id: string) {
  getUser(id);
}
`;

const FIXED_SINGLE_FLOATING_PROMISE = `async function getUser(id: string): Promise<{ id: string }> {
  return { id };
}

async function run(id: string) {
  void getUser(id);
}
`;

describe("CLI — --fix-dry-run", () => {
  it("파일을 바꾸지 않고 stderr에 미리보기를 출력하며 exit code는 플래그 없을 때와 동일하다", () => {
    writeFixture("main.ts", SINGLE_FLOATING_PROMISE);

    const plain = invoke(["."]);
    writeFixture("main.ts", SINGLE_FLOATING_PROMISE); // invoke 간 파일 상태를 명시적으로 재고정

    const dryRun = invoke([".", "--fix-dry-run"]);

    expect(readFixture("main.ts")).toBe(SINGLE_FLOATING_PROMISE); // 1바이트도 안 바뀜
    expect(dryRun.stderr).toContain("Would fix 1 finding(s) in 1 file(s):");
    expect(dryRun.stderr).toContain("main.ts:6 no-floating-promise");
    expect(dryRun.exitCode).toBe(plain.exitCode);
    expect(dryRun.exitCode).toBe(1);
  });
});

describe("CLI — --fix", () => {
  it("파일이 void 접두사로 바뀌고 stderr 메시지가 찍히며 재분석 후 exit code가 0이 된다", () => {
    writeFixture("main.ts", SINGLE_FLOATING_PROMISE);

    const { exitCode, stdout, stderr } = invoke([".", "--fix"]);

    expect(readFixture("main.ts")).toBe(FIXED_SINGLE_FLOATING_PROMISE);
    expect(stderr).toContain("Fixed 1 finding(s) in 1 file(s).");
    expect(stdout).toContain("No async bottlenecks found.");
    expect(exitCode).toBe(0);
  });

  it("멱등성: --fix를 연속 두 번 실행하면 두 번째는 아무것도 바꾸지 않는다", () => {
    writeFixture("main.ts", SINGLE_FLOATING_PROMISE);

    const first = invoke([".", "--fix"]);
    expect(first.stderr).toContain("Fixed 1 finding(s) in 1 file(s).");
    const afterFirst = readFixture("main.ts");
    expect(afterFirst).toBe(FIXED_SINGLE_FLOATING_PROMISE);

    const second = invoke([".", "--fix"]);

    expect(second.stderr).not.toContain("Fixed");
    expect(second.exitCode).toBe(0);
    expect(readFixture("main.ts")).toBe(afterFirst); // 두 번째 실행 후에도 완전히 동일
  });
});

describe("CLI — --fix와 --fix-dry-run 동시 지정", () => {
  it("exit 2와 'cannot be used together' 에러를 낸다", () => {
    writeFixture("main.ts", SINGLE_FLOATING_PROMISE);

    const { exitCode, stderr } = invoke([".", "--fix", "--fix-dry-run"]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("--fix and --fix-dry-run cannot be used together.");
  });
});

describe("CLI — 억제 코멘트와 --fix의 상호작용", () => {
  it("disable-next-line이 붙은 floating promise는 analyze()에서 애초에 제외되어 --fix가 건드리지 않는다", () => {
    const suppressed = `async function getUser(id: string): Promise<{ id: string }> {
  return { id };
}

async function run(id: string) {
  // async-doctor-disable-next-line no-floating-promise
  getUser(id);
}
`;
    writeFixture("main.ts", suppressed);

    const plain = invoke(["."]);
    expect(plain.exitCode).toBe(0); // 억제되어 finding 자체가 없음

    const { exitCode, stderr } = invoke([".", "--fix"]);

    expect(readFixture("main.ts")).toBe(suppressed); // 전혀 안 바뀜
    expect(stderr).not.toContain("Fixed");
    expect(exitCode).toBe(0);
  });
});

describe("CLI — config rules off와 --fix의 상호작용", () => {
  it("no-floating-promise가 off면 --fix가 아무것도 바꾸지 않는다", () => {
    writeFixture("main.ts", SINGLE_FLOATING_PROMISE);
    writeConfig(JSON.stringify({ rules: { "no-floating-promise": "off" } }));

    const { exitCode, stderr } = invoke([".", "--fix"]);

    expect(readFixture("main.ts")).toBe(SINGLE_FLOATING_PROMISE);
    expect(stderr).not.toContain("Fixed");
    expect(exitCode).toBe(0);
  });
});

describe("CLI — fix 없는 rule과 섞여 있을 때", () => {
  it("--fix가 no-floating-promise만 고치고 fix 없는 다른 finding은 리포트에 그대로 남는다", () => {
    const mixed = `declare function getUser(id: string): Promise<{ id: string }>;
declare function processItem(item: string): Promise<void>;

async function run(id: string, items: string[]) {
  getUser(id);
  for (const item of items) {
    await processItem(item);
  }
}
`;
    writeFixture("main.ts", mixed);

    const { exitCode, stdout, stderr } = invoke([".", "--fix", "--format", "json"]);

    expect(stderr).toContain("Fixed 1 finding(s) in 1 file(s).");
    const report = JSON.parse(stdout);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].rule).toBe("no-await-in-loop");
    expect(exitCode).toBe(1); // no-await-in-loop finding이 남아 있으므로 여전히 exit 1

    const fixed = readFixture("main.ts");
    expect(fixed).toContain("void getUser(id);");
    expect(fixed).toContain("await processItem(item);"); // fix 없는 finding의 코드는 그대로
  });
});

describe("CLI — 여러 파일에 걸친 --fix", () => {
  it("파일 개수 M, finding 개수 N(N >= M)이 메시지에 정확히 반영되고 전부 정확히 고쳐진다", () => {
    const fileA = `async function getUser(id: string): Promise<string> {
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
    const fileB = `async function getComments(id: string): Promise<string[]> {
  return [id];
}

async function run2(id: string) {
  getComments(id);
}
`;
    writeFixture("a.ts", fileA);
    writeFixture("b.ts", fileB);

    const { exitCode, stdout, stderr } = invoke([".", "--fix"]);

    expect(stderr).toContain("Fixed 3 finding(s) in 2 file(s)."); // N=3 findings, M=2 files
    expect(stdout).toContain("No async bottlenecks found.");
    expect(exitCode).toBe(0);

    expect(readFixture("a.ts")).toContain("void getUser(id);");
    expect(readFixture("a.ts")).toContain("void getPosts(id);");
    expect(readFixture("b.ts")).toContain("void getComments(id);");
  });
});
