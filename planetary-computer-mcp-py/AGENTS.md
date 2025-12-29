# Planetary Computer MCP - Python Refactor

## Overview

This is the Python refactor of the Planetary Computer MCP server. It provides unified access to satellite and geospatial data from Microsoft's Planetary Computer using natural language queries.

## Key Improvements over JS Version

- **60-70% code reduction**: From ~2700 lines to ~500 lines
- **Unified tooling**: Single `download_data` tool vs multiple confusing tools
- **Natural language**: Auto-detect datasets from queries like "sentinel-2 imagery"
- **Geocoding**: Support place names like "San Francisco" → bbox
- **Dual output**: Raw GeoTIFF + JPEG visualization for LLM analysis

## Architecture

- **STAC Client**: pystac-client + planetary-computer SDK for signed URLs
- **Raster Pipeline**: odc-stac for COG loading, xarray/rioxarray for processing
- **Vector Pipeline**: DuckDB for GeoParquet spatial queries
- **Visualization**: matplotlib for RGB/colormap generation
- **Geocoding**: geopy for place name → bbox conversion

## Tools

### download_data

Unified tool for raster/DEM/LULC/Zarr data.

**Parameters:**

- `query`: Natural language dataset description
- `aoi`: Bounding box [W,S,E,N] or place name string
- `time_range`: ISO8601 datetime range (optional)
- `output_dir`: Output directory (default: ".")

**Returns:**

- `raw`: Path to GeoTIFF for analysis
- `visualization`: Path to JPEG/PNG for viewing
- `collection`: Detected collection ID
- `metadata`: Item metadata dict

### download_geometries

Tool for vector/GeoParquet data.

**Parameters:**

- `collection`: Collection ID (e.g., "ms-buildings")
- `aoi`: Bounding box or place name
- `output_dir`: Output directory

**Returns:**

- `raw`: Path to Parquet file
- `visualization`: Path to PNG rendering
- `count`: Number of features

## Supported Datasets

See `collections.md` for comprehensive table. Priority datasets:

- **Optical**: Sentinel-2 L2A, NAIP, Landsat C2 L2
- **DEM**: Copernicus GLO-30, ALOS DEM
- **Land Cover**: ESA WorldCover, IO LULC
- **Vectors**: MS Buildings
- **SAR**: Sentinel-1 RTC
- **Climate**: Daymet, ERA5 (Zarr)

## Development

- **Package Manager**: uv (faster than pip)
- **Linting**: ruff (replaces ESLint/Prettier)
- **Testing**: pytest with coverage

```bash
# Install
uv sync

# Run tests
uv run pytest tests/ -v

# Lint
uv run ruff check .

# Run server
uv run python -m src.server
```

## Deployment

The MCP server can be integrated with any MCP-compatible client (Claude Desktop, VS Code, etc.).

## Migration from JS Version

- Tool names changed: `download_raster` → `download_data`
- Unified interface eliminates need for separate raster/vector/zarr tools
- Natural language AOI support added
- Always outputs both raw data + visualization

Example:

```python
# JS version
download_raster(collection="sentinel-2-l2a", bbox=[-122,37,-121,38])

# Python version
download_data(query="sentinel-2 imagery", aoi="San Francisco")
```
