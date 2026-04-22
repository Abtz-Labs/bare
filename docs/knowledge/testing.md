# Testing Guidelines

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

## When Modifying This Project

- Test locally with `node bare.js --dry-run` before any real deployment
- Ensure JSON output mode works correctly (`--json` flag)
- Test both parallel and sequential deployment modes
- Verify rollback functionality
- Check error messages are user-friendly and secure
- Test webroot functionality (if modified) with Let's Encrypt `.well-known` preservation
- Update tests when needed. Prefer TDD.
