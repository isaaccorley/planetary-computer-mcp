# AI Agent Guide: planetary-computer-mcp

TypeScript MCP server for querying Microsoft Planetary Computer STAC catalog. Supports spatial/temporal queries for satellite imagery (Sentinel-2, Landsat, NAIP), DEMs, SAR, land cover, and vector data (MS Buildings).

## Big Picture

- **Language/Runtime:** TypeScript on Node.js >= 18
- **Entry point:** `src/index.ts` - MCP server with stdio transport
- **Distribution:** `npx planetary-computer-mcp`
- **Domain:** STAC API to Planetary Computer

## Key Files

- `package.json`: Metadata, deps, bin, build scripts
- `tsconfig.json`: TS config (ES2022, Node16)
- `src/index.ts`: MCP server with tools

## Architecture

- **MCP SDK:** Server, StdioServerTransport
- **DuckDB:** Spatial queries on parquet
- **Tools:**
  - `search_stac`: Query STAC with collection, bbox, datetime, limit
  - `get_collections`: List or detail collections
  - `download_visual`: Smart RGB/JPG/PNG downloads with colormaps
  - `download_multispectral`: Band-specific GeoTIFFs
  - `download_asset`: Low-level COG downloads
  - `download_geometries`: Vector/parquet data (MS Buildings)
  - `download_zarr`: Slice Zarr datasets (Daymet, ERA5)
  - `render_zarr_preview`: Heatmap PNG from Zarr

## Data Handling

- **Optical:** RGB from visual/TCI, stacked bands, or RGBIR extraction
- **DEM:** Terrain colormap (green-brown-white)
- **SAR:** False color from VV/VH polarizations
- **Classified:** Auto colormaps from STAC metadata or predefined
- **Vector:** DuckDB spatial queries on parquet

## Supported Collections

Optical: sentinel-2-l2a, naip, landsat-c2-l2, hls2-l30/s30  
DEM: cop-dem-glo-30, alos-dem  
Land Cover: esa-worldcover, io-lulc-annual-v02, mtbs  
SAR: sentinel-1-rtc  
Vector: ms-buildings
Climate/Weather: daymet-\*, era5-pds

## Developer Workflows

```bash
bun install             # Install deps
bun format && bun check # Format and lint
bun run build           # Compile to dist/
bun run watch           # Watch mode
bun run mcp             # Start MCP server
bunx @modelcontextprotocol/inspector node dist/src/index.js  # Test
```

## Publishing

- **NPM:** Add `NPM_TOKEN` secret; use `Prepare Release` workflow to bump version and publish
- **VS Code Extension:** Add `VSCE_TOKEN` secret; combined workflow publishes both on Release

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

## Examples

- **Search:** `search_stac(collection="sentinel-2-l2a", bbox=[-122.5,47,-122,47.5], datetime="2024-06-01/2024-06-30")`
- **Visual:** `download_visual(collection="sentinel-2-l2a", bbox=[-122.4,47.6,-122.3,47.7], datetime="2024-06-01/2024-06-30")`
- **Multispectral:** `download_multispectral(collection="sentinel-2-l2a", assets=["B04","B08"], bbox=..., datetime=...)`
- **Geometries:** `download_geometries(collection="ms-buildings", bbox=[-122.35,47.6,-122.32,47.62])`

## Conventions

- ISO8601 datetime (UTC)
- Bbox: WGS84 [west,south,east,north]
- Max 100 items/query
- Native resolution downloads (use max_pixels to limit)
