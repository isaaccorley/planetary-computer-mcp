## Contributing / Developer setup

This project uses uv for local development and Python for builds.

1. Simple dev quickstart (recommended)

```bash
# Install deps
uv sync --dev

# Run checks (typecheck, format check, lint, tests)
pre-commit run --all-files

# Start the MCP server
uv run python -m planetary_computer_mcp.server
```

## Commit Message Convention

This project uses [Conventional Commits](https://conventionalcommits.org/) for automated versioning and changelog generation.

### Format

```bash
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

```bash
feat: add Sentinel-2 L2A imagery support
fix: resolve memory leak in Zarr processing
docs: update API documentation
refactor: simplify quadkey generation logic
chore: update dependencies
```

### Breaking Changes

Add `!` after the type for breaking changes:

```bash
feat!: remove deprecated API endpoints
```

### Why?

- Automated semantic versioning
- Auto-generated changelogs
- Consistent commit history
