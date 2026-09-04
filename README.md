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
- [Config File](#config-file)
- [Rules](#rules)
- [Suppressing Findings](#suppressing-findings)
- [Auto-fixing](#auto-fixing)
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
- `--fix` — apply automatic fixes, then re-analyze and report the result. See
  [Auto-fixing](#auto-fixing).
- `--fix-dry-run` — preview what `--fix` would change without writing anything. Cannot be
  combined with `--fix`.

```bash
async-doctor src
async-doctor src/user.service.ts --verbose
async-doctor src --severity warning
async-doctor src --format json
async-doctor src --format sarif > async-doctor.sarif
async-doctor src --format html > report.html
async-doctor src --fix-dry-run
async-doctor src --fix
```

Exit codes: `0` no findings, `1` findings reported, `2` usage or runtime error.

## Config File

Drop a `.async-doctorrc.json` in the directory you run `async-doctor` from (checked in
`process.cwd()` only — no walking up to parent directories) to set project-wide defaults instead
of repeating CLI flags every time:

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

- `ignore` — glob patterns matched against each file's path relative to the config file's
  directory. Supports `*` (any characters within one path segment), `**` (any number of segments,
  including zero), and literal segments — not a full glob implementation (no `?`, `{a,b}`,
  `[abc]`), by design, to avoid adding a dependency beyond `ts-morph`.
- `rules` — map a rule name to `"off"` to disable it, or to a `Severity` (`"error"` | `"warning"` |
  `"info"`) to override the severity of every finding that rule produces. Unrecognized rule names
  (typos, removed/renamed rules) are silently ignored — same policy as
  [suppression comments](#suppressing-findings).
- `format` / `severity` — defaults used when the matching CLI flag isn't passed.

**Priority: CLI flag > config file > built-in default** (`format: "text"`, no severity threshold).
`--format json` on the command line always wins over `"format": "html"` in the config file.

A missing config file is not an error — behavior is identical to not having one. A config file
that exists but fails to parse as JSON, or violates the schema above (e.g. `"rules": { "x": "nope"
}`), fails the run with a clear error message and exit code `2` — it's a file you wrote, so
silently ignoring mistakes in it would be more confusing than failing loudly.

## Rules

| Rule                                                      | Detects                                                                                                                                                                                                    | Severity  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [`sequential-await`](src/rules/sequential-await.ts)       | Consecutive `await`s that don't depend on each other's results and could run in parallel via `Promise.all`.                                                                                                | `warning` |
| [`no-await-in-loop`](src/rules/no-await-in-loop.ts)       | `await` expressions executed one iteration at a time inside a loop instead of batched.                                                                                                                     | `warning` |
| [`no-foreach-async`](src/rules/no-foreach-async.ts)       | `array.forEach(async (item) => { await ... })` — `forEach` never awaits the callback's promise, so errors are swallowed and ordering isn't guaranteed.                                                     | `warning` |
| [`no-async-reduce`](src/rules/no-async-reduce.ts)         | `array.reduce(async (acc, item) => { await ... })` — an async reducer awaits the previous iteration's accumulator promise, forcing every item to run strictly one after another.                           | `warning` |
| [`no-floating-promise`](src/rules/no-floating-promise.ts) | A Promise-returning call left as a bare statement — not awaited, returned, stored, or chained with `.then()`/`.catch()` — so a rejection becomes an unhandled rejection.                                   | `warning` |
| [`sequential-then`](src/rules/sequential-then.ts)         | `a().then(x => b().then(y => ...))` — an independent `.then()` chain nested inside another `.then()` callback, forcing it to wait for the outer promise even though it doesn't depend on the outer result. | `warning` |

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

## Auto-fixing

`--fix` writes changes to disk; `--fix-dry-run` only previews them. **As of this version, only
[`no-floating-promise`](#rules) supports auto-fix** — its fix is a single, narrow insertion
(`getUser(id);` → `void getUser(id);`) that never touches the original call expression's text.
The other five rules' suggestions all require structural rewrites (wrapping calls in
`Promise.all`, converting a loop to `for...of`, etc.) that need human judgment about intent, so
applying them automatically risks corrupting working code if the finding was a false positive —
they're intentionally excluded from auto-fix in this version.

```bash
async-doctor src --fix-dry-run   # preview only, never writes a file
async-doctor src --fix           # apply fixes, then re-analyze and report the result
```

- `--fix` re-runs analysis on the fixed files after writing, so the report reflects what's
  actually on disk — not just what the tool intended to change.
- `--fix-dry-run` never writes a file (verified byte-for-byte in this project's test suite) and
  always reports the original findings with the original exit code, so it's safe to run in any
  context, including CI.
- A finding suppressed by an [inline comment](#suppressing-findings) or a rule turned `"off"` in
  the [config file](#config-file) is never analyzed in the first place, so it's never a fix
  candidate either.
- Running `--fix` twice in a row is safe: the second run finds nothing left to fix.

Exit codes with `--fix`/`--fix-dry-run` follow the same rule as always (`0` no findings, `1`
findings reported), evaluated against the findings that are actually reported: the re-analyzed
result for `--fix`, the original findings for `--fix-dry-run`.

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

`applyFixes(findings, { dryRun })` applies any `Finding.fix` insertions to disk (or, with
`dryRun: true`, just reports what it would do without writing anything):

```ts
import { analyze, applyFixes, collectFiles } from "async-doctor";

const files = collectFiles("src");
const result = applyFixes(analyze(files), { dryRun: false });
console.log(`Fixed ${result.fixedCount} finding(s) in ${result.fixedFiles.length} file(s).`);
```

## Architecture

```
src/
  cli/index.ts             argument parsing + pure run() (no side effects on import)
  cli/bin.ts               thin executable entrypoint (shebang, calls run())
  analyzer/
    analyzer.ts            runs every registered rule over the parsed files
    context.ts             builds the AnalysisContext handed to each rule
    file-discovery.ts      path -> file list, SUPPORTED_EXTENSIONS, filterIgnored() (ignore globs)
    suppressions.ts        inline disable-comment parsing (rule-agnostic)
    fixer.ts               applyFixes(): writes Finding.fix insertions to disk (--fix / --fix-dry-run)
  rules/index.ts           rule registry (the extension point)
  reporter/
    types.ts               Reporter interface, ReportFormat, REPORT_FORMATS
    shared.ts              path/counting helpers shared by every reporter
    console-reporter.ts    text output
    json-reporter.ts       machine-readable JSON output
    sarif-reporter.ts      SARIF 2.1.0 output (GitHub Code Scanning)
    html-reporter.ts       self-contained single-file HTML output
  core/
    types.ts               Severity, Finding, AnalysisContext, AsyncDoctorRule
    severity.ts            severity ranking + threshold filtering
    config.ts              .async-doctorrc.json loading + schema validation
    package-info.ts        VERSION / HOMEPAGE derived from package.json
  index.ts                 programmatic entrypoint
```

`core/` has no outward dependencies except `config.ts`, which imports `ReportFormat`/
`REPORT_FORMATS` from `reporter/types.ts` to validate the config file's `format` field against the
same list the CLI uses — a deliberate, narrow exception rather than an oversight.

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

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the rule-authoring workflow, code style conventions,
and pull request guidelines.

## License

[MIT](./LICENSE)
