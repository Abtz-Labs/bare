# CLAUDE.md - Agentic Coding Guidelines

This document is the table of contents for Bare Deploy agent guidelines.

## Quick Index

| Topic | File |
|-------|------|
| Project overview, tech stack | [project-overview.md](knowledge/project-overview.md) |
| CLI commands and options | [cli-commands.md](knowledge/cli-commands.md) |
| Code style, naming, formatting | [code-style.md](knowledge/code-style.md) |
| Error handling patterns | [error-handling.md](knowledge/error-handling.md) |
| Logging with JSON support | [logging.md](knowledge/logging.md) |
| Async/await patterns | [async-patterns.md](knowledge/async-patterns.md) |
| Configuration file guidelines | [configuration.md](knowledge/configuration.md) |
| SSH and security guidelines | [ssh-security.md](knowledge/ssh-security.md) |
| Performance guidelines | [performance.md](knowledge/performance.md) |
| Testing guidelines | [testing.md](knowledge/testing.md) |
| Git practices | [git-practices.md](knowledge/git-practices.md) |
| Adding dependencies | [dependencies.md](knowledge/dependencies.md) |
| Documentation guidelines | [documentation.md](knowledge/documentation.md) |

## Summary

**Bare Deploy** is an atomic zero-downtime deployment tool for VPS servers over SSH.

- **CLI**: `node bare.js [command] [options]`
- **Config**: `bare.config.json`
- **Requirements**: Node.js >=18, ES Modules
- **Philosophy**: Simple, dependency-free, minimal

## Key Principles

1. Keep code minimal and readable
2. Use standard library only when possible
3. Never expose sensitive data (SSH keys, passwords) in errors/logs
4. Use async/await for all async operations
5. Prefer `Promise.all()` for parallel operations
6. Test with `--dry-run` before real deployment

## Commands

- `bare init` - Initialize configuration
- `bare deploy` - Run deployment
- `bare list` - List releases
- `bare rollback <id>` - Rollback to release
- `bare cleanup` - Remove old releases

## Options

- `--dry-run` - Simulate execution
- `--json` - JSON logging
- `--sequential` - Deploy server-by-server
- `--patch` (default), `--minor`, `--major` - Version bump type
