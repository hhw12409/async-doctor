# Contributing

## Setup

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Adding a detection rule

async-doctor is built so a new rule never requires touching the analyzer. See the
[Architecture](./README.md#architecture) section of the README for the extension contract, then:

1. Implement `AsyncDoctorRule` in `src/rules/<rule-name>.ts` using `ts-morph`. Prefer
   AST traversal (`SyntaxKind`, `getDescendantsOfKind`) over text/regex matching, and design
   an explicit exclusion condition before writing the detection condition — a rule with no way
   to avoid false positives should default its `severity` to `"warning"`.
2. Register the rule in `src/rules/index.ts`.
3. Add `tests/fixtures/<rule-name>/positive-*.ts` and at least two `negative-*.ts` fixtures,
   plus a matching `tests/rules/<rule-name>.test.ts` that asserts on `rule`/`severity`/`line`,
   not just the finding count.
4. Run `npm run typecheck && npm run lint && npx prettier --check . && npm test && npm run build`
   before opening a PR — CI runs the same checks on Node 18/20/22.

## Code Style

These are the conventions this codebase has actually converged on across releases — not
aspirational rules, but patterns enforced by review every time a PR drifted from them.

**Dependencies.** `ts-morph` is the only runtime dependency, and that's deliberate, not an
oversight. Before adding a package, implement it yourself if the scope is narrow (see the ignore
glob matcher in `src/analyzer/file-discovery.ts`, or JSON config validation in
`src/core/config.ts` — neither pulls in a glob or schema library). Reach for a dependency only
when a hand-rolled version would be a real correctness risk (parsing TypeScript itself, for
example — hence `ts-morph`).

**Comments explain why, not what.** Identifiers should make the _what_ obvious; comments exist
for the parts code can't say — why an edge case is excluded, why an approach that looks simpler
was rejected, what invariant a check protects. Most files carry a short module-level comment and
per-function rationale for non-obvious branches (see any file in `src/rules/` or
`src/core/config.ts`). If you delete a comment and a future reader would make the same mistake
you're preventing, put it back.

**Extend through existing extension points, don't special-case the pipeline.** `analyze()` in
`src/analyzer/analyzer.ts` iterates `AnalyzeOptions.rules` and never changes when a rule is
added — new rules register in `src/rules/index.ts`'s array. New reporters register in the
`REPORTERS` map in `src/cli/index.ts`, not a growing if/else. When a feature needs the analyzer
to do something new (v0.5.0's suppression comments, v0.8.0's `severityOverrides`), extend
`AnalyzeOptions` with an optional field rather than threading a special case through the rule
loop.

**Detect via AST, never text/regex on source.** `ts-morph`'s `SyntaxKind` traversal and comment
range APIs (`getLeadingCommentRanges`/`getTrailingCommentRanges`) are the only sanctioned way to
inspect code. A regex over `sourceFile.getFullText()` will match the same text inside a string or
template literal — this bit the inline-suppression feature during design and was avoided
up front, not fixed after a false-positive report.

**Every detection rule ships its exclusion logic, not just its pattern.** Before a rule detects
something, decide what it must _not_ flag and implement that check as a real condition (a type
check, a scope-boundary walk, a dependency check) — not a comment promising to handle it later.
Grep any file in `src/rules/` for the pattern: a detection loop paired with one or more
early-return guard functions.

**Precision over recall.** Every rule defaults to `severity: "warning"` because static analysis
cannot see runtime side effects — a sequential pair of awaits might share state you can't see in
the AST. When a false positive can't be designed away, prefer staying silent (false negative)
over flagging incorrectly; a wrong warning costs a static analysis tool more trust than a missed
one. If a false positive survives two rounds of fix attempts, document it as a known limitation
in the rule's JSDoc and the README instead of continuing to chase it.

**Unknown input: silent for identifiers, loud for user-authored files.** A misspelled rule name
in a suppression comment or in `.async-doctorrc.json`'s `rules` key is ignored, not an error —
this keeps old comments/config files working after a rule is renamed or removed. A malformed
config file (bad JSON, wrong field type) is the opposite: the user wrote that file for this tool,
so failing loudly with a clear message and exit code `2` beats silently ignoring their mistake.
Match the failure mode to which of these two cases you're in before adding new input handling.

**New public symbol → re-export from `src/index.ts`.** Anything usable programmatically (a new
reporter, a new core module, a new rule) needs an entry in `src/index.ts`. This has been missed
once (the HTML reporter in v0.4.0) and caught by QA every release since — check it yourself
before calling a feature done.

**Duplicate up to ~3 times before extracting a shared module.** `no-async-reduce` copied its
helpers from `no-foreach-async` rather than factoring out a shared module — extracting one means
editing an existing, already-shipped rule file, which raises review and regression risk for a
marginal readability win at low duplicate counts. Extract only once a third or fourth occurrence
makes the pattern unmistakably stable, and only if it doesn't require touching files outside the
feature you're adding.

**Tests assert on fields, not just counts.** A rule test checks `finding.rule` /
`finding.severity` / `finding.line`, not just `findings.length` — a rule that fires for the wrong
reason but the right count will pass a count-only assertion.

**Run the full verification chain yourself before declaring done — none of these commands imply
another.** `npm run typecheck && npm run lint && npx prettier --check . && npm test && npm run
build`. Prettier in particular does not run as part of typecheck or lint; two past CI failures on
this project were exactly that gap.

## Reporting a false positive

Open an issue with the exact code snippet and the rule name. False positives are the fastest
way to lose a static analysis tool's credibility, so these reports are prioritized over new
features.

## Commit style

Keep commits focused and describe the _why_, not just the _what_. No specific format is
enforced.
