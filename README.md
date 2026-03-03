```
  ██████   █████  ██████  ███████
  ██   ██ ██   ██ ██   ██ ██
  ██████  ███████ ██████  █████
  ██   ██ ██   ██ ██   ██ ██
  ██████  ██   ██ ██   ██ ███████
  Deploy tool by Abtz Labs
```

[![npm version](https://img.shields.io/npm/v/bare-deploy.svg)](https://www.npmjs.com/package/bare-deploy)
[![npm downloads](https://img.shields.io/npm/dt/bare-deploy.svg)](https://www.npmjs.com/package/bare-deploy)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Atomic zero-downtime deployments to **bare VPS servers** over SSH.

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
  "servers": [
    {
      "host": "your-server.com",
      "user": "deploy",
      "port": 22,
      "identityFile": "~/.ssh/id_rsa",
      "distDir": "./dist",
      "deployTo": "/var/www/app",
      "webroot": "",
      "include": [],
      "ignore": [".git/*"],
      "preScripts": [],
      "postScripts": [],
      "startScript": "pm2 restart --env production --update-env"
    }
  ],
  "keepReleases": 5,
  "include": [],
  "ignore": [".git/*"],
  "healthCheck": {
    "url": "http://localhost:3000/health",
    "timeout": 15
  }
}
```

> [!NOTE]
> Server-specific options (`distDir`, `deployTo`, `webroot`, `include`, `ignore`, `preScripts`, `postScripts`, `startScript`) allow deploying different parts of your project to different servers.

> [!NOTE]
> When running `bare init`:
> - If `package.json` doesn't exist, it's created with version `0.1.0`
> - If `.gitignore` doesn't exist, it's created with `bare.config.json`
> - If `.gitignore` exists but doesn't contain `bare.config.json`, the entry is added automatically

---

## Configuration Options

### Server-Specific Options

Each server in the `servers` array can have its own configuration:

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
      "preScripts": [],
      "postScripts": [],
      "startScript": "pm2 restart --env production --update-env"
    },

    // ...
  ]
}
```

#### `servers[].distDir`

The directory where the content to package for deployment lives on (default: `"./dist"`).

#### `servers[].deployTo`

The base path **on the server** where deployments are stored. Bare Deploy creates a `releases/` subfolder with timestamped versions.

#### `servers[].webroot`

Optional. Path to the web server's document root. When set:

- On first deploy: backs up existing `webroot` to `{webroot}.bak`, then creates a symlink
- Automatically copies `.well-known/` (Let's Encrypt) from previous deployment
- Creates symlink: `webroot` → `releases/current`

#### `servers[].preScripts`

Optional. Array of commands to **run locally** before building the deployment package.

#### `servers[].postScripts`

Optional. Array of commands to **run on the server** after deployment but before switching the symlink.

#### `servers[].startScript`

Optional. Command to run after symlink switch. Useful for process managers like PM2.

#### `servers[].include`

Optional. Array of file patterns to include in the deployment package for this server. When specified, only matching files are packaged. Supports glob patterns. Falls back to global `include` if not set.

**Example**:
```json
{
  "include": ["*.js", "*.json", "views/*", "public/*"]
}
```

> [!NOTE]
> When using `include`, remember to add `".*"` if you need hidden files (like `.env.production`).

#### `servers[].ignore`

Optional. Array of file patterns to exclude from the deployment package for this server (default: `[".git/*"]`). Applied after `include` patterns. Falls back to global `ignore` if not set.

**Example**:
```json
{
  "ignore": [".git/*", "*.log", "test/*", "*.test.js"]
}
```

### Global Options

#### `include`

Optional. Global array of file patterns to include in the deployment package. Used as fallback when not defined per-server.

#### `ignore`

Optional. Global array of file patterns to exclude from the deployment package (default: `[".git/*"]`). Used as fallback when not defined per-server.

#### `keepReleases`

Optional. Number of releases to keep on the server as history (default: `5`).

#### `healthCheck`

Optional. When set, runs at the very end, after running all the deploy steps to make sure your deploy was successful. If health check fails, the deploy is automatically rolled back to its previous version.

Health check configuration:

- `url`: URL to check after deployment
- `timeout`: Seconds to wait (default: `15`)

---

## How to Deploy

```sh
bare deploy [options]
```

### Options:

```
  --dry-run         Simulate execution
  --json            JSON logging
  --sequential      Deploy server-by-server
  --patch           Bump patch version (default)
  --minor           Bump minor version
  --major           Bump major version
```

### How It Works

- Bumps `package.json` version.
- Runs local pre-deploy scripts.
- Creates build artifact.
- Acquires lock.
- SCPs package to server.
- Extracts into timestamped release directory.
- Executes post-deploy scripts.
- Atomically switches current symlink.
- Optionally validates health endpoint.
- Releases lock.
- Rollback, when needed. Simply re-points the symlink.

---

## How to Rollback

Re-points the `current` release to the given deploy ID.

```sh
bare rollback [id]
```

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

Bare Deploy is built and supported by [Abtz Labs](https://abtz.co?ref=Bare+Deploy), the same people behind [Abtz Analytics](https://analytics.abtz.co?ref=Bare+Deploy), [KiwiCart](https://kiwicart.xyz?ref=Bare+Deploy), and others. It's opinionated, FREE, and open-source --distributed under [MIT](./LICENSE) license.

MIT © Abtz Labs
