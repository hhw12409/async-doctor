import path from "node:path";
import { describe, expect, it } from "vitest";
import { filterIgnored } from "../../src/analyzer/file-discovery.js";

// filterIgnored는 순수 경로 연산이라 실제 파일이 디스크에 있을 필요가 없다 —
// cwd와 파일 경로를 합성해 매칭 로직만 검증한다.
const CWD = path.resolve("/repo");

function abs(...segments: string[]): string {
  return path.join(CWD, ...segments);
}

describe("filterIgnored — `*` (세그먼트 내부만 매칭)", () => {
  it("같은 세그먼트의 파일은 제외한다", () => {
    const files = [abs("src", "a.ts")];

    expect(filterIgnored(files, ["src/*.ts"], CWD)).toEqual([]);
  });

  it("하위 디렉토리로는 넘어가지 않는다", () => {
    const files = [abs("src", "sub", "a.ts")];

    expect(filterIgnored(files, ["src/*.ts"], CWD)).toEqual(files);
  });
});

describe("filterIgnored — `**` (임의 깊이, 0단계 포함)", () => {
  it("0단계(디렉토리 없이 바로)에도 매칭된다", () => {
    const files = [abs("foo.generated.ts")];

    expect(filterIgnored(files, ["**/*.generated.ts"], CWD)).toEqual([]);
  });

  it("한 단계 하위 디렉토리에도 매칭된다", () => {
    const files = [abs("src", "foo.generated.ts")];

    expect(filterIgnored(files, ["**/*.generated.ts"], CWD)).toEqual([]);
  });

  it("여러 단계 깊은 하위 디렉토리에도 매칭된다", () => {
    const files = [abs("a", "b", "c.generated.ts")];

    expect(filterIgnored(files, ["**/*.generated.ts"], CWD)).toEqual([]);
  });

  it("패턴과 무관한 파일은 그대로 남는다", () => {
    const files = [abs("src", "keep.ts")];

    expect(filterIgnored(files, ["**/*.generated.ts"], CWD)).toEqual(files);
  });
});

describe("filterIgnored — 끝에 붙는 `**` (슬래시 없음, 예: `vendor/**`)", () => {
  it("바로 아래 파일을 제외한다", () => {
    const files = [abs("vendor", "foo.ts")];

    expect(filterIgnored(files, ["vendor/**"], CWD)).toEqual([]);
  });

  it("중첩된 하위 디렉토리 파일까지 제외한다", () => {
    const files = [abs("vendor", "nested", "deep", "thing.ts")];

    expect(filterIgnored(files, ["vendor/**"], CWD)).toEqual([]);
  });

  it("패턴 디렉토리 밖의 형제 파일은 제외하지 않는다", () => {
    const files = [abs("vendor-other", "foo.ts")];

    expect(filterIgnored(files, ["vendor/**"], CWD)).toEqual(files);
  });
});

describe("filterIgnored — 리터럴 경로", () => {
  it("정확히 일치하는 경로만 제외한다", () => {
    const files = [abs("src", "legacy.ts")];

    expect(filterIgnored(files, ["src/legacy.ts"], CWD)).toEqual([]);
  });

  it("경로 일부만 겹치는 파일은 제외하지 않는다", () => {
    const files = [abs("src", "legacy.util.ts")];

    expect(filterIgnored(files, ["src/legacy.ts"], CWD)).toEqual(files);
  });
});

describe("filterIgnored — 비지원 glob 문법은 리터럴로 취급된다 (오탐 없음)", () => {
  it("`?`는 단일 문자 와일드카드로 동작하지 않는다", () => {
    const files = [abs("src", "a.ts")];

    expect(filterIgnored(files, ["src/?.ts"], CWD)).toEqual(files);
  });

  it("`{a,b}`는 alternation으로 동작하지 않는다", () => {
    const files = [abs("src", "a.ts")];

    expect(filterIgnored(files, ["src/{a,b}.ts"], CWD)).toEqual(files);
  });

  it("`[abc]`는 문자 클래스로 동작하지 않는다", () => {
    const files = [abs("src", "a.ts")];

    expect(filterIgnored(files, ["src/[abc].ts"], CWD)).toEqual(files);
  });
});

describe("filterIgnored — 빈 patterns", () => {
  it("patterns가 빈 배열이면 입력을 그대로 반환한다", () => {
    const files = [abs("src", "a.ts"), abs("src", "b.ts")];

    expect(filterIgnored(files, [], CWD)).toEqual(files);
  });
});
