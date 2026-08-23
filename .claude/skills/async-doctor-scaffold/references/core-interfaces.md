# 코어 인터페이스 상세

async-doctor-scaffold 스킬의 보충 레퍼런스. core-architect가 `src/core/`, `src/analyzer/`, `src/rules/index.ts`를 작성할 때 참조하는 전체 코드.

## core/severity.ts

```typescript
import type { Severity } from "./types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

// severity가 threshold 이상인지 판단 (--severity 옵션 필터링에 사용)
export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}
```

## analyzer/context.ts

```typescript
import type { SourceFile } from "ts-morph";
import type { AnalysisContext } from "../core/types.js";

export function createContext(sourceFile: SourceFile, filePath: string): AnalysisContext {
  return { sourceFile, filePath };
}
```

## src/rules/index.ts — rule 레지스트리

이 파일이 확장점의 실체다. rule-engineer는 새 rule을 만들 때 이 배열에 한 줄만 추가한다.

```typescript
import type { AsyncDoctorRule } from "../core/types.js";
import { noAwaitInLoopRule } from "./no-await-in-loop.js";
import { sequentialAwaitRule } from "./sequential-await.js";

export const rules: AsyncDoctorRule[] = [
  noAwaitInLoopRule,
  sequentialAwaitRule,
];
```

analyzer는 이 `rules` 배열만 import한다 — 개별 rule 파일을 직접 알지 못한다. 새 rule 추가 시 analyzer.ts는 절대 수정되지 않는다.

## analyzer/analyzer.ts — 실행 흐름 골격

```typescript
import { Project } from "ts-morph";
import { rules } from "../rules/index.js";
import { createContext } from "./context.js";
import { meetsThreshold } from "../core/severity.js";
import type { Finding, Severity } from "../core/types.js";

export interface AnalyzeOptions {
  severityThreshold?: Severity;
}

export function analyze(filePaths: string[], options: AnalyzeOptions = {}): Finding[] {
  const project = new Project();
  const findings: Finding[] = [];

  for (const filePath of filePaths) {
    const sourceFile = project.addSourceFileAtPath(filePath);
    const context = createContext(sourceFile, filePath);

    for (const rule of rules) {
      findings.push(...rule.analyze(context));
    }
  }

  if (options.severityThreshold) {
    return findings.filter((f) => meetsThreshold(f.severity, options.severityThreshold!));
  }
  return findings;
}
```

파일 탐색(경로가 파일인지 디렉토리인지 판별, 확장자 필터링)은 별도 유틸로 분리해 `analyze()`에는 이미 확정된 파일 경로 목록만 전달되게 한다 — analyzer의 책임을 "rule 실행"으로만 좁히기 위함이다.

## 지원 확장자

```typescript
export const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"];
```

CLI의 디렉토리 탐색 로직과 analyzer 양쪽에서 이 상수를 공유해야 한다 — 각자 다른 확장자 목록을 하드코딩하면 경계면 불일치가 생긴다 (qa-reviewer가 이 지점을 반드시 교차 검증한다).
