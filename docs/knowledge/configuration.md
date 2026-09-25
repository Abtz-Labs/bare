# Configuration Guidelines

- Use JSON for configuration (`bare.config.json`)
- Keep configuration schema simple and documented
- Validate required fields on load, exit early with clear error messages
- `servers[].type` is `"node"` (default) or `"php"`; `"php"` configures OPcache revalidation. See [php-deployments.md](php-deployments.md)
