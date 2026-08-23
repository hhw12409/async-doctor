---
name: ast-rule-implementation
description: "ts-morph로 AsyncDoctorRule을 구현하는 절차와 참조 구현(no-await-in-loop, sequential-await)을 제공. async-doctor에 새 비동기 패턴 탐지 rule을 추가하거나 기존 rule의 탐지 로직을 수정할 때 반드시 사용. AST 노드 탐색, 변수 의존성 분석, false positive 회피 판단 로직 작성 시 참조."
---

# AST Rule 구현 가이드

rule-engineer 전용 절차 가이드. `AsyncDoctorRule` 인터페이스를 구현하는 표준 절차와 참조 구현을 담는다.

## 왜 의존성 분석이 핵심인가

`await`가 루프 안에 있다는 것, 또는 두 `await` 문이 연달아 있다는 것 자체는 문제가 아니다. 문제는 **서로 의존성이 없는 비동기 작업이 병렬화 가능함에도 순차 실행되는 경우**뿐이다. 이 판단을 AST 레벨에서 정확히 하지 못하면 오탐이 쏟아지고, 오탐이 몇 번 반복되면 개발자는 도구 자체를 끈다. 그래서 모든 rule은 "탐지 조건"보다 "탐지 제외 조건"을 먼저 설계해야 한다.

## AsyncDoctorRule 구현 절차

1. `src/rules/{rule-name}.ts` 파일 생성
2. `analyze(context: AnalysisContext): Finding[]` 구현 — `context.sourceFile`(ts-morph SourceFile)을 순회하며 대상 패턴을 찾는다
3. 후보를 찾을 때마다 **제외 조건**을 먼저 체크 — 제외 조건에 걸리면 Finding을 만들지 않고 다음 후보로 넘어간다
4. Finding 생성 시 `message`(무엇이 문제인지), `reason`(왜 병목인지), `suggestion`(어떻게 고치는지 실행 가능한 코드)을 채운다
5. `src/rules/index.ts`의 배열에 등록
6. rule 요약 파일(`_workspace/`)에 탐지 예시/제외 예시 코드 쌍을 남긴다 — test-engineer가 이를 fixture로 그대로 사용한다

## 참조 구현 1: no-await-in-loop

**탐지 대상**: `for`/`for...of`/`for...in`/`while` 루프 본문 안에서 `await` 표현식이 직접 사용되는 경우.

```typescript
for (const item of items) {
  await process(item);
}
```

**ts-morph 탐색 패턴**:

```typescript
import { SyntaxKind } from "ts-morph";
import type { AsyncDoctorRule, Finding } from "../core/types.js";

export const noAwaitInLoopRule: AsyncDoctorRule = {
  name: "no-await-in-loop",
  description: "Detects await expressions executed sequentially inside a loop.",
  severity: "warning",
  analyze(context) {
    const findings: Finding[] = [];
    const loopKinds = [
      SyntaxKind.ForStatement,
      SyntaxKind.ForOfStatement,
      SyntaxKind.ForInStatement,
      SyntaxKind.WhileStatement,
    ];

    for (const loop of context.sourceFile.getDescendantsOfKind(SyntaxKind.ForOfStatement)
      .concat(
        context.sourceFile.getDescendantsOfKind(SyntaxKind.ForStatement),
        context.sourceFile.getDescendantsOfKind(SyntaxKind.ForInStatement),
        context.sourceFile.getDescendantsOfKind(SyntaxKind.WhileStatement),
      )) {
      const awaitExprs = loop.getDescendantsOfKind(SyntaxKind.AwaitExpression)
        // 중첩된 내부 함수(콜백) 안의 await는 이 루프의 순차 실행과 무관하므로 제외
        .filter((awaitExpr) => isDirectlyInLoopBody(awaitExpr, loop));

      for (const awaitExpr of awaitExprs) {
        const line = awaitExpr.getStartLineNumber();
        findings.push({
          rule: "no-await-in-loop",
          severity: "warning",
          file: context.filePath,
          line,
          column: awaitExpr.getStartLinePos(),
          message: "Sequential async operation detected inside loop.",
          reason:
            "Each iteration waits for the previous async operation to complete, which may significantly reduce throughput.",
          suggestion: [
            "Promise.all(items.map(item => process(item)))",
            "Or use controlled concurrency / batch processing for large item counts.",
          ],
          code: loop.getText(),
        });
      }
    }
    return findings;
  },
};
```

**제외 조건 (오탐 회피)**: `await`가 루프 본문에 직접 있지 않고, 함수 표현식/화살표 함수로 감싸인 콜백 내부(예: `items.forEach(async (item) => { await x(); })`처럼 루프 자체가 아닌 콜백 내부)에 있다면, 이는 이미 별도 처리가 필요한 다른 패턴이므로 이 rule의 탐지 범위에서 제외한다. `isDirectlyInLoopBody`는 `awaitExpr`에서 상위로 올라가며 만나는 첫 함수 경계가 `loop`보다 안쪽인지 확인하는 헬퍼로 구현한다.

## 참조 구현 2: sequential-await

**탐지 대상**: 연속된 `await` 문에서, 뒤 문장이 앞 문장의 결과 변수를 참조하지 않는 경우 (병렬화 가능한데 순차 실행됨).

```typescript
// 탐지 대상 — user와 inventory는 서로 무관
const user = await getUser();
const inventory = await getInventory();
```

```typescript
// 탐지 제외 — inventory가 user.id에 의존 (정상 순차 처리)
const user = await getUser();
const inventory = await getInventory(user.id);
```

**판단 로직**:

1. 같은 블록(스코프) 안에서 연속으로 나열된 `await` 결과를 받는 변수 선언문들을 수집한다
2. 각 쌍(`A`, `B`)에 대해 `B`의 초기화 표현식(함수 호출의 인자, 메서드 체인의 대상 등)이 `A`가 선언한 변수를 식별자로 참조하는지 `getDescendantsOfKind(SyntaxKind.Identifier)`로 확인한다
3. 참조가 있으면 정상 순차 처리로 판단해 Finding을 만들지 않는다
4. 참조가 없으면 "독립적일 가능성이 있다"는 취지로 Finding을 만들되, **정적 분석만으로는 완전한 확신이 불가능하므로 severity는 항상 warning**으로 고정한다 (예: 두 호출이 실제로는 공유 뮤터블 상태나 외부 부수효과로 암묵적 의존성을 가질 수 있음 — 이는 AST로 판별 불가능하므로 오탐 가능성을 인정하고 severity로 표현)

```typescript
suggestion: [
  "const [user, inventory] = await Promise.all([getUser(), getInventory()]);",
],
```

## 새 rule 추가 시 일반화 절차

다른 비동기 병목 패턴(예: `Promise` 체인 안에서의 불필요한 순차 `.then()`, 조건부 분기에서 매번 재조회되는 비동기 호출 등)을 요청받으면:

1. "이 패턴이 항상 문제인가, 아니면 특정 조건에서만 문제인가"를 먼저 정의한다 — 항상 문제인 패턴은 드물다
2. 제외 조건을 최소 1개 이상 설계한다 (없다면 오탐이 필연적으로 발생할 패턴이라는 뜻이므로 severity를 warning으로 낮춘다)
3. ts-morph의 `SyntaxKind`와 `getDescendantsOfKind`, `getAncestors()` 조합으로 판별 로직을 짠다 — 정규식이나 텍스트 매칭으로 판별하지 않는다 (문자열 안의 `await` 같은 오탐 발생)
