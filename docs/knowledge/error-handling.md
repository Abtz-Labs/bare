# Error Handling Guidelines

- Wrap risky operations in try/catch blocks
- Create clean error objects that don't expose sensitive data (commands, stderr)
- Include contextual information (server host, description) in error metadata
- Always call `process.exit(1)` on fatal errors when appropriate

## Pattern

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

## Key Principles

1. Never expose SSH commands, keys, or passwords in error messages
2. Include contextual metadata (server host, operation type)
3. Use `process.exit(1)` for fatal errors
