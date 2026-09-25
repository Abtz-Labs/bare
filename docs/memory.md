# Bare Deploy — Memory

## Facts

- npm package `bare-deploy`; CLI entry `bare.js` (single file, ES modules, Node >=18, no runtime deps).
- Config: `bare.config.json`. Commands: `init`, `deploy`, `list`, `use`/`rollback`, `cleanup`.
- Release model: `deployTo/releases/<ts>-<version>`, symlinks `current`, `previous`, optional `webroot -> releases/current`.
- Deploy order: extract -> copy `.well-known` -> (`type: "php"` writes `.user.ini`) -> switch `current` -> switch `webroot` -> `postScripts` -> `startScript` -> healthCheck.
- Tests: vitest (`npm test`), unit + integration under `tests/`.
- Docs: `README.md` (user), `docs/knowledge/*` (agent), `CLAUDE.md` index, plans in `docs/plans/`.

## Session 2026-09-25 — PHP OPcache

- Confirmed OPcache is the cause of stale PHP deploys: `opcache.revalidate_path=0` (default) + symlinked releases. The old release file still exists, so `validate_timestamps` passes and the old bytecode is served.
- HestiaCP stack = Nginx reverse proxy -> Apache `mod_proxy_fcgi` -> PHP-FPM. Nginx `$realpath_root` does NOT apply. Apache/HestiaCP fix: `opcache.revalidate_path=1`.
- Verified on `projects.abtz.co`: served `0.2.2` while `current` -> `0.2.3`; `opcache_reset()` flipped it to `0.2.3`; `.user.ini` with `revalidate_path=1` picked up a repointed symlink immediately.
- Added `servers[].type` (`"node"` | `"php"`). `"php"` writes `.user.ini` (`opcache.revalidate_path=1`) via `buildPhpUserIniCommand()` after extraction, before the symlink switch. Tests: `tests/unit/deploy-php.test.js`. All 74 tests pass.
- Fixed README: `postScripts`/`startScript` run AFTER the symlink switch (was documented as before).
- Plan: `docs/plans/2026-09-25-php-opcache-deployments.md`.
