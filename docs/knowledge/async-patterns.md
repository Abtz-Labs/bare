# Async/Await Patterns

- Use async/await for all asynchronous operations
- Wrap async entry points in IIFE with error handling

## Pattern

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
