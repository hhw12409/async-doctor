<div align="center">

<pre>
~~~~/\/\/‾‾‾\/\~~~~
</pre>

# async-doctor

[![npm version](https://img.shields.io/npm/v/async-doctor.svg)](https://www.npmjs.com/package/async-doctor)
[![CI](https://github.com/hhw12409/async-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/hhw12409/async-doctor/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/async-doctor.svg)](./LICENSE)

**린터가 잡아내지 못하는 비동기 병목을 위한 정적 분석 도구.**

[English](./README.md) | **한국어**

</div>

---

`async-doctor`는 Node.js / TypeScript 코드에서 서로 독립적인 비동기 작업이 동시에 실행될 수
있음에도 순차적으로 `await`되는 패턴을 찾아낸다. 이런 코드는 컴파일도 깨끗이 되고 테스트도
통과하지만, 프로덕션에서는 지연시간(latency)으로만 드러나는 버그다.

```ts
// ❌ sequential-await가 이 코드를 탐지한다 — 200ms + 150ms가 연속으로 소요됨
const user = await getUser(id);
const posts = await getPosts(id);

// ✅ 결과는 동일하지만, 지연시간은 max(200ms, 150ms)
const [user, posts] = await Promise.all([getUser(id), getPosts(id)]);
```

## 목차

- [설치](#설치)
- [사용법](#사용법)
- [설정 파일](#설정-파일)
- [Rules](#rules)
- [Finding 억제하기](#finding-억제하기)
- [자동 수정](#자동-수정)
- [출력 형식](#출력-형식)
- [GitHub Action](#github-action)
- [프로그래매틱 API](#프로그래매틱-api)
- [아키텍처](#아키텍처)
- [개발](#개발)
- [라이선스](#라이선스)

## 설치

```bash
npm install -D async-doctor
# 또는
pnpm add -D async-doctor
# 또는 설치 없이 바로 실행
npx async-doctor src
```

## 사용법

```bash
async-doctor <path> [--verbose] [--format text] [--severity warning]
```

- `<path>` — 파일 하나 또는 디렉토리(재귀적으로 스캔). 지원 확장자:
  `.ts .tsx .js .jsx .mts .cts`.
- `--verbose` — 문제가 된 코드 스니펫도 함께 출력한다.
- `--format <format>` — 출력 형식: `text`(기본값), `json`, `sarif`, `html`, `junit` 중 하나.
- `--severity <level>` — `error` > `warning` > `info` 중 지정한 수준 이상인 finding만 보고한다.
- `--fix` — 자동 수정을 적용한 뒤 재분석해서 결과를 보고한다. [자동 수정](#자동-수정) 참고.
- `--fix-dry-run` — 아무것도 쓰지 않고 `--fix`가 무엇을 바꿀지만 미리 보여준다. `--fix`와 함께
  쓸 수 없다.

```bash
async-doctor src
async-doctor src/user.service.ts --verbose
async-doctor src --severity warning
async-doctor src --format json
async-doctor src --format sarif > async-doctor.sarif
async-doctor src --format html > report.html
async-doctor src --format junit > junit.xml
async-doctor src --fix-dry-run
async-doctor src --fix
```

Exit code: `0` findings 없음, `1` findings 있음, `2` 사용법 오류 또는 런타임 오류.

## 설정 파일

`async-doctor`를 실행하는 디렉토리(`process.cwd()`에서만 찾으며 상위 디렉토리로 거슬러 올라가지
않는다)에 `.async-doctorrc.json`을 두면, 매번 CLI 플래그를 반복하는 대신 프로젝트 전역 기본값을
설정할 수 있다:

```json
{
  "ignore": ["**/*.generated.ts", "vendor/**"],
  "rules": {
    "no-await-in-loop": "off",
    "sequential-await": "error"
  },
  "format": "json",
  "severity": "warning"
}
```

- `ignore` — 설정 파일이 있는 디렉토리 기준 상대경로에 매칭되는 glob 패턴. `*`(한 경로 세그먼트
  내 임의 문자), `**`(0개 이상의 세그먼트), 리터럴 세그먼트를 지원한다 — 완전한 glob 구현체는
  아니며(`?`, `{a,b}`, `[abc]` 미지원), `ts-morph` 외의 의존성을 추가하지 않기 위한 의도적인
  설계다.
- `rules` — rule 이름을 `"off"`로 매핑하면 해당 rule을 비활성화하고, `Severity`(`"error"` |
  `"warning"` | `"info"`)로 매핑하면 그 rule이 만드는 모든 finding의 severity를 오버라이드한다.
  인식되지 않는 rule 이름(오타, 삭제/이름 변경된 rule)은 조용히 무시된다 —
  [억제 코멘트](#finding-억제하기)와 동일한 정책.
- `format` / `severity` — 해당하는 CLI 플래그가 주어지지 않았을 때 쓰이는 기본값.

**우선순위: CLI 플래그 > 설정 파일 > 내장 기본값**(`format: "text"`, severity 임계값 없음).
커맨드라인의 `--format json`은 설정 파일의 `"format": "html"`보다 항상 우선한다.

설정 파일이 없는 것은 오류가 아니다 — 파일이 없을 때와 동작이 완전히 동일하다. 반면 파일은
존재하지만 JSON 파싱에 실패하거나 위 스키마를 위반하는 경우(예: `"rules": { "x": "nope" }`)는
명확한 오류 메시지와 함께 exit code `2`로 실행 자체를 실패시킨다 — 사용자가 직접 작성한 파일이기
때문에, 그 안의 실수를 조용히 무시하는 것이 오히려 더 혼란스럽다고 판단했다.

## Rules

| Rule                                                      | 탐지 대상                                                                                                                                                                  | Severity  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [`sequential-await`](src/rules/sequential-await.ts)       | 서로의 결과에 의존하지 않아 `Promise.all`로 병렬 실행이 가능한데도 연속으로 이어지는 `await`들.                                                                            | `warning` |
| [`no-await-in-loop`](src/rules/no-await-in-loop.ts)       | 루프 안에서 배치 처리 대신 한 번에 한 반복씩 순차 실행되는 `await` 표현식.                                                                                                 | `warning` |
| [`no-foreach-async`](src/rules/no-foreach-async.ts)       | `array.forEach(async (item) => { await ... })` — `forEach`는 콜백이 반환하는 promise를 기다리지 않으므로 에러가 삼켜지고 실행 순서도 보장되지 않는다.                      | `warning` |
| [`no-async-reduce`](src/rules/no-async-reduce.ts)         | `array.reduce(async (acc, item) => { await ... })` — async reducer가 이전 반복의 누산기 promise를 매번 await하면서 모든 항목이 강제로 하나씩 순차 실행된다.                | `warning` |
| [`no-floating-promise`](src/rules/no-floating-promise.ts) | Promise를 반환하는 호출이 표현식문으로 그대로 버려진 경우 — await되지도, 반환/저장되지도, `.then()`/`.catch()`로 체이닝되지도 않아 reject가 unhandled rejection이 된다.    | `warning` |
| [`sequential-then`](src/rules/sequential-then.ts)         | `a().then(x => b().then(y => ...))` — 서로 독립적인 `.then()` 체인이 다른 `.then()` 콜백 안에 중첩되어, 바깥 결과에 의존하지 않는데도 바깥 promise가 끝날 때까지 기다린다. | `warning` |

정적 분석은 런타임 부수효과를 볼 수 없기 때문에 모든 finding은 `warning`이다: 해당되는 것만
고치고, 호출들이 실제로 상태를 공유하는 경우라면 순차적인 형태를 그대로 유지하면 된다.

## Finding 억제하기

정적 분석은 런타임 상의 의도를 알 수 없으므로, finding이 의도적이고 안전하다고 확신하는 예외라면
rule 전체를 끄는 대신 인라인으로 억제하는 것이 좋다:

```ts
// async-doctor-disable-next-line sequential-await
const user = await getUser(id); // getUser는 getPosts가 의존하는 캐시를 미리 데운다
const posts = await getPosts(id);
```

- `// async-doctor-disable-next-line` — 다음 줄의 모든 rule을 억제한다.
- `// async-doctor-disable-next-line rule-a, rule-b` — 나열한 rule만 억제한다.
- `// async-doctor-disable-line` — 같은 줄(trailing comment)의 모든 rule을 억제한다.
- `// async-doctor-disable-line rule-a` — 같은 줄에서 나열한 rule만 억제한다.
- `/* ... */` 블록 코멘트도 동일하게 동작한다.

억제 코멘트는 항상 켜져 있으며, 이를 끄는 플래그는 없다. rule 이름 오타는 아무것도 억제하지
않는다(에러도 나지 않는다) — 위의 [Rules](#rules) 표와 이름을 반드시 대조해볼 것.

## 자동 수정

`--fix`는 실제로 파일에 변경을 쓰고, `--fix-dry-run`은 미리보기만 한다. **현재 버전에서는
[`no-floating-promise`](#rules)만 자동 수정을 지원한다** — 이 rule의 수정은 원본 호출식의
텍스트를 전혀 건드리지 않는, 단 하나의 좁은 삽입(`getUser(id);` → `void getUser(id);`)뿐이다.
나머지 다섯 rule의 제안은 모두 구조적 재작성(호출을 `Promise.all`로 감싸기, 루프를 `for...of`로
바꾸기 등)이 필요해 의도에 대한 사람의 판단이 필요하다 — finding이 오탐이었을 경우 자동으로
적용하면 정상 동작하는 코드를 망가뜨릴 위험이 있어, 이번 버전에서는 의도적으로 자동 수정
대상에서 제외했다.

```bash
async-doctor src --fix-dry-run   # 미리보기만, 파일을 쓰지 않는다
async-doctor src --fix           # 수정을 적용한 뒤 재분석해서 결과를 보고한다
```

- `--fix`는 파일에 쓴 뒤 수정된 파일들을 다시 분석하므로, 리포트는 도구가 "고치려고 했던 것"이
  아니라 실제로 디스크에 반영된 내용을 반영한다.
- `--fix-dry-run`은 절대 파일을 쓰지 않으며(이 프로젝트 테스트 스위트에서 바이트 단위로 검증됨),
  항상 원본 findings와 원본 exit code를 그대로 보고한다 — 따라서 CI를 포함한 어떤 환경에서도
  안전하게 실행할 수 있다.
- [인라인 코멘트](#finding-억제하기)로 억제됐거나 [설정 파일](#설정-파일)에서 `"off"`로 꺼진
  rule의 finding은 애초에 분석 대상이 아니므로 수정 대상도 될 수 없다.
- `--fix`를 연속으로 두 번 실행해도 안전하다: 두 번째 실행에서는 고칠 게 남아있지 않다.

`--fix`/`--fix-dry-run`을 쓸 때의 exit code도 평소와 같은 규칙(`0` findings 없음, `1` findings
있음)을 따르되, 실제로 보고되는 findings를 기준으로 판정한다 — `--fix`는 재분석 결과, `--fix-dry-run`은
원본 findings.

## 출력 형식

| Format  | 용도                                                                                                | 경로 표기 방식              |
| ------- | --------------------------------------------------------------------------------------------------- | --------------------------- |
| `text`  | 로컬 개발, 터미널 출력                                                                              | cwd 기준 상대경로           |
| `json`  | CI/툴링에서 소비 — `{ asyncDoctorVersion, summary, findings }`                                      | 절대경로                    |
| `sarif` | [GitHub Code Scanning](https://sarifweb.azurewebsites.net/)에 바로 업로드해 PR 인라인 주석으로 사용 | 저장소 기준 상대경로, POSIX |
| `html`  | 공유하거나 보관하기 좋은, 완전히 독립적인 단일 파일 리포트                                          | cwd 기준 상대경로           |
| `junit` | Jenkins/GitLab CI/CircleCI 등 GitHub 외 CI 대시보드의 네이티브 테스트 결과 UI                       | cwd 기준 상대경로           |

`--format json`은 findings가 0건이어도 항상 유효한 문서를 출력한다. `--format sarif`,
`--format html`, `--format junit`은 `--verbose`일 때 추가로 문제가 된 코드 스니펫을 함께 담는다.

## GitHub Action

`async-doctor`는 저장소 루트의 `action.yml`을 통해 composite action 형태로도 제공되므로, 다른
저장소에서 별도 설치 없이 CI 안에서 바로 실행할 수 있다. 이 액션은 사용하는 액션 태그와 정확히
일치하는 npm 버전에 스스로를 고정한다 — `@v1`을 체크아웃하면 그 태그 시점의 `package.json`에
적힌 버전이 그대로 실행되므로, "액션 버전"과 "실제로 실행되는 npm 버전" 사이에 드리프트가 생길
수 없다.

| Input              | 기본값                         | 설명                                                                                     |
| ------------------ | ------------------------------ | ---------------------------------------------------------------------------------------- |
| `path`             | `.`                            | 분석할 파일 또는 디렉토리                                                                |
| `severity`         | `''`                           | 이 수준 이상의 finding만 보고: `error` \| `warning` \| `info`                            |
| `fail-on-findings` | `'true'`                       | finding이 보고되면 step을 실패시킬지 여부. Code Scanning에만 의존하려면 `'false'`로 설정 |
| `sarif-file`       | `'async-doctor-results.sarif'` | SARIF 리포트를 쓸 경로                                                                   |

Output: `sarif-file` — SARIF 리포트가 실제로 쓰인 경로. `github/codeql-action/upload-sarif`로
그대로 이어서 연결할 수 있다.

기본 사용법 — finding이 보고되면 체크를 실패시킨다:

```yaml
name: async-doctor
on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hhw12409/async-doctor@v1
        with:
          path: src
```

Code Scanning과 연동하는 권장 패턴 — 체크를 실패시키지 않고 PR 주석으로만 findings를 노출한다:

```yaml
name: async-doctor
on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: hhw12409/async-doctor@v1
        id: async-doctor
        with:
          path: src
          fail-on-findings: "false"
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ steps.async-doctor.outputs.sarif-file }}
```

`fail-on-findings: false`로 설정하면 워크플로는 (async-doctor 자체가 오류를 내지 않는 한) 항상
계속 진행되고, findings는 실패한 체크 대신 Code Scanning의 인라인 PR 주석으로 나타난다.

## 프로그래매틱 API

```ts
import { analyze, collectFiles, consoleReporter } from "async-doctor";

const findings = analyze(collectFiles("src"), { severityThreshold: "warning" });
console.log(consoleReporter.report(findings, { verbose: true }));
```

`applyFixes(findings, { dryRun })`는 `Finding.fix`의 삽입 내용을 디스크에 적용한다(`dryRun: true`면
아무것도 쓰지 않고 무엇을 할지만 보고한다):

```ts
import { analyze, applyFixes, collectFiles } from "async-doctor";

const files = collectFiles("src");
const result = applyFixes(analyze(files), { dryRun: false });
console.log(`Fixed ${result.fixedCount} finding(s) in ${result.fixedFiles.length} file(s).`);
```

## 아키텍처

```
action.yml                 composite GitHub Action (uses: hhw12409/async-doctor@v1)
src/
  cli/index.ts             인자 파싱 + 순수 run() (import 시점 부수효과 없음)
  cli/bin.ts                얇은 실행 진입점 (shebang, run() 호출)
  analyzer/
    analyzer.ts             파싱된 파일들에 대해 등록된 모든 rule을 실행한다
    context.ts               각 rule에 전달되는 AnalysisContext를 만든다
    file-discovery.ts       path -> 파일 목록, SUPPORTED_EXTENSIONS, filterIgnored() (ignore glob)
    suppressions.ts         인라인 disable-comment 파싱 (rule과 무관한 별도 관심사)
    fixer.ts                 applyFixes(): Finding.fix 삽입을 디스크에 씀 (--fix / --fix-dry-run)
  rules/index.ts             rule 레지스트리 (확장점)
  reporter/
    types.ts                 Reporter 인터페이스, ReportFormat, REPORT_FORMATS
    shared.ts                 모든 reporter가 공유하는 경로/카운팅 헬퍼
    console-reporter.ts      text 출력
    json-reporter.ts         머신 판독용 JSON 출력
    sarif-reporter.ts        SARIF 2.1.0 출력 (GitHub Code Scanning)
    html-reporter.ts         독립적인 단일 파일 HTML 출력
    junit-reporter.ts        JUnit XML 출력 (Jenkins/GitLab CI/CircleCI)
  core/
    types.ts                 Severity, Finding, AnalysisContext, AsyncDoctorRule
    severity.ts               severity 순위 매기기 + 임계값 필터링
    config.ts                 .async-doctorrc.json 로딩 + 스키마 검증
    package-info.ts           package.json에서 파생되는 VERSION / HOMEPAGE
  index.ts                   프로그래매틱 진입점
```

`core/`는 `config.ts`를 제외하면 바깥으로의 의존성이 없다 — `config.ts`는 설정 파일의 `format`
필드를 CLI와 동일한 목록으로 검증하기 위해 `reporter/types.ts`에서 `ReportFormat`/
`REPORT_FORMATS`를 가져온다. 이는 실수가 아니라 의도적으로 좁게 둔 예외다.

### Rule 추가하기

`src/rules/<rule-name>.ts`에 `AsyncDoctorRule`을 구현하고 `src/rules/index.ts`에 등록한다.
analyzer는 이 배열을 순회할 뿐이므로 analyzer 자체를 수정할 필요는 없다.

```ts
import type { AsyncDoctorRule } from "../core/types.js";

export const myRule: AsyncDoctorRule = {
  name: "my-rule",
  description: "…",
  severity: "warning",
  analyze({ sourceFile, filePath }) {
    return [];
  },
};
```

### Reporter 추가하기

`src/reporter/types.ts`의 `Reporter`를 새 파일에 구현하고, `src/cli/index.ts`의 `REPORTERS` 맵에
등록한 뒤, 프로그래매틱 사용을 위해 `src/index.ts`에서 재export한다.

## 개발

```bash
npm install
npm run typecheck
npm test
npm run build
```

rule 작성 워크플로, 코드 스타일 컨벤션, PR 가이드라인은 [CONTRIBUTING.md](./CONTRIBUTING.md)를
참고할 것.

## 라이선스

[MIT](./LICENSE)
