import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { noFloatingPromiseRule } from "../../src/rules/no-floating-promise.js";
import type { Finding } from "../../src/core/types.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/no-floating-promise",
);

/** 이 rule만 주입해 실행한다 — 다른 rule의 Finding이 섞여 개수 단언이 우연히 맞는 것을 막는다 */
function analyzeFixture(name: string): Finding[] {
  return analyze([path.join(FIXTURE_DIR, `${name}.ts`)], { rules: [noFloatingPromiseRule] });
}

/**
 * fixture 파일 안에서 substring이 마지막으로 시작하는 0-based 문자 오프셋 —
 * finding.fix.insertAt 기대값 계산용. lastIndexOf를 쓰는 이유: 이 fixture들은 맨 위에
 * `declare function foo(): Promise<...>;` 선언을 두는데, 그 시그니처 텍스트 안에도
 * `foo()`와 같은 형태의 부분 문자열이 우연히 포함될 수 있어(예: 매개변수 없는 함수),
 * 실제 호출식은 항상 파일의 더 뒤쪽(선언 다음)에 있으므로 마지막 occurrence를 취한다.
 */
function offsetOf(fixtureName: string, substring: string): number {
  const content = fs.readFileSync(path.join(FIXTURE_DIR, `${fixtureName}.ts`), "utf8");
  const idx = content.lastIndexOf(substring);
  if (idx === -1) throw new Error(`substring not found in ${fixtureName}.ts: ${substring}`);
  return idx;
}

describe("no-floating-promise", () => {
  describe("positive — 탐지되어야 하는 패턴", () => {
    it("async 함수 호출이 표현식문으로 버려지면 호출 표현식 시작 위치에서 탐지한다", () => {
      const findings = analyzeFixture("positive-async-call");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-floating-promise");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(4);
      expect(findings[0].column).toBe(3);
      expect(findings[0].file).toBe(path.join(FIXTURE_DIR, "positive-async-call.ts"));
      expect(findings[0].message).toBe(
        "Promise-returning call result is discarded (floating promise).",
      );
      expect(findings[0].code).toBe("doSomethingAsync()");
      expect(findings[0].fix).toEqual({
        insertAt: offsetOf("positive-async-call", "doSomethingAsync()"),
        text: "void ",
      });
    });

    it("async 키워드 없이 반환 타입만 Promise<T>인 함수 호출도 탐지한다", () => {
      const findings = analyzeFixture("positive-non-async-promise-return");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-floating-promise");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(4);
      expect(findings[0].column).toBe(3);
      expect(findings[0].code).toBe("returnsPromiseNonAsync()");
      expect(findings[0].fix).toEqual({
        insertAt: offsetOf("positive-non-async-promise-return", "returnsPromiseNonAsync()"),
        text: "void ",
      });
    });

    it(".finally()만 체이닝되고 .catch()/.then()이 없으면 여전히 탐지한다", () => {
      const findings = analyzeFixture("positive-finally-only");

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("no-floating-promise");
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].line).toBe(4);
      expect(findings[0].column).toBe(3);
      expect(findings[0].code).toBe('doSomethingAsync().finally(() => console.log("cleanup"))');
      // fix.insertAt은 체인 전체가 아니라 호출식(`doSomethingAsync()...`) 시작 위치를 가리켜야
      // `void `가 `.finally()` 체인 앞이 아니라 최상위 표현식 맨 앞에 삽입된다.
      expect(findings[0].fix).toEqual({
        insertAt: offsetOf(
          "positive-finally-only",
          'doSomethingAsync().finally(() => console.log("cleanup"))',
        ),
        text: "void ",
      });
    });

    it("Finding에 await/.catch() 두 가지 제안을 모두 담는다", () => {
      const [finding] = analyzeFixture("positive-async-call");

      expect(finding.suggestion?.[0]).toContain("await doSomethingAsync();");
      expect(finding.suggestion?.[1]).toContain("doSomethingAsync().catch(");
      expect(finding.reason).toBeTruthy();
    });
  });

  describe("negative — 탐지되면 안 되는 패턴", () => {
    it("void 연산자로 감싸면 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-void-operator")).toEqual([]);
    });

    it(".catch() 체이닝이 있으면 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-catch-chain")).toEqual([]);
    });

    it(".then() 체이닝이 있으면 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-then-chain")).toEqual([]);
    });

    it("이미 await된 호출은 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-await")).toEqual([]);
    });

    it("return문으로 위임된 호출은 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-return")).toEqual([]);
    });

    it("변수에 저장된 호출은 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-store-variable")).toEqual([]);
    });

    it("Promise.all의 인자로 전달된 호출은 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-arg-promise-all")).toEqual([]);
    });

    it("임의의 사용자 함수 인자로 전달된 호출도 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-arg-custom-function")).toEqual([]);
    });

    it("반환 타입이 Promise가 아닌 동기 함수 호출은 탐지하지 않는다", () => {
      expect(analyzeFixture("negative-sync-call")).toEqual([]);
    });

    it("forEach(async ...) 콜백은 탐지하지 않는다 (forEach 자체는 void 반환, no-foreach-async 영역)", () => {
      expect(analyzeFixture("negative-foreach-async-callback")).toEqual([]);
    });

    it("반환 타입이 any이면 탐지하지 않는다 (의도된 false negative)", () => {
      expect(analyzeFixture("negative-any-return-type")).toEqual([]);
    });

    it("반환 타입이 유니온이면 탐지하지 않는다 (의도된 false negative)", () => {
      expect(analyzeFixture("negative-union-return-type")).toEqual([]);
    });
  });
});
