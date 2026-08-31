import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG_FILE_NAME, ConfigError, loadConfig } from "../../src/core/config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "async-doctor-config-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(content: string): void {
  fs.writeFileSync(path.join(tmpDir, CONFIG_FILE_NAME), content, "utf8");
}

describe("loadConfig — 파일 없음", () => {
  it("설정 파일이 없으면 undefined를 반환한다", () => {
    expect(loadConfig(tmpDir)).toBeUndefined();
  });
});

describe("loadConfig — 정상 파싱", () => {
  it("모든 필드를 담은 정상 JSON을 파싱된 config로 반환한다", () => {
    writeConfig(
      JSON.stringify({
        ignore: ["vendor/**", "**/*.generated.ts"],
        rules: { "no-await-in-loop": "off", "sequential-await": "error" },
        format: "json",
        severity: "warning",
      }),
    );

    expect(loadConfig(tmpDir)).toEqual({
      ignore: ["vendor/**", "**/*.generated.ts"],
      rules: { "no-await-in-loop": "off", "sequential-await": "error" },
      format: "json",
      severity: "warning",
    });
  });

  it("필드가 일부만 있어도 그 필드만 채워 반환한다", () => {
    writeConfig(JSON.stringify({ ignore: ["dist/**"] }));

    expect(loadConfig(tmpDir)).toEqual({ ignore: ["dist/**"] });
  });

  it("빈 객체는 빈 config를 반환한다 (파일은 있으나 아무 필드도 없음)", () => {
    writeConfig("{}");

    expect(loadConfig(tmpDir)).toEqual({});
  });

  it("알 수 없는 rule 이름은 에러 없이 그대로 config.rules에 포함된다", () => {
    writeConfig(JSON.stringify({ rules: { "no-such-rule": "off", "also-unknown": "error" } }));

    const config = loadConfig(tmpDir);

    expect(config?.rules).toEqual({ "no-such-rule": "off", "also-unknown": "error" });
  });
});

describe("loadConfig — JSON 파싱 실패", () => {
  it("잘못된 JSON은 ConfigError를 던지고 메시지에 파일명을 포함한다", () => {
    writeConfig("{ this is not json }");

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(new RegExp(`Failed to parse ${CONFIG_FILE_NAME}`));
  });
});

describe("loadConfig — 스키마 위반", () => {
  it("top-level이 객체가 아니면 ConfigError를 던진다 (배열)", () => {
    writeConfig(JSON.stringify(["not", "an", "object"]));

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(/expected a JSON object/);
  });

  it("top-level이 객체가 아니면 ConfigError를 던진다 (문자열)", () => {
    writeConfig(JSON.stringify("just a string"));

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(/expected a JSON object/);
  });

  it("top-level이 null이면 ConfigError를 던진다", () => {
    writeConfig("null");

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(/expected a JSON object/);
  });

  it("ignore가 문자열 배열이 아니면 ConfigError를 던진다 (숫자 배열)", () => {
    writeConfig(JSON.stringify({ ignore: [1, 2, 3] }));

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(/"ignore" must be an array of strings/);
  });

  it("ignore가 배열이 아니면 ConfigError를 던진다 (문자열 단일값)", () => {
    writeConfig(JSON.stringify({ ignore: "vendor/**" }));

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(/"ignore" must be an array of strings/);
  });

  it('rules 값이 "off"/Severity가 아니면 ConfigError를 던진다', () => {
    writeConfig(JSON.stringify({ rules: { "sequential-await": "bogus" } }));

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(
      /"rules\.sequential-await" must be "off", "error", "warning", or "info"/,
    );
  });

  it("rules가 객체가 아니면 ConfigError를 던진다 (배열)", () => {
    writeConfig(JSON.stringify({ rules: ["off"] }));

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(/"rules" must be an object/);
  });

  it("format이 REPORT_FORMATS에 없으면 ConfigError를 던진다", () => {
    writeConfig(JSON.stringify({ format: "xml" }));

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(/"format" must be one of/);
  });

  it("severity가 Severity가 아니면 ConfigError를 던진다", () => {
    writeConfig(JSON.stringify({ severity: "critical" }));

    expect(() => loadConfig(tmpDir)).toThrow(ConfigError);
    expect(() => loadConfig(tmpDir)).toThrow(/"severity" must be one of error, warning, info/);
  });
});
