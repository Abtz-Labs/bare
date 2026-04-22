# SSH and Security Guidelines

- Key-based SSH only (no password fallback)
- Always use `-o BatchMode=yes` to prevent password prompts
- Use `StrictHostKeyChecking=accept-new` for new hosts
- Never log or expose SSH commands, keys, or passwords in errors

## Security Checklist

- [ ] Key-based authentication only
- [ ] BatchMode=yes on all SSH commands
- [ ] StrictHostKeyChecking=accept-new for new hosts
- [ ] No sensitive data in error messages or logs
