<div align="center">

<pre>
~~~~/\/\/‾‾‾\/\~~~~
</pre>

# async-doctor

[![npm version](https://img.shields.io/npm/v/async-doctor.svg)](https://www.npmjs.com/package/async-doctor)
[![CI](https://github.com/hhw12409/async-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/hhw12409/async-doctor/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/async-doctor.svg)](./LICENSE)

**Static analysis for the async bottlenecks your linter doesn't catch.**

</div>

---

`async-doctor` scans Node.js / TypeScript code for independent asynchronous operations that are
awaited sequentially when they could run concurrently — a bug that compiles cleanly, passes tests,
and only shows up as latency in production.

```ts
// ❌ sequential-await flags this — 200ms + 150ms, back to back
const user = await getUser(id);
const posts = await getPosts(id);

// ✅ same result, latency = max(200ms, 150ms)
const [user, posts] = await Promise.all([getUser(id), getPosts(id)]);
```

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Rules](#rules)
- [Suppressing Findings](#suppressing-findings)
- [Output Formats](#output-formats)
- [Programmatic API](#programmatic-api)
- [Architecture](#architecture)
- [Development](#development)
- [License](#license)

## Install

```bash
npm install -D async-doctor
# or
pnpm add -D async-doctor
# or run without installing
npx async-doctor src
```

## Usage

```bash
async-doctor <path> [--verbose] [--format text] [--severity warning]
```

- `<path>` — a single file or a directory (recursively scanned). Supported extensions:
  `.ts .tsx .js .jsx .mts .cts`.
- `--verbose` — also print the offending code snippet.
- `--format <format>` — output format: `text` (default), `json`, `sarif`, or `html`.
- `--severity <level>` — only report findings at or above `error` > `warning` > `info`.

```bash
async-doctor src
async-doctor src/user.service.ts --verbose
async-doctor src --severity warning
async-doctor src --format json
async-doctor src --format sarif > async-doctor.sarif
async-doctor src --format html > report.html
```

Exit codes: `0` no findings, `1` findings reported, `2` usage or runtime error.

## Rules

| Rule                                                | Detects                                                                                                                                                | Severity  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| [`sequential-await`](src/rules/sequential-await.ts) | Consecutive `await`s that don't depend on each other's results and could run in parallel via `Promise.all`.                                            | `warning` |
| [`no-await-in-loop`](src/rules/no-await-in-loop.ts) | `await` expressions executed one iteration at a time inside a loop instead of batched.                                                                 | `warning` |
| [`no-foreach-async`](src/rules/no-foreach-async.ts) | `array.forEach(async (item) => { await ... })` — `forEach` never awaits the callback's promise, so errors are swallowed and ordering isn't guaranteed. | `warning` |

Static analysis can't see runtime side effects, so every finding is a `warning`: fix the ones that
apply, and keep the sequential form where the calls genuinely share state.

## Suppressing Findings

Static analysis can't see runtime intent, so when a finding is a deliberate, known-safe exception,
suppress it inline instead of turning the whole rule off:

```ts
// async-doctor-disable-next-line sequential-await
const user = await getUser(id); // getUser warms a cache that getPosts relies on
const posts = await getPosts(id);
```

- `// async-doctor-disable-next-line` — suppress every rule on the next line.
- `// async-doctor-disable-next-line rule-a, rule-b` — suppress only the listed rules.
- `// async-doctor-disable-line` — suppress every rule on the same line (as a trailing comment).
- `// async-doctor-disable-line rule-a` — suppress only the listed rule on the same line.
- `/* ... */` block comments work the same way.

Suppression comments are always on — there's no flag to disable them. A misspelled rule name
suppresses nothing (no error); double-check the name against the [Rules](#rules) table above.

## Output Formats

| Format  | Use case                                                                                                 | Path style           |
| ------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| `text`  | Local development, terminal output                                                                       | relative to cwd      |
| `json`  | CI/tooling consumption — `{ asyncDoctorVersion, summary, findings }`                                     | absolute             |
| `sarif` | Upload straight to [GitHub Code Scanning](https://sarifweb.azurewebsites.net/) for inline PR annotations | repo-relative, POSIX |
| `html`  | Self-contained single-file report to share or archive                                                    | relative to cwd      |

`--format json` always prints a valid document, even with zero findings. `--format sarif` and
`--format html` additionally embed the offending snippet via `--verbose`.

## Programmatic API

```ts
import { analyze, collectFiles, consoleReporter } from "async-doctor";

const findings = analyze(collectFiles("src"), { severityThreshold: "warning" });
console.log(consoleReporter.report(findings, { verbose: true }));
```

## Architecture

```
src/
  cli/index.ts             argument parsing + pure run() (no side effects on import)
  cli/bin.ts               thin executable entrypoint (shebang, calls run())
  analyzer/
    analyzer.ts            runs every registered rule over the parsed files
    context.ts             builds the AnalysisContext handed to each rule
    file-discovery.ts      path -> file list, SUPPORTED_EXTENSIONS
    suppressions.ts        inline disable-comment parsing (rule-agnostic)
  rules/index.ts           rule registry (the extension point)
  reporter/
    types.ts               Reporter interface
    shared.ts              path/counting helpers shared by every reporter
    console-reporter.ts    text output
    json-reporter.ts       machine-readable JSON output
    sarif-reporter.ts      SARIF 2.1.0 output (GitHub Code Scanning)
    html-reporter.ts       self-contained single-file HTML output
  core/
    types.ts               Severity, Finding, AnalysisContext, AsyncDoctorRule
    severity.ts            severity ranking + threshold filtering
    package-info.ts        VERSION / HOMEPAGE derived from package.json
  index.ts                 programmatic entrypoint
```

### Adding a rule

Implement `AsyncDoctorRule` in `src/rules/<rule-name>.ts` and register it in
`src/rules/index.ts`. The analyzer only iterates that array, so no analyzer change is needed.

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

### Adding a reporter

Implement `Reporter` from `src/reporter/types.ts` in a new file, register it in the `REPORTERS`
map in `src/cli/index.ts`, and re-export it from `src/index.ts` for programmatic use.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the rule-authoring workflow and pull request guidelines.

## License

[MIT](./LICENSE)
