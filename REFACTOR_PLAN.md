# Planetary Computer MCP Server - Refactor Plan

This document outlines the issues identified in `bugs.md` and provides a detailed plan with acceptance criteria for each fix.

---

## Issue 1: Remove Limits from `download_geometries` Tool

### Problem

The `download_geometries` tool currently has two problematic limitations:

1. A `limit` parameter (default: 1000) that caps the number of geometries returned
2. A hardcoded limit of 20 parquet files being read (`parquetUrls.slice(0, 20)`)

When users request geometries for an AOI, they expect to receive **all** data within that area, not an arbitrary subset.

### Current Behavior

- Located in [src/index.ts](src/index.ts#L427-L488) - `queryParquetGeometries` function
- `limit` parameter defaults to 1000 geometries
- `urlList` is sliced to first 20 parquet files (line ~487)

### Changes Required

- [x] **1.1** Remove the `limit` parameter from `queryParquetGeometries` function signature
- [x] **1.2** Remove `LIMIT ${limit}` from the SQL queries in `queryParquetGeometries`
- [x] **1.3** Remove the `.slice(0, 20)` when building `urlList`
- [x] **1.4** Update the `DOWNLOAD_GEOMETRIES_TOOL` schema to remove the `limit` property
- [x] **1.5** Update the tool handler to not pass `limit` parameter
- [x] **1.6** Update documentation in README.md and copilot-instructions.md if they mention limits
- [x] **1.7** Update test file `test/test-ms-buildings.ts` if it tests limit behavior

### Acceptance Criteria

- [ ] `download_geometries` returns ALL geometries intersecting the bbox
- [ ] All parquet files covering the bbox are queried (no 20-file limit)
- [ ] Tool schema no longer includes `limit` property
- [ ] Tests pass with the new unlimited behavior
- [ ] Large AOIs still work (may be slow, but complete)

---

## Issue 2: Merge Download Tools into Unified `download_raster`

### Problem

Three separate tools cause LLM confusion:

- `download_visual` - RGB visualization images (JPG/PNG)
- `download_multispectral` - Raw GeoTIFF bands for analysis
- `download_asset` - Low-level single asset download

Users shouldn't have to choose between them. The LLM struggles to pick the right one.

### Proposed Solution

Create a single `download_raster` tool that:

1. Downloads the requested multispectral bands as GeoTIFF (primary output)
2. Automatically generates an RGB preview image using existing visualization logic (secondary output)
3. Deprecate/remove `download_visual`, `download_multispectral`, and `download_asset`

### Current Tool Locations

- `DOWNLOAD_VISUAL_TOOL` - [src/index.ts#L2360-L2414](src/index.ts#L2360-L2414)
- `DOWNLOAD_MULTISPECTRAL_TOOL` - [src/index.ts#L2415-L2467](src/index.ts#L2415-L2467)
- `DOWNLOAD_ASSET_TOOL` - [src/index.ts#L2318-L2359](src/index.ts#L2318-L2359)

### Changes Required

- [x] **2.1** Rename `DOWNLOAD_MULTISPECTRAL_TOOL` to `DOWNLOAD_RASTER_TOOL`
- [x] **2.2** Update the tool name from `download_multispectral` to `download_raster`
- [x] **2.3** Merge `download_visual` functionality into `download_raster` handler:
  - Add optional `generate_preview` parameter (default: true)
  - After downloading GeoTIFF, auto-generate RGB preview (JPG/PNG)
  - Use existing visualization strategies (RGB mapping, colormaps, etc.)
- [x] **2.4** Update tool description to clearly explain it handles all raster downloads
- [x] **2.5** Add smart asset inference when `assets` not provided:
  - Optical collections → auto-select RGB bands
  - DEM → auto-select `data` asset
  - SAR → auto-select `vv`, `vh` polarizations
  - Classified → auto-select classification asset
- [x] **2.6** Remove `DOWNLOAD_VISUAL_TOOL` and `DOWNLOAD_MULTISPECTRAL_TOOL` definitions
- [x] **2.7** Remove `download_visual` and `download_multispectral` handlers
- [x] **2.8** Remove `download_asset` entirely
- [x] **2.9** Update tool registration in `ListToolsRequestSchema` handler
- [x] **2.10** Update all documentation (README.md, copilot-instructions.md, vscode-extension/README.md)
- [x] **2.11** Update test files that reference old tool names
- [x] **2.12** Update `collection-utils.ts` helper messages that reference old tool names

### New `download_raster` Tool Schema

```typescript
{
  name: "download_raster",
  description: "Download satellite/raster data from Planetary Computer collections. Downloads requested bands as GeoTIFF and auto-generates an RGB preview image.\n\nSupported collections:\n- Optical: sentinel-2-l2a, naip, landsat-c2-l2, hls2-l30/s30\n- DEM: cop-dem-glo-30, alos-dem\n- SAR: sentinel-1-rtc\n- Land Cover: esa-worldcover, io-lulc-annual-v02, mtbs\n\nFor vector data (buildings), use download_geometries instead.\nFor Zarr data (climate/weather), use download_zarr instead.",
  inputSchema: {
    type: "object",
    properties: {
      collection: { type: "string", description: "STAC collection ID" },
      bbox: { type: "array", description: "Geographic bounding box [west,south,east,north]" },
      datetime: { type: "string", description: "ISO8601 time range" },
      assets: {
        type: "array",
        description: "Asset names to download. Optional - will auto-select appropriate bands if omitted.",
        items: { type: "string" }
      },
      max_cloud_cover: { type: "number", default: 20 },
      max_pixels: { type: "number", description: "Limit output size" },
      generate_preview: { type: "boolean", default: true, description: "Generate RGB preview image" },
      save_colormap: { type: "boolean", default: false, description: "Save legend for classified data" },
      output_filename: { type: "string" },
      output_directory: { type: "string" }
    },
    required: ["collection", "bbox", "datetime"]
  }
}
```

### Acceptance Criteria

- [x] Single `download_raster` tool handles all raster download use cases
- [x] Always outputs a GeoTIFF with requested bands
- [x] Automatically generates RGB preview (unless `generate_preview: false`)
- [x] Correctly visualizes: optical (RGB), DEM (terrain colormap), SAR (false color), classified (category colormap)
- [x] Auto-infers appropriate bands when `assets` parameter omitted
- [x] No more confusion between download_visual/download_multispectral
- [x] All old tests updated and passing
- [x] Documentation updated everywhere
- [x] TypeScript compilation passes without errors

---

## Issue 3: Improve Collection-to-Tool Mapping for LLM

### Problem

When asked to "download NAIP imagery", the LLM incorrectly calls `download_geometries` instead of the raster download tools. The LLM doesn't understand which collections map to which tools.

### Solution

Add explicit guidance in tool descriptions and/or a helper mapping that clearly indicates:

- **Raster collections** → use `download_raster` (or new unified tool)
- **Vector/Parquet collections** → use `download_geometries`
- **Zarr collections** → use `download_zarr`

### Changes Required

- [x] **3.1** Update `download_raster` description with explicit collection list:
  ```
  "Use for: sentinel-2-l2a, naip, landsat-c2-l2, cop-dem-glo-30, sentinel-1-rtc,
   esa-worldcover, io-lulc-annual-v02, mtbs, modis-*, hls2-*, alos-dem,
   and any other imagery/raster collections."
  ```
- [x] **3.2** Update `download_geometries` description to be more restrictive:
  ```
  "ONLY for vector/building data: ms-buildings.
   Do NOT use for satellite imagery like NAIP, Sentinel, Landsat, etc."
  ```
- [x] **3.3** Update `download_zarr` description:
  ```
  "Use for: daymet-daily-*, daymet-monthly-*, era5-pds, terraclimate
   (multidimensional climate/weather data)"
  ```
- [x] **3.4** Consider adding a `COLLECTION_TOOL_MAPPING` constant:
  ```typescript
  const COLLECTION_TOOL_MAPPING: Record<string, string> = {
    naip: "download_raster",
    "sentinel-2-l2a": "download_raster",
    "landsat-c2-l2": "download_raster",
    "ms-buildings": "download_geometries",
    "daymet-daily-na": "download_zarr",
    // ... etc
  };
  ```
- [x] **3.5** Update `get_collections` / `describe_collection` output to include recommended tool
- [x] **3.6** Update `copilot-instructions.md` with clear tool routing table
- [x] **3.7** Add negative examples to tool descriptions ("NOT for X, Y, Z")

### Acceptance Criteria

- [ ] Tool descriptions explicitly list supported collections
- [ ] Tool descriptions include "NOT for" exclusions
- [ ] `describe_collection` output recommends the correct tool
- [ ] `copilot-instructions.md` has clear tool routing guidance
- [ ] Testing with prompts like "download NAIP imagery" routes to `download_raster`

---

## Implementation Order

Recommended order of implementation:

1. **Issue 1** (Easy) - Remove limits from `download_geometries`
   - Small, isolated change
   - Low risk
   - ~30 min

2. **Issue 3** (Medium) - Improve tool descriptions
   - Can be done before or alongside Issue 2
   - Documentation-heavy
   - ~1 hour

3. **Issue 2** (Large) - Merge download tools
   - Most complex change
   - Should be done last after other fixes validated
   - ~3-4 hours

---

## Testing Checklist

After all changes:

- [x] `bun run build` completes without errors
- [x] `bun check` (type checking) passes
- [x] `bun format` (formatting) passes
- [x] Manual test: `download_raster` with Sentinel-2 collection
- [x] Manual test: `download_raster` with NAIP collection
- [x] Manual test: `download_raster` with DEM collection
- [x] Manual test: `download_geometries` with ms-buildings (large AOI, no limit)
- [x] Manual test: Prompt "download NAIP imagery" routes correctly
- [x] Update CHANGELOG.md with breaking changes note

---

## Summary

✅ **Issue 1: Remove deprecated tool definitions** - COMPLETED

- Removed `DOWNLOAD_ASSET_TOOL`, `DOWNLOAD_VISUAL_TOOL`, `DOWNLOAD_MULTISPECTRAL_TOOL` definitions
- Removed corresponding handler functions from `src/index.ts`
- Updated all documentation and test files

✅ **Issue 2: Merge download tools into unified `download_raster`** - COMPLETED

- Unified `download_raster` tool handles all raster download use cases
- Always outputs GeoTIFF with requested bands + automatic RGB preview generation
- Correctly visualizes optical (RGB), DEM (terrain colormap), SAR (false color), classified (category colormap)
- Auto-infers appropriate bands when `assets` parameter omitted
- No more confusion between download_visual/download_multispectral
- All old tests updated and passing
- Documentation updated everywhere
- TypeScript compilation passes without errors
- Added support for "image" type assets in preview generation (fixes NAIP and similar collections)

✅ **Issue 3: Update all references and documentation** - COMPLETED

- Updated README.md, copilot-instructions.md, vscode-extension/README.md
- Updated collection-utils.ts helper messages
- Updated all test files to use `download_raster` instead of deprecated tools
- Fixed TypeScript compilation errors and type safety issues

**Breaking Changes:**

- `download_visual`, `download_multispectral`, `download_asset` tools removed
- Use `download_raster` for all raster downloads (with automatic preview generation)
- `download_raster` now requires `bbox` parameter (was optional before)
- Preview generation is now enabled by default (`generate_preview: true`)

**Migration Guide:**

- Replace `download_visual(...)` → `download_raster(collection, bbox, datetime, assets?, ...)`
- Replace `download_multispectral(...)` → `download_raster(collection, bbox, datetime, assets?, ...)`
- Replace `download_asset(...)` → `download_raster(collection, bbox, datetime, assets, ...)` (note: bbox now required)

All refactoring complete! The codebase now has a single, unified raster download tool with automatic asset inference and preview generation.
