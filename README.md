# planetary-computer-mcp

TypeScript MCP server for querying the Microsoft Planetary Computer STAC catalog. Supports spatial/temporal queries and downloading GeoTIFF assets.

## Install

```bash
npm install -g planetary-computer-mcp
# or locally
npx planetary-computer-mcp
bunx planetary-computer-mcp
```

## Usage

### Tools

- **`search_stac`**: Query STAC catalog by collection, bbox, datetime, limit
- **`list_collections`**: List available collections with caching
- **`list_collections_summary`**: Compact JSON summary of collections
- **`describe_collection`**: Summarize collection details and tooling
- **`download_asset`**: Download GeoTIFF/assets with auto URL signing
- **`download_visual`**: Download RGB images with smart rendering (JPG/PNG)
- **`download_multispectral`**: Download specific bands into multi-band GeoTIFF
- **`download_geometries`**: Download vector data (e.g., MS Buildings) with spatial filtering

**Supported Collections:**

- Optical: sentinel-2-l2a, naip, landsat-c2-l2, hls2-l30/s30
- DEM: cop-dem-glo-30, alos-dem
- Land Cover: esa-worldcover, io-lulc-annual-v02, mtbs
- SAR: sentinel-1-rtc
- Vector: ms-buildings

## Development

```bash
bun install          # Install deps
bun run build        # Compile to dist/
bun run watch        # Watch mode
bun run test         # Run tests
bun run lint         # Lint
```

### Local Testing

```bash
bun run build
node dist/src/index.js  # Run server
bunx @modelcontextprotocol/inspector node dist/src/index.js  # Test with inspector
```

## Examples

- **Search Sentinel-2**: `search_stac(collection="sentinel-2-l2a", bbox=[-122.5,47,-122,47.5], datetime="2024-06-01/2024-06-30")`
- **Visual Download**: `download_visual(collection="sentinel-2-l2a", bbox=[-122.4,47.6,-122.3,47.7], datetime="2024-06-01/2024-06-30")`
- **Multispectral**: `download_multispectral(collection="sentinel-2-l2a", assets=["B04","B08"], bbox=..., datetime=...)`
- **Buildings**: `download_geometries(collection="ms-buildings", bbox=[-122.35,47.6,-122.32,47.62])`

## MCP Integration

Add to client config:

```json
{
  "mcpServers": {
    "planetary-computer": {
      "command": "npx",
      "args": ["-y", "planetary-computer-mcp"]
    }
  }
}
```

## Architecture

- **Language**: TypeScript on Node.js ≥18
- **Framework**: MCP SDK with stdio transport
- **API**: Planetary Computer STAC catalog
- **DuckDB**: Spatial queries on parquet
- **Features**: Auto URL signing, streaming downloads, collection caching
