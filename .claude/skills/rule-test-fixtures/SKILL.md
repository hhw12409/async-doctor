---
name: rule-test-fixtures
description: "async-doctor의 rule/CLI를 검증하는 vitest 테스트와 tests/fixtures 샘플 코드 작성 절차. 새 rule의 positive/negative 케이스 작성, 테스트 커버리지 보완, CLI 통합 테스트 작성 시 사용."
---

# Rule 테스트 & Fixture 작성 가이드

test-engineer 전용 절차 가이드.

## 왜 negative 케이스가 positive 케이스만큼 중요한가

정적 분석 도구의 신뢰는 "잡아야 할 것을 잡는가"보다 "잡지 말아야 할 것을 잡지 않는가"에서 더 쉽게 무너진다. 오탐 하나가 개발자로 하여금 도구 전체를 무시하게 만든다. 그래서 모든 rule은 positive fixture 1개당 negative fixture를 최소 2개 갖춰야 한다.

## Fixture 디렉토리 구조

```
tests/fixtures/
├── no-await-in-loop/
│   ├── positive-for-of.ts
│   ├── positive-while.ts
│   ├── negative-parallel-already.ts   # 이미 Promise.all 사용 — 탐지되면 안 됨
│   └── negative-callback-await.ts     # 콜백 내부 await — 이 rule의 범위 밖
└── sequential-await/
    ├── positive-independent.ts
    ├── negative-dependent-arg.ts       # B가 A의 결과를 인자로 사용
    └── negative-dependent-property.ts  # B가 A의 결과 프로퍼티를 사용
```

fixture 파일 하나는 정확히 하나의 패턴만 담는다. 여러 패턴을 섞은 fixture는 테스트 실패 시 원인 추적을 어렵게 한다.

## Fixture 작성 예시

**positive-for-of.ts** (탐지되어야 함):
```typescript
export async function processAll(items: string[]) {
  for (const item of items) {
    await process(item);
  }
}
declare function process(item: string): Promise<void>;
```

**negative-dependent-property.ts** (탐지되면 안 됨):
```typescript
export async function loadUserData() {
  const user = await getUser();
  const inventory = await getInventory(user.id);
  return { user, inventory };
}
declare function getUser(): Promise<{ id: string }>;
declare function getInventory(id: string): Promise<unknown>;
```

rule이 참조하는 외부 함수는 `declare function`으로 타입만 선언해 fixture를 컴파일 가능한 최소 단위로 유지한다.

## 테스트 작성 패턴

```typescript
// tests/rules/no-await-in-loop.test.ts
import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { noAwaitInLoopRule } from "../../src/rules/no-await-in-loop.js";
import { createContext } from "../../src/analyzer/context.js";

function analyzeFixture(path: string) {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(path);
  const context = createContext(sourceFile, path);
  return noAwaitInLoopRule.analyze(context);
}

describe("no-await-in-loop", () => {
  it("detects sequential await inside for-of loop", () => {
    const findings = analyzeFixture("tests/fixtures/no-await-in-loop/positive-for-of.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("no-await-in-loop");
    expect(findings[0].severity).toBe("warning");
  });

  it("does not flag callback-scoped await", () => {
    const findings = analyzeFixture("tests/fixtures/no-await-in-loop/negative-callback-await.ts");
    expect(findings).toHaveLength(0);
  });
});
```

필드 존재 여부만이 아니라 `rule`/`severity` 값까지 검증해, 다른 rule의 Finding이 우연히 개수만 맞아 테스트를 통과시키는 것을 막는다.

## CLI 통합 테스트

CLI의 핵심 함수(인자 파싱 → analyze 호출 → reporter 출력)를 프로세스 스폰 없이 직접 호출해 검증한다. 실제 `npx async-doctor` 실행 테스트가 필요하면 별도로 1~2개만 추가한다 (느리고 디버깅이 어렵기 때문에 최소화).

```typescript
// tests/cli.test.ts — 옵션별 동작 검증 예시
it("filters findings below --severity threshold", () => {
  const findings = analyze(["tests/fixtures/..."], { severityThreshold: "error" });
  expect(findings.every((f) => f.severity === "error")).toBe(true);
});
```

## 실행 및 보고

작업 완료 전 반드시 `npx vitest run`을 실행해 통과를 확인한다. 실패하는 테스트를 "나중에 고칠 것"으로 남긴 채 완료 보고하지 않는다 — rule 로직 문제로 보이면 즉시 rule-engineer에게 SendMessage로 알린다.
