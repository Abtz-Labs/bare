# Logging Guidelines

## Log Function

Use the custom `log()` function with levels: `info`, `success`, `warn`, `error`

## JSON Mode

Support both colored output and JSON logging via `--json` flag:

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

## Requirements

- Include timestamps in JSON mode
- Support colored console output for normal mode
