import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/index.js";
import { CONFIG_FILE_NAME } from "../src/core/config.js";

/**
 * `.async-doctorrc.json` 병합 로직(src/cli/index.ts의 run())은 process.cwd()에서만 설정
 * 파일을 찾으므로, 매 테스트마다 실제 임시 디렉토리로 chdir했다가 종료 후 복귀한다.
 * 다른 테스트 파일의 cwd에 영향을 주지 않도록 afterEach에서 반드시 원복한다.
 */
let originalCwd: string;
let tmpDir: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "async-doctor-cli-config-"));
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

/** sequential-await(독립적 연속 await) + no-await-in-loop(for-of 안 await) 둘 다 트리거하는 최소 파일 */
const BOTTLENECK_SOURCE = `declare function getUser(): Promise<{ id: string }>;
declare function getOrders(): Promise<string[]>;
declare function processItem(item: string): Promise<void>;

export async function loadAndProcess(): Promise<void> {
  const user = await getUser();
  const orders = await getOrders();

  for (const order of orders) {
    await processItem(order);
  }
}
`;

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

describe("CLI — 설정 파일 없음 (회귀 없음 확인)", () => {
  it("기존 동작과 동일하게 두 rule 모두 동작한다", () => {
    writeFixture("main.ts", BOTTLENECK_SOURCE);

    const { exitCode, stdout, stderr } = invoke(["."]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("2 problems (2 warnings)");
    expect(stderr).toBe("");
  });
});

describe("CLI — rules.<name>: off", () => {
  it("해당 rule의 finding이 나오지 않는다", () => {
    writeFixture("main.ts", BOTTLENECK_SOURCE);
    writeConfig(JSON.stringify({ rules: { "no-await-in-loop": "off" } }));

    const { exitCode, stdout } = invoke([".", "--format", "json"]);

    expect(exitCode).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].rule).toBe("sequential-await");
  });
});

describe("CLI — rules.<name>: severity override", () => {
  it("원래 warning인 rule의 finding severity가 덮어써진다", () => {
    writeFixture("main.ts", BOTTLENECK_SOURCE);
    writeConfig(JSON.stringify({ rules: { "sequential-await": "error" } }));

    const { exitCode, stdout } = invoke([".", "--format", "json"]);

    expect(exitCode).toBe(1);
    const report = JSON.parse(stdout);
    const sequential = report.findings.find((f: { rule: string }) => f.rule === "sequential-await");
    const loop = report.findings.find((f: { rule: string }) => f.rule === "no-await-in-loop");
    expect(sequential.severity).toBe("error");
    expect(loop.severity).toBe("warning");
  });
});

describe("CLI — ignore", () => {
  it("매칭 파일이 분석 대상에서 제외된다", () => {
    writeFixture("main.ts", BOTTLENECK_SOURCE);
    writeFixture("skip.generated.ts", BOTTLENECK_SOURCE);
    writeConfig(JSON.stringify({ ignore: ["**/*.generated.ts"] }));

    const { exitCode, stdout } = invoke([".", "--format", "json"]);

    expect(exitCode).toBe(1);
    const report = JSON.parse(stdout);
    // ignore가 없었다면 4건(파일당 2건 x 2파일)이 나왔을 것 — skip.generated.ts가
    // 제외되어 main.ts의 2건만 남는다.
    expect(report.findings).toHaveLength(2);
    expect(
      report.findings.every((f: { file: string }) => !f.file.includes("skip.generated.ts")),
    ).toBe(true);
  });
});

describe("CLI — format/severity 기본값", () => {
  it("CLI 플래그 없이 설정 파일의 format/severity가 적용된다", () => {
    writeFixture("main.ts", BOTTLENECK_SOURCE);
    writeConfig(JSON.stringify({ format: "json", severity: "error" }));

    const { exitCode, stdout, stderr } = invoke(["."]);

    // severity: error 임계값이 warning 2건을 모두 걸러내므로 exit 0, 그리고 --format
    // 플래그 없이도 JSON으로 출력된다(설정 파일 기본값 적용 확인).
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(() => JSON.parse(stdout)).not.toThrow();
    expect(JSON.parse(stdout).findings).toEqual([]);
  });
});

describe("CLI — 플래그가 설정 파일보다 우선한다", () => {
  it("--format text 플래그가 설정 파일의 format: json을 덮어쓴다", () => {
    writeFixture("main.ts", BOTTLENECK_SOURCE);
    writeConfig(JSON.stringify({ format: "json" }));

    const { exitCode, stdout } = invoke([".", "--format", "text"]);

    expect(exitCode).toBe(1);
    expect(() => JSON.parse(stdout)).toThrow();
    expect(stdout).toContain("2 problems (2 warnings)");
  });
});

describe("CLI — 설정 파일 오류", () => {
  it("잘못된 JSON은 exit 2와 stderr 메시지를 낸다", () => {
    writeFixture("main.ts", BOTTLENECK_SOURCE);
    writeConfig("{ this is not json }");

    const { exitCode, stdout, stderr } = invoke(["."]);

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain(`Failed to parse ${CONFIG_FILE_NAME}`);
  });

  it("스키마 위반은 exit 2와 stderr 메시지를 낸다", () => {
    writeFixture("main.ts", BOTTLENECK_SOURCE);
    writeConfig(JSON.stringify({ rules: { "sequential-await": "bogus" } }));

    const { exitCode, stdout, stderr } = invoke(["."]);

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain(`Invalid ${CONFIG_FILE_NAME}`);
  });
});
