# Project Overview

**Bare Deploy** is an atomic zero-downtime deployment tool for VPS servers over SSH. It requires Node.js >=18 and uses ES modules.

## Project Type

- Simple, dependency-free CLI tool
- Plain JavaScript with no formal build system, linting, or test framework
- Single-file CLI: `bare.js`
- Configuration: `bare.config.json`

## Technology Stack

- JavaScript with ES Modules (`import`/`export`, not CommonJS)
- Target Node.js >=18 compatibility
- Standard library only (no external dependencies)

## Quick Reference

| Item | Value |
|------|-------|
| CLI entry | `node bare.js [command] [options]` |
| Config file | `bare.config.json` |
| Min Node.js | 18+ |
| Module type | ES Modules |
