# AGENTS.md - Agentic Coding Guidelines

This document provides guidelines for agents operating in this repository.

## Project Overview

**Bare Deploy** is an atomic zero-downtime deployment tool for VPS servers over SSH. It requires Node.js >=18 and uses ES modules.

## Build, Lint, and Test Commands

This project is plain JavaScript with no formal build system, linting, or test framework.

### Running the CLI

```bash
# Global installation (after npm link or npm install -g)
bare [command] [options]

# Direct execution
node bare.js [command] [options]
# Or
./bare.js [command] [options]
```

### Available Commands

- `bare init` - Initialize configuration
- `bare deploy` - Run deployment
- `bare list` - List releases
- `bare rollback <id>` - Rollback to release
- `bare cleanup` - Remove old releases

### Deployment Options

- `--dry-run` - Simulate execution
- `--json` - JSON logging
- `--sequential` - Deploy server-by-server
- `--patch` (default), `--minor`, `--major` - Version bump type

### Testing

**No test framework is currently configured.** To add tests:

```bash
# Install a test framework (example with vitest)
npm install -D vitest

# Run all tests
npx vitest

# Run a single test file
npx vitest run src/some.test.js

# Run tests in watch mode
npx vitest
```

## Code Style Guidelines

### General Philosophy

This is a simple, dependency-free CLI tool. Keep code minimal and readable. Avoid over-engineering or adding unnecessary dependencies.

### JavaScript Version

- Use ES Modules (`import`/`export`, not CommonJS)
- Target Node.js >=18 compatibility
- Use modern JavaScript features (async/await, template literals, destructuring)

### File Organization

- Single-file CLI: `bare.js`
- Configuration: `bare.config.json`
- Keep functions grouped by concern with clear section comments:

```javascript
// ------------------------------
// LOGGER
// ------------------------------
```

### Naming Conventions

- **Functions**: camelCase, verb-prefixed (e.g., `loadConfig`, `runSSH`)
- **Constants**: camelCase for runtime constants (e.g., `colors`)
- **Variables**: camelCase (e.g., `releaseId`, `archive`)
- **Config objects**: camelCase keys matching JSON config schema
- **Private functions**: Prefix with underscore `_helperFunction()` if needed

### Imports

Standard library only (no external dependencies):

```javascript
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
```

### Formatting

- 2-space indentation
- No semicolons (optional in modern JS, match existing style)
- Use template literals for string interpolation
- Trailing commas in multiline objects/arrays
- Max line length ~100 characters

### Error Handling

- Wrap risky operations in try/catch blocks
- Create clean error objects that don't expose sensitive data (commands, stderr)
- Include contextual information (server host, description) in error metadata
- Always call `process.exit(1)` on fatal errors when appropriate

```javascript
try {
  execSync(cmd, { stdio: "pipe" });
} catch (err) {
  // Create clean error without exposing command or stderr
  const cleanError = new Error(`SSH command failed on ${server.host}`);
  cleanError.host = server.host;
  throw cleanError;
}
```

### Logging

- Use the custom `log()` function with levels: `info`, `success`, `warn`, `error`
- Support both colored output and JSON logging via `--json` flag
- Include timestamps in JSON mode:

```javascript
function log(level, message, meta = {}) {
  if (options.json) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta,
      }),
    );
    return;
  }
  // Colored console output...
}
```

### Async/Await Patterns

- Use async/await for all asynchronous operations
- Wrap async entry points in IIFE with error handling:

```javascript
(async () => {
  try {
    switch (command) {
      case "deploy":
        await deploy();
        break;
      // ...
    }
  } catch (err) {
    log("error", err.message);
    process.exit(1);
  }
})();
```

### Configuration Files

- Use JSON for configuration (`bare.config.json`)
- Keep configuration schema simple and documented
- Validate required fields on load, exit early with clear error messages

### SSH and Security

- Key-based SSH only (no password fallback)
- Always use `-o BatchMode=yes` to prevent password prompts
- Use `StrictHostKeyChecking=accept-new` for new hosts
- Never log or expose SSH commands, keys, or passwords in errors

### Performance Considerations

- Use `Promise.all()` for parallel operations when safe
- Clean up temporary files after operations
- Use `|| true` for cleanup commands that may safely fail

### Git Practices

- Commit messages should be concise and descriptive
- No need for pre-commit hooks (no tests to run)
- Development happens on feature branches, PRs to main

### Adding Dependencies

Before adding any npm dependency:

1. Confirm it's truly necessary
2. Prefer stdlib solutions when possible
3. Keep the tool dependency-free for portability
4. If adding a dependency, update package.json with proper metadata

### Documentation

- JSDoc comments for CLI tools are helpful but not required
- Use block comments to delineate major sections
- Keep README.md updated with new features, and AGENTS.md updated when referred file names or conventions are updated

### When Modifying This Project

- Test locally with `node bare.js --dry-run` before any real deployment
- Ensure JSON output mode works correctly (`--json` flag)
- Test both parallel and sequential deployment modes
- Verify rollback functionality
- Check error messages are user-friendly and secure
- Test webroot functionality (if modified) with Let's Encrypt `.well-known` preservation
- Update tests when needed. Prefer TDD.
