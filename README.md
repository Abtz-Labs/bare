# BARE

Atomic zero-downtime deployments to **bare VPS servers** over SSH.

No containers.
No agents.
No orchestration layers.

Just disciplined releases.

---

## Philosophy

Bare is built for developers who:

- Deploy directly to VPS instances
- Use Node.js or PHP applications
- Want atomic releases with instant rollback
- Prefer SSH over platform abstraction
- Value operational clarity over orchestration complexity

Inspired by the simplicity of Kamal, but designed for host-native deployments.

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
npm install -g @abtz/bare
```

---

## Quick Start

In your project root:

```sh
bare init
```

This generates a `bare.json` configuration file.
Example:

```json
{
  "servers": [
    {
      "host": "123.45.67.89",
      "user": "deploy",
      "port": 22,
      "deployPath": "/var/www/myapp",
      "tmpPath": "/tmp"
    }
  ],
  "pre": ["npm test", "npm run lint", "npm run build"],
  "post": ["npm install --production", "pm2 reload ecosystem.config.js"],
  "healthCheck": {
    "url": "https://myapp.com/health",
    "timeout": 10000
  }
}
```

---

## Deploy

```sh
bare deploy [--patch | --minor | --major] [--json] [--dry-run]
```

### Options:

```
--dry-run
--json
--patch
--minor
--major
```

---

## Rollback

```sh
bare rollback [id]
```

---

## List Releases

```sh
bare releases
```

---

## Clean-up Old Releases

```sh
bare cleanup
```

---

## How It Works

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

## Why Not Containers?

Containers are powerful, but for many SaaS teams running on VPS, they introduce:

- Registry overhead
- Image lifecycle management
- Orchestration complexity
- Operational abstraction

Bare keeps the deployment model aligned with the host filesystem and process manager.

---

## License

MIT © Abtz Labs
