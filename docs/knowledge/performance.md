# Performance Guidelines

- Use `Promise.all()` for parallel operations when safe
- Clean up temporary files after operations
- Use `|| true` for cleanup commands that may safely fail
