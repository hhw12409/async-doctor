# async-doctor

[![npm version](https://img.shields.io/npm/v/async-doctor.svg)](https://www.npmjs.com/package/async-doctor)
[![CI](https://github.com/hhw12409/async-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/hhw12409/async-doctor/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/async-doctor.svg)](./LICENSE)

Static analysis CLI that detects async performance bottlenecks — independent asynchronous
operations that are awaited sequentially when they could run concurrently — in Node.js /
TypeScript code.

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

`--format json` always prints a valid JSON document (even with zero findings) shaped as
`{ asyncDoctorVersion, summary: { total, error, warning, info }, findings: [...] }`, with
absolute `file` paths so any consumer can resolve them.

`--format sarif` prints a [SARIF 2.1.0](https://sarifweb.azurewebsites.net/) log that can be
uploaded straight to GitHub Code Scanning (`github/codeql-action/upload-sarif`). File paths are
repository-relative with POSIX separators, and `--verbose` additionally embeds the offending
snippet in `region.snippet.text`.

Examples:

```bash
async-doctor src
async-doctor src/user.service.ts --verbose
async-doctor src --severity warning
async-doctor src --format json
async-doctor src --format sarif > async-doctor.sarif
```

Exit codes: `0` no findings, `1` findings reported, `2` usage or runtime error.

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

Implement `Reporter` from `src/reporter/types.ts` in a new file and register it in the
`REPORTERS` map in `src/cli/index.ts`.

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
