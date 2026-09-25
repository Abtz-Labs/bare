```
 ██████╗  █████╗ ██████╗ ███████╗
 ██╔══██╗██╔══██╗██╔══██╗██╔════╝
 ██████╔╝███████║██████╔╝███████╗
 ██╔══██╗██╔══██╗██╔══██╗██╔════╝
 ██████╔╝██╔══██╗██╔══██╗███████╗
 ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
 Deploy tool by Abtz Labs
```

[![npm version](https://img.shields.io/npm/v/bare-deploy.svg)](https://www.npmjs.com/package/bare-deploy)
[![npm downloads](https://img.shields.io/npm/dt/bare-deploy.svg)](https://www.npmjs.com/package/bare-deploy)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Atomic zero-downtime deployments to **bare VPS** (Virtual Private Server) over SSH.

- No containers.
- No agents.
- No orchestration layers.
- Works out-of-the-box

Just disciplined releases.

---

## Philosophy

Bare Deploy is built for developers who:

- Deploy static websites, Node.js or PHP apps directly to VPS instances
- Want atomic releases with instant rollback
- Prefer SSH over platform abstraction
- Value operational clarity over orchestration complexity

Inspired by the simplicity of [Kamal](https://kamal-deploy.org/), but designed for host-native deployments.

---

## Features

- Atomic symlink-based releases
- Zero-downtime cutovers
- Parallel multi-server deploy
- Per-server configuration (different `distDirs` for different servers)
- SSH key authentication (no password prompts)
- Configurable pre & post hooks
- Automatic version bump
- Health check validation
- Lock-file to prevent concurrent deploys
- Dry-run mode
- Structured colored logs
- Optional JSON logging
- Rollback support
- Release pruning
- Support for static sites with Let's Encrypt preservation
- Automatic ignore of files in `.gitignore` (except the build output directory)

---

## How to Install

```bash
npm install -g bare-deploy
```

---

## Quick Start

In your project root, run the following command to generate the `bare.config.json` configuration file:

```sh
bare init
```

The files it creates looks like this 👇

```json
{
  "host": "your-server.com",
  "user": "deploy",
  "port": 22,
  "identityFile": "~/.ssh/id_rsa",
  "distDir": "./dist",
  "deployTo": "/var/www/app",
  "webroot": "",
  "type": "node",
  "startScript": "pm2 restart --env production --update-env",
  "keepReleases": 5,
  "healthCheck": {
    "url": "http://localhost:3000/health",
    "timeout": 15
  }
}
```

> [!NOTE]
> A single server can be configured at the top level, as above. To deploy to multiple servers, use a
> `servers` array instead; each entry accepts the server-specific options (`host`, `user`, `port`,
> `identityFile`, `distDir`, `deployTo`, `webroot`, `type`, `include`, `ignore`, `preScripts`,
> `postScripts`, `startScript`) and can differ per server.

> [!NOTE]
> When running `bare init`:
>
> - If `package.json` doesn't exist, it's created with version `0.1.0`
> - If `.gitignore` doesn't exist, it's created with `bare.config.json`
> - If `.gitignore` exists but doesn't contain `bare.config.json`, the entry is added automatically

---

## Configuration Options

### Server Options

For a single server, put these fields at the top level (see [Quick Start](#quick-start)). For multiple
servers, use the `servers` array — each entry can have its own configuration:

```json
{
  "servers": [
    {
      "host": "server.com",
      "user": "deploy",
      "port": 22,
      "identityFile": "~/.ssh/id_rsa",
      "distDir": "./dist",
      "deployTo": "/var/www/app",
      "webroot": "/var/www/app/public_html",
      "type": "node",
      "preScripts": [],
      "postScripts": [],
      "startScript": "pm2 restart --env production --update-env"
    }

    // ...
  ]
}
```

| Option                  | Required | Default    | Description                                                                                                                                                                                                          |
| ----------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `servers[].distDir`     | Yes      | `"./dist"` | Directory where the content to package for deployment lives.                                                                                                                                                         |
| `servers[].deployTo`    | Yes      |            | Base path **on the server** where deployments are stored. Bare Deploy creates a `releases/` subfolder with timestamped versions.                                                                                     |
| `servers[].webroot`     | No       | `Empty`    | Path to the web server's document root. On first deploy, backs up the existing directory to `{webroot}.bak` and replaces it with a symlink to `releases/current`. If first deploy fails, the backup is automatically restored. Copies `.well-known/` (Let's Encrypt) from the previous deployment. |
| `servers[].type`        | No       | `"node"`   | Application type: `"node"` or `"php"`. With `"php"`, Bare ensures `opcache.revalidate_path=1` in the release's `.user.ini` so OPcache follows the `current` symlink. See [Deploying PHP Applications](#deploying-php-applications).                                                                                                                          |
| `servers[].preScripts`  | No       | `[]`       | Array of commands to **run locally** before building the deployment package.                                                                                                                                         |
| `servers[].postScripts` | No       | `[]`       | Array of commands to **run on the server** after the new release is activated (symlink switched) and before the start script.                                                                                        |
| `servers[].startScript` | No       | `Empty`    | Command to run after symlink switch. Useful for process managers like PM2.                                                                                                                                           |
| `servers[].include`     | No       | `Empty`    | Array of glob patterns to include in the deployment package. When specified, only matching files are packaged. Falls back to global `include` if not set. Add `".*"` to include hidden files like `.env.production`. |
| `servers[].ignore`      | No       | `[]`       | Array of glob patterns to exclude from the deployment package. Applied after `include` patterns. Falls back to global `ignore` if not set.                                                                           |

### Global Options

| Option                | Required | Default                                          | Description                                                                                                                                                                               |
| --------------------- | -------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include`             | No       | `[]`                                             | Array of glob patterns to include in the deployment package. Used as fallback when not defined per-server.                                                                                |
| `ignore`              | No       | `[".git/*"]`                                     | Array of glob patterns to exclude from the deployment package. Used as fallback when not defined per-server.                                                                              |
| `keepReleases`        | No       | `5`                                              | Number of releases to keep on the server as history.                                                                                                                                      |
| `healthCheck`         | No       | `{}`                                             | Runs after all deploy steps to validate the deployment. If it fails, the deploy is automatically rolled back. Accepts `url` (URL to check) and `timeout` (seconds to wait, default `15`). |
| `healthCheck.url`     | `Empty`  | The URL to check after deployment.               |
| `healthCheck.timeout` | `15`     | Seconds to wait for the health check to succeed. |

---

## How to Deploy

```sh
bare deploy [options]
```

### Options:

```
  --dry-run         Simulate execution
  --json            JSON logging
  --verbose         Show detailed operation info
  --sequential      Deploy server-by-server
  --no-bump         Skip version bump
  --patch           Bump patch version (default)
  --minor           Bump minor version
  --major           Bump major version
```

### How It Works

- Bumps `package.json` version (skipped automatically on first deploy, or with `--no-bump`).
- Runs local pre-deploy scripts.
- Creates build artifact.
- Acquires lock.
- SCPs package to server.
- Extracts into timestamped release directory.
- Configures `.user.ini` for `type: "php"` (see [Deploying PHP Applications](#deploying-php-applications)).
- Atomically switches current symlink.
- Runs post-deploy scripts.
- Runs the start script, when set.
- Optionally validates health endpoint.
- Releases lock.
- Rollback, when needed. Simply re-points the symlink.

---

## Deploying PHP Applications

Bare works with PHP apps. Set `type` to `"php"` on the server:

```json
{
  "servers": [
    {
      "host": "server.com",
      "user": "deploy",
      "deployTo": "/home/user/web/example.com",
      "webroot": "/home/user/web/example.com/public_html",
      "type": "php"
    }
  ]
}
```

### The OPcache + symlink problem

PHP's OPcache compiles a script once and reuses the bytecode. Because Bare serves apps through a
`public_html → releases/current → releases/<id>` symlink, PHP can keep serving the **old** release
after `current` is repointed. `opcache.validate_timestamps` does not help: the old release directory
still exists, so the cached file looks unchanged.

With `type: "php"`, Bare writes this line to `.user.ini` in each release (after extraction, before the
symlink switch):

```ini
opcache.revalidate_path=1
```

This makes OPcache re-resolve symlinks on every deploy, so the new release is picked up without
restarting PHP-FPM.

> [!NOTE]
> `.user.ini` requires PHP-FPM and `user_ini.filename` enabled (the default). It is first read within
> `user_ini.cache_ttl` (default 5 minutes), then stays in effect.

### Server-wide alternative (recommended when you control the server)

Add the same directive to your PHP-FPM pool or `php.ini`:

```ini
opcache.revalidate_path=1
```

### Other web servers

- **Nginx + PHP-FPM** (no Apache): pass the resolved path instead of the symlink:
  `fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;`
- **Caddy**: enable `resolve_root_symlink` on the `php_fastcgi` directive.
- **Apache (e.g. HestiaCP)**: `opcache.revalidate_path=1` is the equivalent fix; `type: "php"` applies
  it per app.

> [!WARNING]
> Avoid reloading PHP-FPM on every deploy. It drops in-flight requests and is unnecessary once OPcache
> revalidation is configured.

---

## How to Rollback

Re-points the `current` release to the given deploy ID. Also updates the `previous` symlink to point to the version before the rollback target.

```sh
bare rollback [id]
```

### Symlinks

Bare Deploy manages symlinks in your releases directory:

- `current` - Points to the active release
- `previous` - Points to the previous release (one version before current)

After the first deploy (with `webroot`):

- `current` → new release
- `previous` → `{webroot}.bak` (the original directory before Bare took over)
- `{webroot}` → `releases/current`

After subsequent deploys:

- `current` → new release
- `previous` → previous release (what `current` was before)

After each rollback:

- `current` → rolled back release
- `previous` → version before the rolled back release, if any

---

## How to List Releases

Lists all the existing deploy artifacts in the server.

```sh
bare list
```

---

## How to Clean-up Old Releases

Purges historical deploy artifacts from the server while preserving the last `X` number of deploys, defined by `keepReleases` option.

```sh
bare cleanup
```

---

## Why Not Containers?

Containers are powerful, but for many SaaS teams running on VPS, they introduce:

- Registry overhead
- Image lifecycle management
- Orchestration complexity
- Operational abstraction

Bare Deploy keeps the deployment model aligned with the host filesystem and process manager.

---

Bare Deploy is built and supported by [Abtz Labs](https://abtz.co?ref=Bare+Deploy), the same people behind [Abtz Analytics](https://analytics.abtz.co?ref=Bare+Deploy), [KiwiCart](https://kiwicart.xyz?ref=Bare+Deploy), and others. It's opinionated, FREE, and open-source. Distributed under [MIT](./LICENSE) license.

MIT © Abtz Labs
