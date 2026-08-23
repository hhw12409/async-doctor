---
name: async-doctor-scaffold
description: "async-doctor 프로젝트의 구조/설정/코어 인터페이스를 정의하는 스킬. package.json, tsconfig, tsup, vitest, ESLint/Prettier 설정, core 타입(Finding/AsyncDoctorRule/AnalysisContext), CLI 인자 파싱, reporter 인터페이스 설계 시 사용. 프로젝트 초기 구축, CLI 옵션 추가, reporter 형식 확장 작업에 반드시 참조."
---

# async-doctor 스캐폴드

core-architect 전용 절차 가이드. 프로젝트의 뼈대와 확장점을 정의한다.

## 왜 이 구조인가

async-doctor는 rule이 계속 늘어나는 도구다. rule 하나 추가할 때마다 analyzer 코드를 고쳐야 한다면 확장성이 무너진다. 그래서 핵심 설계 원칙은 하나다: **rule은 인터페이스만 구현하고 배열에 등록하면, analyzer는 그 배열을 몰라도 순회만 하면 된다.** 이 계약이 core-architect가 만드는 모든 파일의 기준이다.

## 디렉토리 구조

```
async-doctor/
├── src/
│   ├── cli/index.ts              # 인자 파싱, 파일/디렉토리 탐색 진입점
│   ├── analyzer/
│   │   ├── analyzer.ts           # 파일 탐색 → SourceFile 파싱 → rule 순회 실행
│   │   └── context.ts            # AnalysisContext 생성
│   ├── rules/
│   │   ├── no-await-in-loop.ts
│   │   ├── sequential-await.ts
│   │   └── index.ts              # rule 배열 export (analyzer가 이것만 import)
│   ├── reporter/
│   │   ├── console-reporter.ts   # text 출력 (1차 버전 유일 구현체)
│   │   └── types.ts              # Reporter 인터페이스
│   ├── core/
│   │   ├── types.ts              # Finding, AnalysisContext, AsyncDoctorRule
│   │   └── severity.ts           # Severity, 심각도 비교/필터 유틸
│   └── index.ts                  # 라이브러리 진입점 (programmatic 사용 지원)
├── tests/
│   ├── fixtures/                 # rule별 positive/negative 샘플 코드
│   └── rules/                    # rule 테스트
├── package.json / tsconfig.json / tsup.config.ts / vitest.config.ts
└── README.md
```

설정 파일 전문(package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, ESLint/Prettier)은 `references/config-templates.md`를 Read로 로드한다.

## 핵심 인터페이스

전체 타입 정의와 각 필드의 의미는 `references/core-interfaces.md`를 Read로 로드한다. 요약:

```typescript
// core/types.ts
export type Severity = "error" | "warning" | "info";

export interface Finding {
  rule: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  message: string;
  reason?: string;
  suggestion?: string[];
  code?: string;
}

export interface AnalysisContext {
  sourceFile: SourceFile;   // ts-morph SourceFile
  filePath: string;
}

export interface AsyncDoctorRule {
  name: string;
  description: string;
  severity: Severity;
  analyze(context: AnalysisContext): Finding[];
}
```

## Analyzer 실행 흐름

`analyzer.ts`는 다음 순서로만 동작한다 — rule의 내부 로직을 몰라도 되게 하는 것이 핵심이다.

1. CLI에서 받은 경로가 파일이면 그 파일 하나, 디렉토리면 지원 확장자(`.ts .tsx .js .jsx .mts .cts`)로 재귀 탐색해 파일 목록 생성
2. 각 파일을 ts-morph `Project`에 추가해 `SourceFile` 획득
3. `context.ts`로 `AnalysisContext { sourceFile, filePath }` 생성
4. `src/rules/index.ts`에서 import한 rule 배열을 순회하며 `rule.analyze(context)` 호출, 결과를 모두 합쳐 `Finding[]` 반환
5. CLI가 `--severity` 옵션을 받았으면 severity 비교 유틸로 결과를 필터링한 뒤 reporter에 전달

이 흐름에서 3번째 단계(rule 배열 순회)가 새 rule 추가 시 절대 수정되지 않아야 하는 지점이다.

## CLI 사양

```
async-doctor <path> [--verbose] [--format text] [--severity warning]
```

- `<path>`: 파일 하나 또는 디렉토리. 필수.
- `--verbose`: Finding에 code 스니펫까지 출력
- `--format`: 1차 버전은 `text`만 실제 구현. `json`/`sarif`/`html`은 `reporter/types.ts`의 `Reporter` 인터페이스를 구현하는 새 파일 추가만으로 확장되게 설계 — 현재 미구현 포맷 요청 시 명확한 에러 메시지 출력
- `--severity`: 지정한 심각도 이상만 출력 (error > warning > info 순으로 필터)

## Reporter 인터페이스

```typescript
// reporter/types.ts
export interface Reporter {
  report(findings: Finding[], options: { verbose?: boolean }): string;
}
```

`console-reporter.ts`가 이 인터페이스의 유일한 1차 구현체다. 새 형식 추가 시 이 인터페이스를 구현하는 파일만 추가하고, CLI의 `--format` 분기에 등록한다.

## 작업 순서 (초기 스캐폴드 시)

1. `references/config-templates.md`를 로드해 설정 파일부터 생성 — 이후 단계가 빌드 가능한 상태를 전제로 하기 때문
2. `core/types.ts`, `core/severity.ts` 작성
3. `reporter/types.ts` (인터페이스만) 작성 → rule-engineer가 `AsyncDoctorRule`을 참조할 수 있는 시점
4. `analyzer/context.ts`, `analyzer/analyzer.ts` 작성
5. `cli/index.ts`, `reporter/console-reporter.ts` 작성
6. `src/rules/index.ts`는 빈 배열로 우선 생성 — rule-engineer가 이후 채워 넣을 확장점임을 주석 없이 구조로 표현 (빈 배열 + import 자리)
7. `npm run build` / `npx tsc --noEmit`으로 컴파일 통과를 자체 확인한 뒤 완료 보고

## 후속 작업 시 (CLI 옵션 추가 / reporter 형식 추가)

- 기존 `cli/index.ts`, `reporter/types.ts`를 Read로 먼저 확인 — 다른 팀원이 이미 만든 옵션 파싱 구조를 유지한 채 확장한다
- reporter 형식 추가는 반드시 `Reporter` 인터페이스를 구현하는 새 파일 하나 + CLI 분기 등록으로 끝나야 한다. 인터페이스 자체를 바꿔야 한다면 기존 `console-reporter.ts`도 함께 맞춘다
