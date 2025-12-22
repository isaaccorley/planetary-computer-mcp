## Contributing / Developer setup

This project uses Bun for local development and TypeScript for builds. The instructions below assume you have Bun installed (recommended) or Node/npm.

1. Simple dev quickstart (recommended)

```bash
# Install deps (Bun)
bun install

# Run checks (typecheck, format check, lint, tests)
bun check
```

2. Extra commands

```bash
# Start the MCP server
bun run mcp

# Typecheck only
bunx tsc --noEmit

# Run tests directly
bun test

# Lint / format
bunx eslint . --ext .ts,.tsx
bunx prettier --write .
```

Notes

- The `check` script runs TypeScript typecheck, Prettier check (no changes), ESLint, and `bun test`.
- If you prefer npm, the equivalent commands are available but Bun is the recommended developer experience.
