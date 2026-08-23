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

## Reporting a false positive

Open an issue with the exact code snippet and the rule name. False positives are the fastest
way to lose a static analysis tool's credibility, so these reports are prioritized over new
features.

## Commit style

Keep commits focused and describe the _why_, not just the _what_. No specific format is
enforced.
