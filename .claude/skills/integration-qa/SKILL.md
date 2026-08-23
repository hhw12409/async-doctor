---
name: integration-qa
description: "async-doctor의 모듈 간 경계면(rule↔registry↔reporter, CLI↔analyzer) 통합 정합성과 탐지 정확도를 검증하는 절차. 각 모듈 완성 직후 점진적으로 실행. '검증', 'QA', '문제 없는지 확인', 빌드/린트/테스트 실행 요청 시 사용."
---

# 통합 정합성 검증 절차

qa-reviewer 전용 절차 가이드. `npm run build` 통과는 정합성을 증명하지 않는다 — 타입 캐스팅이나 배열 등록 누락은 컴파일러가 못 잡는다.

## 검증은 왜 "양쪽을 동시에" 읽어야 하는가

rule 파일이 올바르게 구현되어 있고, `index.ts`도 문법적으로 올바르더라도, rule을 `index.ts` 배열에 등록하는 것을 **깜빡하는 것만으로** 그 rule은 영원히 실행되지 않는다. 이런 버그는 rule 파일만 읽거나 `index.ts`만 읽으면 못 잡는다. 반드시 두 파일을 동시에 열어 이름을 대조해야 한다.

## 검증 절차 (모듈 완성 직후 즉시 실행)

### 1. rule ↔ registry 교차 확인
```
1. src/rules/ 디렉토리의 모든 rule 파일에서 export된 이름 나열
2. src/rules/index.ts의 rules 배열에 포함된 항목 나열
3. 두 목록을 대조 — 파일은 있는데 배열에 없는 rule을 찾아낸다
```

### 2. Finding 스키마 일관성
```
1. core/types.ts의 Finding 인터페이스 필드 목록 확인
2. 각 rule의 analyze()가 반환하는 객체에서 필수 필드(rule, severity, file, line, column, message)가 모두 채워지는지 실제 코드 읽기로 확인 (타입이 맞아도 런타임에 undefined를 리터럴로 넣는 경우가 있음)
3. reporter가 소비하는 필드와 rule이 채우는 필드가 일치하는지 확인 — reporter가 참조하는데 rule이 채우지 않는 필드가 있으면 출력이 깨진다
```

### 3. CLI 옵션 ↔ 실제 동작
```
1. cli/index.ts에서 파싱하는 옵션 목록(--verbose, --format, --severity) 추출
2. 각 옵션이 analyzer 호출 또는 reporter 호출에 실제로 전달되어 반영되는지 추적
3. 파싱만 되고 무시되는 옵션(파싱 결과 변수를 어디서도 사용하지 않음)이 있는지 확인
```

### 4. 탐지 정확도 — negative fixture 직접 실행
```
1. tests/fixtures/{rule}/negative-*.ts 목록 확인
2. 해당 rule을 이 fixture에 직접 실행 (또는 test-engineer가 작성한 테스트 실행 결과 확인)
3. Finding이 발생하면 오탐 — rule-engineer에게 즉시 보고
```

### 5. 빌드/린트/테스트 종합 실행
```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```
네 명령 중 하나라도 실패하면 리포트에 실패 로그를 그대로 포함한다 — 요약하지 말고 에러 메시지 원문을 남겨 담당 에이전트가 바로 원인을 파악하게 한다.

## 점진적 실행 원칙

전체 구현이 끝난 뒤 한 번에 검증하지 않는다. core-architect가 `AsyncDoctorRule` 인터페이스를 확정하면 즉시 1번을 실행할 준비를 하고, rule-engineer가 rule 하나를 완성할 때마다 그 rule에 대해 1·2·4번을 바로 실행한다. 문제를 발견 시점에서 가장 가까운 곳에서 잡아야 후속 작업에 전파되지 않는다.

## 리포트 형식

```markdown
## QA 리포트 — {대상 모듈}

### 통과
- [rule↔registry] no-await-in-loop, sequential-await 모두 등록 확인

### 실패
- [Finding 스키마] sequential-await rule이 `column` 필드를 채우지 않음 (src/rules/sequential-await.ts:34) → rule-engineer에게 통보
- [탐지 정확도] negative-dependent-property.ts에서 오탐 발생 → rule-engineer에게 통보, 재현 코드 첨부

### 미검증
- reporter --format json (미구현 상태이므로 스펙 대상 아님)
```
