# Simplify bare.config.json: single-server shorthand + minimal init

- **status**: done
- **date**: 2026-09-25

## Context

`bare.config.json` duplicates `include`/`ignore` at global and per-server level, and `bare init`
emits many empty fields. For the common single-server case the `servers: [ ... ]` nesting adds noise.

## Changes

1. `loadConfig` accepts a **single-server shorthand**: server fields at the top level with `servers`
   omitted. It normalizes to `config.servers = [server]`, excluding `keepReleases` and `healthCheck`.
2. `bare init` emits a **minimal flat config**: no empty `include`/`ignore`/`preScripts`/`postScripts`,
   no global `include`/`ignore`.
3. Docs: README Quick Start shows the shorthand; `servers[]` documented for multi-server.

## Verification

- New `tests/unit/config.test.js` (shorthand normalizes, array still works, validation applies).
- Updated `tests/unit/init.test.js` expectations.
- `npm test` green.
