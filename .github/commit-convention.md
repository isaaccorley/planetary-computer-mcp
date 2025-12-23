# Commit Message Convention

This project uses [Conventional Commits](https://conventionalcommits.org/) for automated version management and changelog generation.

## Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc.)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries
- `ci`: Changes to CI configuration files and scripts
- `build`: Changes that affect the build system or external dependencies
- `revert`: Reverts a previous commit

## Examples

```
feat: add support for Sentinel-2 L2A imagery
fix: resolve memory leak in Zarr processing
docs: update API documentation for collection queries
refactor: simplify quadkey generation logic
perf: optimize GeoTIFF loading performance
test: add unit tests for temporal range validation
chore: update dependencies to latest versions
ci: add conventional commit validation to CI
```

## Breaking Changes

To indicate a breaking change, add `!` after the type/scope or include `BREAKING CHANGE:` in the footer:

```
feat!: remove deprecated API endpoints

BREAKING CHANGE: The old API endpoints have been removed
```

## Scope (Optional)

You can add a scope to provide additional context:

```
feat(api): add new STAC search endpoint
fix(zarr): resolve chunk loading issue
```

## Why Conventional Commits?

- **Automated Versioning**: Versions are automatically determined based on commit types
- **Changelogs**: Release notes are generated automatically
- **Semantic Versioning**: Follows semver principles (MAJOR.MINOR.PATCH)
- **Tool Integration**: Works with semantic-release and other tools