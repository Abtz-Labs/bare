# Code Style Guidelines

## General Philosophy

This is a simple, dependency-free CLI tool. Keep code minimal and readable. Avoid over-engineering or adding unnecessary dependencies.

## JavaScript Version

- Use ES Modules (`import`/`export`, not CommonJS)
- Target Node.js >=18 compatibility
- Use modern JavaScript features (async/await, template literals, destructuring)

## File Organization

- Single-file CLI: `bare.js`
- Configuration: `bare.config.json`
- Keep functions grouped by concern with clear section comments:

```javascript
// ------------------------------
// LOGGER
// ------------------------------
```

## Naming Conventions

- **Functions**: camelCase, verb-prefixed (e.g., `loadConfig`, `runSSH`)
- **Constants**: camelCase for runtime constants (e.g., `colors`)
- **Variables**: camelCase (e.g., `releaseId`, `archive`)
- **Config objects**: camelCase keys matching JSON config schema
- **Private functions**: Prefix with underscore `_helperFunction()` if needed

## Imports

Standard library only (no external dependencies):

```javascript
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
```

## Formatting

- 2-space indentation
- No semicolons (optional in modern JS, match existing style)
- Use template literals for string interpolation
- Trailing commas in multiline objects/arrays
- Max line length ~100 characters
