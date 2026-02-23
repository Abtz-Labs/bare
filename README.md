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

Just disciplined releases.

---

## Philosophy

Bare is built for developers who:

- Deploy Node.js apps directly to VPS instances
- Want atomic releases with instant rollback
- Prefer SSH over platform abstraction
- Value operational clarity over orchestration complexity

Inspired by the simplicity of [Kamal](https://kamal-deploy.org/), but designed for host-native deployments.

---

## Features

- Atomic symlink-based releases
- Zero-downtime cutovers
- Parallel multi-server deploy
- Per-server configuration (different distDirs for different servers)
- SSH key authentication (no password prompts)
- Configurable pre & post hooks
- Automatic version bump
- Health check validation
- Lock file to prevent concurrent deploys
- Dry-run mode
- Structured colored logs
- Optional JSON logging
- Rollback support
- Release pruning
- Webroot support for static sites with Let's Encrypt preservation

---

## Installation

```bash
npm install -g bare-deploy
```

---

## Quick Start

In your project root, run the following command to generate the `bare.config.json` configuration file.:

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
    }
  ]
}
```

#### `servers[].distDir`

The directory to package for deployment (default: `"."`).

#### `servers[].deployTo`

The base path on the server where deployments are stored. Creates a `releases/` subfolder with timestamped versions.

#### `servers[].webroot` (per server, optional)

Path to the web server's document root. When set:

- On first deploy: backs up existing `webroot` to `{webroot}.bak`, then creates symlink
- Automatically copies `.well-known/` (Let's Encrypt) from previous deployment
- Creates symlink: `webroot` → `releases/current`

#### `servers[].preScripts`

Array of commands to run locally before building the deployment package.

#### `servers[].postScripts`

Array of commands to run on the server after deployment but before switching the symlink.

#### `servers[].startScript`

Command to run after symlink switch. Useful for process managers like PM2.

#### `servers[].include`

Array of file patterns to include in the deployment package for this server. When specified, only matching files are packaged. Supports glob patterns. Falls back to global `include` if not set.

**Example**:
```json
{
  "include": ["*.js", "*.json", "views/*", "public/*"]
}
```

> [!NOTE]
> When using `include`, remember to add `".*"` if you need hidden files (like `.env.production`).

#### `servers[].ignore`

Array of file patterns to exclude from the deployment package for this server (default: `[".git/*"]`). Applied after `include` patterns. Falls back to global `ignore` if not set.

**Example**:
```json
{
  "ignore": [".git/*", "*.log", "test/*", "*.test.js"]
}
```

### Global Options

#### `include`

Global array of file patterns to include in the deployment package. Used as fallback when not defined per-server.

#### `ignore`

Global array of file patterns to exclude from the deployment package (default: `[".git/*"]`). Used as fallback when not defined per-server.

#### `keepReleases`

#### `keepReleases`

Number of releases to keep on the server (default: `5`).

#### `healthCheck`

Health check configuration:

- `url`: URL to check after deployment
- `timeout`: Seconds to wait (default: `15`)

---

## How to Deploy

```sh
bare deploy [--patch | --minor | --major] [--json] [--dry-run]
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

- Runs local pre-deploy scripts
- Bumps package.json version
- Creates build artifact
- SCPs package to server
- Extracts into timestamped release directory
- Executes post-deploy scripts
- Atomically switches current symlink
- Optionally validates health endpoint
- Releases lock
- Rollback simply repoints the symlink.

---

## How to Rollback

```sh
bare rollback [id]
```

---

## How to List Releases

```sh
bare list
```

---

## How to Clean-up Old Releases

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

Bare keeps the deployment model aligned with the host filesystem and process manager.

---

Bare Deploy is built and supported by [Abtz Labs](https://abtz.co?ref=Bare+Deploy), the same people behind [Abtz Analytics](https://analytics.abtz.co?ref=Bare+Deploy), [KiwiCart](https://kiwicart.xyz?ref=Bare+Deploy), and others. It's opinionated, FREE, and open-source --distributed under [MIT](./LICENSE) license.

MIT © Abtz Labs
