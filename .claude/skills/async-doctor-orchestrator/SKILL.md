---
name: async-doctor-orchestrator
description: "async-doctor(비동기 병목 정적 분석 CLI) 개발 에이전트 팀을 조율하는 오케스트레이터. 프로젝트 초기 구축, 새 rule/비동기 패턴 탐지 규칙 추가, CLI 옵션 추가, reporter 형식(json/sarif/html) 추가, analyzer 엔진 수정 요청 시 사용. 후속 작업: 기존 rule 수정/보완, 오탐 수정, 테스트 재실행, 업데이트, 다시 실행, '이 rule에 이런 케이스도 추가' 요청 시에도 반드시 이 스킬을 사용."
---

# async-doctor Orchestrator

async-doctor 개발 에이전트 팀(`core-architect`, `rule-engineer`, `test-engineer`, `qa-reviewer`)을 조율해 프로젝트를 구축·확장하는 통합 스킬.

## 실행 모드: 에이전트 팀

파이프라인(인프라 먼저) + 생성-검증(rule 구현↔테스트↔QA 반복) 복합 패턴. rule 추가처럼 좁은 범위 작업에서도 세 전문가 간 실시간 피드백(오탐 발견 → 즉시 수정 요청)이 결과 품질에 직접 영향을 주므로 서브 에이전트가 아닌 팀 모드를 사용한다.

## 에이전트 구성

| 팀원 | 에이전트 타입 | 역할 | 스킬 | 출력 |
|------|-------------|------|------|------|
| core-architect | 커스텀 (core-architect) | 스캐폴드/core 타입/analyzer/CLI/reporter | async-doctor-scaffold | `src/core,analyzer,cli,reporter/**`, 설정 파일 |
| rule-engineer | 커스텀 (rule-engineer) | ts-morph 기반 rule 구현 | ast-rule-implementation | `src/rules/**` |
| test-engineer | 커스텀 (test-engineer) | vitest 테스트/fixture | rule-test-fixtures | `tests/**` |
| qa-reviewer | 커스텀 (qa-reviewer) | 통합 정합성/탐지 정확도 검증 | integration-qa | `_workspace/*_qa-reviewer_report.md` |

## 워크플로우

### Phase 0: 컨텍스트 확인 (작업 범위 판별)

1. `src/` 디렉토리 존재 여부와 `_workspace/` 존재 여부를 확인한다
2. 사용자 요청 내용과 조합해 작업 범위를 분류한다:

   | 상황 | 판단 | 소집 팀원 |
   |------|------|----------|
   | `src/` 미존재 | **초기 구축** | 전원 (core-architect → rule-engineer/test-engineer → qa-reviewer) |
   | `src/` 존재 + "새 rule/패턴 추가" 요청 | **rule 추가** | rule-engineer, test-engineer, qa-reviewer (core-architect는 타입 확장 필요 시에만 소집) |
   | `src/` 존재 + "CLI 옵션/reporter 형식 추가" 요청 | **인프라 확장** | core-architect, qa-reviewer (+ 영향 있으면 test-engineer) |
   | `src/` 존재 + "오탐 수정/rule 개선" 요청 | **부분 재실행** | rule-engineer, test-engineer, qa-reviewer — 대상 rule만 |
   | `_workspace/` 존재 + 완전히 새로운 대규모 요청 | **새 실행** | 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동 후 초기 구축과 동일 절차 |

3. 부분 재실행/rule 추가 시: 대상 rule의 기존 파일과 `_workspace/`에 남은 이전 요약 파일을 관련 팀원 프롬프트에 경로로 포함해, 팀원이 기존 구현을 Read하고 그 위에서 작업하도록 지시한다

### Phase 1: 준비

1. 사용자 요청에서 구체적 대상 파악 — 초기 구축이면 스펙 전체, rule 추가면 "어떤 패턴을 탐지해야 하는가"를 명확히 정리 (모호하면 AskUserQuestion으로 확인)
2. `_workspace/` 생성 (초기 실행 시) 또는 기존 유지 (후속 작업 시)
3. 대상 스펙을 `_workspace/00_input/request.md`에 저장

### Phase 2: 팀 구성

Phase 0에서 판별한 소집 대상만 `TeamCreate`로 구성한다. 예: rule 추가 상황이면 core-architect는 팀원으로 넣지 않고, 필요해질 경우에만 SendMessage 대신 별도 Agent 호출(서브 에이전트)로 짧게 소집한다 — 팀 재구성 오버헤드를 피하기 위함.

```
TeamCreate(
  team_name: "async-doctor-team",
  members: [
    { name: "core-architect", agent_type: "core-architect", model: "opus", prompt: "..." },
    { name: "rule-engineer", agent_type: "rule-engineer", model: "opus", prompt: "..." },
    { name: "test-engineer", agent_type: "test-engineer", model: "opus", prompt: "..." },
    { name: "qa-reviewer", agent_type: "qa-reviewer", model: "opus", prompt: "..." }
  ]
)
```

작업 등록 (초기 구축 예시):
```
TaskCreate(tasks: [
  { title: "프로젝트 스캐폴드 + core 타입 + analyzer + CLI + reporter", assignee: "core-architect" },
  { title: "no-await-in-loop rule 구현", assignee: "rule-engineer", depends_on: ["프로젝트 스캐폴드 + core 타입 + analyzer + CLI + reporter"] },
  { title: "sequential-await rule 구현", assignee: "rule-engineer", depends_on: ["프로젝트 스캐폴드 + core 타입 + analyzer + CLI + reporter"] },
  { title: "no-await-in-loop 테스트/fixture", assignee: "test-engineer", depends_on: ["no-await-in-loop rule 구현"] },
  { title: "sequential-await 테스트/fixture", assignee: "test-engineer", depends_on: ["sequential-await rule 구현"] },
  { title: "CLI 통합 테스트", assignee: "test-engineer", depends_on: ["프로젝트 스캐폴드 + core 타입 + analyzer + CLI + reporter"] },
  { title: "통합 정합성 검증", assignee: "qa-reviewer", depends_on: ["no-await-in-loop 테스트/fixture", "sequential-await 테스트/fixture", "CLI 통합 테스트"] }
])
```

rule 추가 시나리오는 동일 패턴에서 core-architect 작업을 제외하고 신규 rule 1개 기준으로 축소한다.

### Phase 3: 팀원 자체 조율 실행

**실행 방식:** 팀원들이 공유 작업 목록에서 작업을 claim해 독립 수행. 리더는 모니터링하며 필요 시 개입.

**통신 규칙:**
- core-architect는 `AsyncDoctorRule`/`Finding`/`AnalysisContext` 시그니처 확정 시 rule-engineer와 test-engineer에게 SendMessage로 통보 (이것이 이들 작업의 시작 조건)
- rule-engineer는 rule 완성 시 test-engineer에게 탐지/제외 예시와 함께 SendMessage로 fixture 작성 요청
- test-engineer는 테스트 중 발견한 오탐/누락을 즉시 rule-engineer에게 SendMessage로 보고
- qa-reviewer는 **각 팀원의 모듈 완성 통보를 받을 때마다 즉시** 해당 범위만 검증 (전체 완성까지 기다리지 않음 — incremental QA). 발견한 문제는 관련 팀원 모두에게 SendMessage

**산출물 저장:**

| 팀원 | 출력 경로 |
|------|----------|
| core-architect | 실제 소스(`src/core,analyzer,cli,reporter/**`) + `_workspace/{phase}_core-architect_summary.md` |
| rule-engineer | 실제 소스(`src/rules/**`) + `_workspace/{phase}_rule-engineer_{rule-name}.md` |
| test-engineer | 실제 테스트(`tests/**`) + `_workspace/{phase}_test-engineer_{scope}.md` |
| qa-reviewer | `_workspace/{phase}_qa-reviewer_report.md` |

**리더 모니터링:** 팀원 유휴 알림 수신 시 SendMessage로 상태 확인. `TaskGet`으로 전체 진행률 확인.

### Phase 4: 최종 통합 확인

1. 모든 작업 완료 대기 (`TaskGet`)
2. qa-reviewer의 최종 리포트(`_workspace/*_qa-reviewer_report.md`)를 Read로 수집 — "실패" 항목이 남아있으면 해당 팀원에게 재작업 요청 후 재검증 (최대 2회 반복, 이후에도 실패하면 사용자에게 보고하고 진행 여부 확인)
3. `npm run typecheck && npm run lint && npx vitest run && npm run build` 최종 통과 확인
4. 사용자에게 결과 요약: 구현된 rule 목록, 테스트 커버리지, 알려진 한계(오탐 가능성이 있는 rule과 그 이유)

### Phase 5: 정리

1. 팀원들에게 종료 요청 (SendMessage) → `TeamDelete`
2. `_workspace/` 보존 (감사 추적용)
3. 사용자에게 요약 보고 + 개선 피드백 요청 기회 제공

## 데이터 흐름

```
[리더] → TeamCreate → [core-architect] ──SendMessage(타입 확정)──→ [rule-engineer] ──SendMessage(rule 완성)──→ [test-engineer]
                              │                                          │                                          │
                              ↓                                          ↓                                          ↓
                     src/core,analyzer,cli,reporter              src/rules/*.ts                          tests/**
                              │                                          │                                          │
                              └──────────────────────── [qa-reviewer]가 각 완성 시점마다 즉시 검증 ─────────────────┘
                                                                   │
                                                          _workspace/*_qa-reviewer_report.md
                                                                   │
                                                            [리더: 최종 통합 확인]
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 팀원 1명 실패/중지 | 리더가 유휴 알림으로 감지 → SendMessage로 상태 확인 → 재시작 |
| qa-reviewer가 반복 실패 지적(2회 이상 동일 문제) | 사용자에게 보고, 설계 자체를 재검토할지 확인 |
| rule의 오탐/누락이 fixture로도 해결 안 됨 | severity를 warning으로 낮추고 알려진 한계로 문서화 — 완벽한 정적 분석은 불가능함을 인정 |
| 빌드/린트/테스트 중 하나라도 실패한 채 팀원이 완료 보고 | qa-reviewer가 반려, 해당 팀원에게 재작업 요청 |
| 타임아웃 | 현재까지 수집된 부분 결과로 진행, 미완료 항목 사용자에게 명시 |

## 테스트 시나리오

### 정상 흐름 (초기 구축)
1. 사용자가 "async-doctor 프로젝트를 구축해줘" 요청
2. Phase 0에서 `src/` 미존재 확인 → 초기 구축 모드
3. Phase 2에서 4명 팀 구성 + 7개 작업 등록
4. Phase 3에서 core-architect가 인프라 완성 → rule-engineer/test-engineer가 병렬로 두 rule 구현·테스트 → qa-reviewer가 각 완성 시점마다 점진 검증
5. Phase 4에서 최종 빌드/린트/테스트 통과 확인
6. 예상 결과: `src/`, `tests/` 전체 생성, `npx async-doctor src`로 실행 가능

### 정상 흐름 (후속 rule 추가)
1. 사용자가 "Promise.then 체인에서 불필요한 순차 처리를 탐지하는 rule을 추가해줘" 요청
2. Phase 0에서 `src/` 존재 + "새 rule 추가" 패턴 인식 → rule 추가 모드, core-architect 제외
3. rule-engineer가 신규 rule 구현 → test-engineer가 fixture/테스트 작성 → qa-reviewer가 검증
4. 예상 결과: `src/rules/{new-rule}.ts` 추가, `src/rules/index.ts`에 등록, 관련 테스트 통과

### 에러 흐름
1. Phase 3에서 rule-engineer가 구현한 sequential-await rule이 test-engineer의 negative fixture에서 오탐 발생
2. test-engineer가 rule-engineer에게 SendMessage로 재현 코드와 함께 보고
3. rule-engineer가 의존성 판단 로직을 일반화해 수정 (해당 케이스만 땜질하지 않음)
4. qa-reviewer가 재검증 → 통과 확인 후 Phase 4 진행
5. 재수정 후에도 동일 유형 오탐이 반복되면(2회 이상) severity를 warning으로 유지한 채 "알려진 한계"로 문서화하고 사용자에게 보고
