# AGENTS.md

Agentic coding guide for `planetary-computer-mcp` - a Python MCP server for Microsoft Planetary Computer STAC catalog.

## Quick Reference

```bash
# Install dependencies
uv sync

# Run all tests
uv run pytest

# Run single test
uv run pytest tests/test_download_data.py::test_download_sentinel2_data -v

# Run tests excluding integration (network-dependent)
uv run pytest -m "not integration"

# Lint + format
uv run ruff check . --fix
uv run ruff format .

# Type check
uv run ty check

# Full validation (pre-commit)
pre-commit run --all-files

# Run MCP server
uv run python -m planetary_computer_mcp.server
```

## Project Structure

```
src/planetary_computer_mcp/
├── core/                    # Core utilities
│   ├── __init__.py         # Public API exports
│   ├── collections.py      # Collection keyword mapping
│   ├── geocoding.py        # Place name → bbox
│   ├── raster_utils.py     # odc-stac/rioxarray loading
│   ├── stac_client.py      # STAC search wrapper
│   ├── vector_utils.py     # GeoParquet/DuckDB queries
│   ├── visualization.py    # RGB/colormap generation
│   └── zarr_utils.py       # Climate data (placeholder)
├── tools/                   # MCP tool implementations
│   ├── download_data.py    # Raster download + NATIVE_RESOLUTIONS
│   └── download_geometries.py  # Vector download (MS Buildings)
└── server.py               # FastMCP server entry point
tests/
└── test_download_data.py   # Integration tests (marked @pytest.mark.integration)
```

## Code Style

### Imports

- Standard library → third-party → local (enforced by ruff isort)
- Use absolute imports for cross-module: `from planetary_computer_mcp.core import ...`
- Use relative imports within same package: `from ..core import ...`
- Group imports in `__init__.py` with explicit `__all__`

### Formatting

- **Line length**: 100 chars
- **Target Python**: 3.13 (supports 3.10-3.13)
- **Formatter**: ruff format (black-compatible)
- **Quotes**: Double quotes for strings

### Type Hints

- Required on all public functions (ANN rules enabled)
- Use `list[T]` not `List[T]` (modern syntax)
- Use `T | None` not `Optional[T]`
- Use `dict[K, V]` not `Dict[K, V]`
- Return type annotations required

```python
def download_data(
    query: str,
    aoi: list[float] | str | None = None,
    time_range: str | None = None,
) -> dict[str, Any]:
```

### Docstrings

- NumPy style (validated by numpydoc hook)
- Required sections: summary, Args, Returns
- One-line summary, blank line, then details

```python
def load_raster_from_stac(
    items: list[Item],
    bbox: list[float],
    bands: list[str] | None = None,
    resolution: float = 0.0001,
) -> xr.Dataset:
    """
    Load raster data from STAC items using odc-stac.

    Args:
        items: Signed STAC items from search
        bbox: Bounding box [west, south, east, north]
        bands: Band names to load (None = all)
        resolution: Output resolution in degrees

    Returns:
        xarray Dataset with requested bands
    """
```

### Naming

- **Functions/variables**: `snake_case`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Private**: `_leading_underscore`

### Error Handling

- Raise `ValueError` for invalid input
- Raise `TypeError` for wrong types
- Use descriptive error messages with context
- Catch specific exceptions, not bare `except:`

```python
if not items:
    raise ValueError(f"No data found for {collection} in the specified area/time")
```

## Key Patterns

### Adding New Collections

1. Add to `COLLECTION_KEYWORDS` in `core/collections.py`
1. Add to `COLLECTION_TYPES` if not raster
1. Add native resolution to `NATIVE_RESOLUTIONS` in `tools/download_data.py`
1. Add RGB bands to `get_rgb_bands_for_collection()` if optical

### STAC Search Pattern

```python
from planetary_computer_mcp.core import stac_client

items = stac_client.search_items(
    collections=["sentinel-2-l2a"],
    bbox=bbox,
    datetime=time_range,
    max_cloud_cover=20,
    limit=5,
)
# Items are already signed with pc.sign()
```

### Vector Data Pattern (MS Buildings)

- Uses quadkey partitioning (Bing Maps tile system)
- Requires `storage_options` from signed STAC asset
- Read with geopandas + fsspec/adlfs

### Testing

- All tests are integration tests (require network)
- Mark with `@pytest.mark.integration`
- Use `tempfile.mkdtemp()` for output dirs
- Save visualizations to `samples/` for manual review

```python
@pytest.mark.integration
def test_download_sentinel2_data():
    from planetary_computer_mcp.tools.download_data import download_data
    result = download_data(
        query="sentinel-2 imagery",
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2024-07-01/2024-07-31",
        output_dir=tempfile.mkdtemp(),
    )
    assert Path(result["raw"]).exists()
```

## Dependencies

- **Runtime**: mcp, planetary-computer, pystac-client, odc-stac, xarray, rioxarray, geopandas, duckdb, matplotlib, contextily, adlfs, pyarrow
- **Dev**: ruff, ty, pytest, pytest-cov, pre-commit

## Ruff Rules (Key)

- `ANN`: Type annotations required
- `I`: Import sorting (isort)
- `UP`: Python upgrade syntax
- `B`: Bugbear checks
- `SIM`: Simplify code
- `RUF`: Ruff-specific rules

Ignored: `TRY003` (long exception messages OK), `RET505/506` (explicit returns OK)

## Pre-commit Hooks

1. ruff (lint + format)
1. check-yaml, check-json
1. numpydoc-validation
1. pyproject-fmt
1. nbstripout
1. mdformat
1. typos
1. ty-check (type checking)
1. uv-lock
