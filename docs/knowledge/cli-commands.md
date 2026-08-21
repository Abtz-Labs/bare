# CLI Commands

## Running the CLI

```bash
# Global installation (after npm link or npm install -g)
bare [command] [options]

# Direct execution
node bare.js [command] [options]
# Or
./bare.js [command] [options]
```

## Available Commands

| Command | Description |
|---------|-------------|
| `bare init` | Initialize configuration |
| `bare deploy` | Run deployment |
| `bare list` | List releases |
| `bare rollback <id>` | Rollback to release |
| `bare cleanup` | Remove old releases |

## Deployment Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Simulate execution |
| `--json` | JSON logging |
| `--sequential` | Deploy server-by-server |
| `--no-bump` | Skip version bump |
| `--patch` (default) | Version bump type |
| `--minor` | Version bump type |
| `--major` | Version bump type |
