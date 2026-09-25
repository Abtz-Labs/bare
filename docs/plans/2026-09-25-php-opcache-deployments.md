# PHP OPcache-safe deployments

- **status**: done
- **date**: 2026-09-25

## Context

Bare's symlink release model (`public_html -> releases/current -> releases/<id>`) breaks
PHP apps because PHP OPcache resolves the symlink once, caches the compiled script under the
old release's real path, and keeps serving it after `current` is repointed. `validate_timestamps`
does not help because the old release file still exists and is unchanged. Confirmed on
HestiaCP (Nginx -> Apache mod_proxy_fcgi -> PHP-FPM) where `opcache.revalidate_path=0`.

## Root cause

- Apache passes the symlink path as `SCRIPT_FILENAME`.
- OPcache caches by resolved realpath and does not re-resolve symlinks when `opcache.revalidate_path=0`.
- `opcache_reset()` / FPM restart fixes it; `opcache.revalidate_path=1` fixes it (verified).

## Changes

1. Add server option `type`: `"node"` (default) or `"php"`.
2. Validate `type` in `loadConfig`.
3. When `type: "php"`, after extraction and before the symlink switch, ensure the release's
   `.user.ini` contains `opcache.revalidate_path=1`. This is the no-root, per-app fix.
4. Export a testable helper `buildPhpUserIniCommand(releaseDir)`.
5. Add `"type": "node"` to the `bare init` template.
6. Docs: README PHP section, `docs/knowledge/php-deployments.md`, CLAUDE.md link, and fix the
   incorrect postScripts/startScript ordering description.

## Verification

- `npm test` green.
- Unit tests: helper output, deploy emits `.user.ini` for `type: "php"`, does not for node,
  invalid `type` throws.
- Production: already verified manually on `projects.abtz.co` (opcache_reset flipped 0.2.2 -> 0.2.3;
  `opcache.revalidate_path=1` via `.user.ini` picked up a repointed symlink immediately).
