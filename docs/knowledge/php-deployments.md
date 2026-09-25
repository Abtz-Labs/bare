# PHP Deployments

## The OPcache + symlink problem

Bare serves apps through a `webroot → releases/current → releases/<id>` symlink. PHP OPcache
resolves the symlink once, caches the compiled script under the release's **real** path, and keeps
serving it after `current` is repointed. The old release directory still exists, so
`opcache.validate_timestamps=1` / `opcache.revalidate_freq` consider the cached file unchanged.

The root cause is `opcache.revalidate_path=0` (PHP default): OPcache does not re-resolve symlinks.

## Fixes

| Setup | Fix |
| --- | --- |
| Apache + `mod_proxy_fcgi` (HestiaCP) | `opcache.revalidate_path=1` in the FPM pool or `php.ini` |
| Any PHP-FPM, no root | `.user.ini` in the webroot with `opcache.revalidate_path=1` |
| Nginx + FPM (no Apache) | `fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;` |
| Caddy | `php_fastcgi ... { resolve_root_symlink }` |
| Fallback | Reset OPcache after the symlink switch (FPM reload, `cachetool opcache:reset`) |

Nginx only has `$realpath_root` when it talks to FPM directly. On HestiaCP, Nginx is a reverse
proxy to Apache, so the Apache/HestiaCP fix is `opcache.revalidate_path=1`.

## Bare support

`servers[].type: "php"` makes Bare run `buildPhpUserIniCommand(releaseDir)` after extraction and
before the symlink switch. The command ensures `opcache.revalidate_path=1` is present in the
release's `.user.ini` (creating the file if needed, appending only when missing).

## Evidence

Confirmed on HestiaCP (Nginx → Apache `mod_proxy_fcgi` → PHP-FPM):

- Live app served `APP_VERSION 0.2.2` while `releases/current` pointed to `0.2.3`.
- OPcache status showed the cached key `.../releases/20260923043711-0.2.2/index.php`.
- `opcache_reset()` flipped the live site to `0.2.3`.
- Isolated symlink repoint stayed stale; adding `opcache.revalidate_path=1` picked up the new
  target immediately.

## Related Files

- `bare.js` - `buildPhpUserIniCommand()`, deploy flow
- `README.md` - "Deploying PHP Applications"
