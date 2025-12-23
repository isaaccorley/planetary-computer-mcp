## Contributing / Developer setup

This project uses Bun for local development and TypeScript for builds. The instructions below assume you have Bun installed (recommended) or Node/npm.

1. Simple dev quickstart (recommended)

```bash
# Install deps (Bun)
bun install

# Run checks (typecheck, format check, lint, tests)
bun check

# Start the MCP server
bun run mcp

```

## Commit Message Convention

This project uses [Conventional Commits](https://conventionalcommits.org/) for automated versioning and changelog generation.

### Format

```
<type>[optional scope]: <description>
```

### Types

- `feat`: New features (minor version bump)
- `fix`: Bug fixes (patch version bump)
- `docs`: Documentation changes
- `style`: Code style/formatting changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Testing changes
- `chore`: Maintenance tasks
- `ci`: CI/CD changes
- `build`: Build system changes
- `revert`: Reverting changes

### Examples

```
feat: add Sentinel-2 L2A imagery support
fix: resolve memory leak in Zarr processing
docs: update API documentation
refactor: simplify quadkey generation logic
chore: update dependencies
```

### Breaking Changes

Add `!` after the type for breaking changes:

```
feat!: remove deprecated API endpoints
```

### Why?

- Automated semantic versioning
- Auto-generated changelogs
- Consistent commit history
