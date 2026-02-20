```
  ██████   █████  ██████  ███████
  ██   ██ ██   ██ ██   ██ ██
  ██████  ███████ ██████  █████
  ██   ██ ██   ██ ██   ██ ██
  ██████  ██   ██ ██   ██ ███████
  Deploy tool by Abtz Labs
```

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

---

## Installation

```bash
npm install -g bare-deploy
```

---

## Quick Start

In your project root, run the following command to generate the `bare.json` configuration file.:

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
      "identityFile": "~/.ssh/id_rsa"
    }
  ],
  "deployTo": "/var/www/app",
  "tmpDir": "/tmp",
  "distDir": "./dist",
  "keepReleases": 5,
  "include": [],
  "ignore": [".git/*", "*.log"],
  "preScripts": ["npm run build"],
  "postScripts": ["pm2 start --env production --update-env"],
  "healthCheck": {
    "url": "http://localhost:3000/health",
    "timeout": 15
  }
}
```

---

## Configuration Options

### `distDir`
The directory to package for deployment (default: `"."`).

### `include`
Array of file patterns to include in the deployment package. When specified, only matching files are packaged. Supports glob patterns.

**Example**: Include only specific file-types
```json
{
  "include": ["*.js", "*.json", "views/*", "public/*"]
}
```

> [!NOTE]
> When using `include`, remember to add `".*"` if you need hidden files (like `.env.production`).

### `ignore`
Array of file patterns to exclude from the deployment package (default: `[".git/*"]`). Applied after `include` patterns, allowing fine-grained control.

**Example**: Exclude test files and logs
```json
{
  "ignore": [".git/*", "*.log", "test/*", "*.test.js"]
}
```

> [!CAUTION]
> By default, `.env` files are **not** excluded. If your `distDir` contains development secrets (e.g., `.env.local`), add `.env*` or `.env.local` to the ignore-list. For production deployments from a build directory (e.g., `./dist`), ensure only production-ready `.env` files are present.

### Combined Usage
You can use both `include` and `ignore` together for precise control:

```json
{
  "include": ["*.js", "*.json", "config/*"],
  "ignore": ["*.test.js", "config/local.json"]
}
```

This includes all `.js` and `.json` files plus the `config/` directory, but excludes test files and local config.

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
