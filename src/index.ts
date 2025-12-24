#!/usr/bin/env node

// Silence geotiff.js console.error chatter about unrecognized tags
const original_error = console.error;
console.error = (...args: unknown[]) => {
  const message = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message;
      return "";
    })
    .join(" ");

  if (/name2code/i.test(message) || message.includes("Unknown projection")) {
    return;
  }

  original_error(...args);
};

import { DuckDBInstance } from "@duckdb/node-api";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import FileSystemStore from "@zarrita/storage/fs";
import { createWriteStream } from "fs";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { fromUrl, writeArrayBuffer } from "geotiff";
import os from "os";
import path from "path";
import proj4 from "proj4";
import sharp from "sharp";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import * as zarr from "zarrita";
import { convertAbfsToHttps, extractStorageAccountFromAsset } from "./geo-utils.js";
import { formatCollectionDetails, formatSTACResults } from "./stac-formatters.js";
import {
  getTemporalExtentMismatchMessage,
  maybePadDaymetDatetime,
  parseDatetimeRangeString,
} from "./temporal-utils.js";
import {
  bboxToQuadkeys,
  CLASSIFICATION_COLORMAPS,
  ClassificationColor,
  DAYMET_DAILY_COLLECTIONS,
  DAYMET_LAMBERT_PROJ,
  DEM_COLLECTIONS,
  getRegionNameForQuadkey,
  inferCollectionFromUrl,
  listBlobFiles,
  PARQUET_COLLECTIONS,
  SAR_COLLECTIONS,
  STACCollectionDetail,
} from "./utils.js";
import { terrainColormap } from "./visualization-utils.js";
import { computeDisplayRange, createHeatmapBuffer, loadLocalZarrSlice } from "./zarr-preview.js";
import { computeArrayStats, findIndexRange, toNumberArray } from "./zarr-utils.js";
import {
  getRGBStrategy,
  getTemporalWarning,
  inferAssetsForCollection,
  selectZarrAsset,
} from "./collection-utils.js";

// STAC API endpoint for Planetary Computer
const STAC_API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1";

type SortDirection = "asc" | "desc";

interface STACSearchParams {
  collections: string[];
  bbox?: [number, number, number, number];
  datetime?: string;
  limit?: number;
  sortby?: Array<{
    field: string;
    direction: SortDirection;
  }>;
  query?: Record<string, unknown>;
}

interface STACItem {
  id: string;
  type: string;
  geometry: any;
  bbox?: [number, number, number, number];
  properties: any;
  assets: Record<string, any>;
  links: any[];
}

interface STACSearchResponse {
  type: string;
  features: STACItem[];
  links: any[];
  context?: {
    matched: number;
    returned: number;
  };
}

const STAC_SEARCH_CACHE_TTL_MS = 60 * 1000; // 1 minute
const STAC_SEARCH_CACHE = new Map<string, { timestamp: number; response: STACSearchResponse }>();

/**
 * Validates that a file path is safe and within allowed directories
 * @param filePath - The file path to validate
 * @param allowedDirs - Array of allowed base directories (optional)
 * @returns true if path is valid and safe
 */
export function validateFilePath(filePath: string, allowedDirs?: string[]): boolean {
  try {
    // Basic validation
    if (!filePath || typeof filePath !== "string") {
      return false;
    }

    // Resolve to absolute path
    const resolved = path.resolve(filePath);

    // Check for directory traversal attempts by looking for .. in the original path
    if (filePath.includes("..")) {
      return false;
    }

    // If allowed directories are specified, ensure path is within them
    if (allowedDirs && allowedDirs.length > 0) {
      const isAllowed = allowedDirs.some((dir) => {
        const resolvedDir = path.resolve(dir);
        return resolved.startsWith(resolvedDir + path.sep) || resolved === resolvedDir;
      });
      if (!isAllowed) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a cache key for STAC search parameters
 * @param params - The STAC search parameters
 * @returns A string key for caching search results
 */
export function buildSearchCacheKey(params: STACSearchParams): string {
  return JSON.stringify({
    collections: [...(params.collections || [])].sort(),
    bbox: params.bbox ?? null,
    datetime: params.datetime ?? null,
    limit: params.limit ?? null,
    sortby: params.sortby?.map((s) => ({ field: s.field, direction: s.direction })) ?? null,
    query: params.query ?? null,
  });
}

interface STACCollectionsResponse {
  collections: Array<{
    id: string;
    title?: string;
    description?: string;
    extent?: any;
    keywords?: string[];
  }>;
  links: any[];
}

/**
 * Classification info for a collection
 */
interface ClassificationInfo {
  assetName: string;
  colors: ClassificationColor[];
  noDataValue?: number;
}

type CollectionsOptions = {
  refresh?: boolean;
  cache_path?: string;
  cache_ttl_ms?: number; // default 24h
};

/**
 * Query the STAC API with search parameters
 */
async function searchSTAC(params: STACSearchParams): Promise<STACSearchResponse> {
  let cacheKey: string | null = null;
  try {
    cacheKey = buildSearchCacheKey(params);
    const cached = STAC_SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < STAC_SEARCH_CACHE_TTL_MS) {
      return cached.response;
    }
  } catch {
    cacheKey = null;
  }

  const response = await fetch(`${STAC_API_URL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // ignore
    }
    throw new Error(
      `STAC API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`
    );
  }

  const json = (await response.json()) as STACSearchResponse;
  if (cacheKey) {
    STAC_SEARCH_CACHE.set(cacheKey, { timestamp: Date.now(), response: json });
  }
  return json;
}

/**
 * Extracts the year-month identifier for ERA5 collections from a datetime string
 * @param datetime - ISO 8601 datetime string or range
 * @returns Year-month string in format "YYYY-MM" or null if invalid
 */
export function getEra5MonthId(datetime?: string): string | null {
  if (!datetime) return null;
  const range = parseDatetimeRangeString(datetime);
  if (!range || !Number.isFinite(range.start)) {
    return null;
  }
  const date = new Date(range.start);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Format STAC items for display
 */
/**
 * Internal helper to fetch collections with on-disk caching and TTL.
 */
async function getCollectionsData(options?: CollectionsOptions): Promise<STACCollectionsResponse> {
  const cachePath = options?.cache_path || path.resolve(process.cwd(), "collections.json");
  const useRefresh = options?.refresh === true;
  const TTL_MS = options?.cache_ttl_ms ?? 24 * 60 * 60 * 1000;
  let data: STACCollectionsResponse | undefined;

  if (!useRefresh) {
    try {
      const s = await stat(cachePath);
      const ageMs = Date.now() - s.mtimeMs;
      if (ageMs < TTL_MS) {
        const cached = await readFile(cachePath, "utf-8");
        data = JSON.parse(cached) as STACCollectionsResponse;
      }
    } catch {
      // cache not present or unreadable; proceed to fetch
    }
  }

  if (!data) {
    const url = `${STAC_API_URL}/collections`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to list collections: ${res.status} ${res.statusText}`);
    }
    data = (await res.json()) as STACCollectionsResponse;
    try {
      await writeFile(cachePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      // non-fatal: caching failed
      console.error("Warn: failed to write collections cache:", e);
    }
  }
  return data;
}

/**
 * Fetch available STAC collections (formatted text list)
 */
async function listCollections(options?: CollectionsOptions): Promise<string> {
  const data = await getCollectionsData(options);
  const lines: string[] = [];
  lines.push(`# STAC Collections (${data.collections.length} total)`);
  lines.push("");
  lines.push("First 30 collections:");
  lines.push("");
  for (const c of data.collections.slice(0, 30)) {
    lines.push(`- ${c.id}`);
  }
  if (data.collections.length > 30) {
    lines.push("");
    lines.push(`... and ${data.collections.length - 30} more collections`);
    lines.push("");
    lines.push(
      "For full details, use `list_collections_summary` or check the local cache at ./collections.json"
    );
  }
  return lines.join("\n");
}

/**
 * Compact JSON summary of collections for LLM-friendly parsing
 */
async function listCollectionsSummary(
  options?: CollectionsOptions & { max_keywords?: number }
): Promise<string> {
  const data = await getCollectionsData(options);
  const maxKeywords = options?.max_keywords ?? 3;
  // Limit to first 30 collections to keep response size minimal for stdio transport
  const summary = data.collections.slice(0, 30).map((c) => ({
    id: c.id,
    title: c.title ?? c.id,
    keywords: Array.isArray(c.keywords) ? c.keywords.slice(0, maxKeywords) : [],
  }));
  const result = {
    total_count: data.collections.length,
    showing_count: summary.length,
    note: `Showing first ${summary.length} of ${data.collections.length} collections. Full cache: ./collections.json`,
    collections: summary,
  };
  return JSON.stringify(result, null, 2);
}

/**
 * Fetch detailed information about a specific STAC collection
 * Includes all assets, their resolutions, descriptions, and band info
 */
async function getCollectionDetails(collectionId: string): Promise<STACCollectionDetail> {
  const url = `${STAC_API_URL}/collections/${collectionId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch collection: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as STACCollectionDetail;
}

async function getCollectionItem(collectionId: string, itemId: string): Promise<STACItem> {
  const url = `${STAC_API_URL}/collections/${collectionId}/items/${itemId}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch item ${itemId}: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
    );
  }
  return (await response.json()) as STACItem;
}

/**
 * Format collection details for display, highlighting assets and resolutions
 */
/**
 * Sign a URL using the Planetary Computer sign API
 * This is more reliable than token-based auth for some collections
 */
async function signUrl(assetUrl: string): Promise<string> {
  const SIGN_API_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/sign";

  try {
    const response = await fetch(`${SIGN_API_URL}?href=${encodeURIComponent(assetUrl)}`);

    if (!response.ok) {
      throw new Error(`Failed to sign URL: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { href: string };
    return data.href;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`URL signing failed: ${errorMessage}`);
  }
}

/**
 * Get a SAS token for a Planetary Computer collection
 * Returns the token string that can be appended to asset URLs
 * @deprecated Use signUrl() instead for more reliable access
 */
async function getCollectionToken(collection: string): Promise<string> {
  const TOKEN_API_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token";

  try {
    const response = await fetch(`${TOKEN_API_URL}/${collection}`);

    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { token: string };
    return data.token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Token retrieval failed: ${errorMessage}`);
  }
}

/**
 * Query geometries from a parquet collection using DuckDB
 * Returns feature count and exports to local file
 */
async function queryParquetGeometries(
  collection: string,
  bbox: [number, number, number, number],
  outputPath: string,
  outputFormat: "geojson" | "parquet" = "geojson"
): Promise<{ count: number; path: string }> {
  const config = PARQUET_COLLECTIONS[collection];
  if (!config) {
    throw new Error(
      `Collection '${collection}' is not a supported parquet collection. Supported: ${Object.keys(PARQUET_COLLECTIONS).join(", ")}`
    );
  }

  // Get SAS token
  const token = await getCollectionToken(config.tokenCollection || collection);

  // Create DuckDB instance
  const instance = await DuckDBInstance.create();
  const connection = await instance.connect();

  try {
    // Load extensions
    await connection.runAndReadAll("INSTALL httpfs; LOAD httpfs;");
    await connection.runAndReadAll("INSTALL spatial; LOAD spatial;");
    // Disable geoparquet auto-detection (workaround for MS Buildings metadata issues)
    await connection.runAndReadAll("SET enable_geoparquet_conversion = false;");

    const [west, south, east, north] = bbox;
    let query: string;
    let countQuery: string;

    if (collection === "ms-buildings") {
      // MS Buildings: find parquet files by quadkey using Azure Blob listing
      const quadkeys = bboxToQuadkeys(bbox, 9);

      // Build URLs for each quadkey partition by listing blob contents
      const parquetUrls: string[] = [];

      for (const quadkey of quadkeys) {
        // Determine region from quadkey (MS Buildings is partitioned by RegionName then quadkey)
        const regionName = getRegionNameForQuadkey(quadkey);
        const prefix = `global/2022-07-06/ml-buildings.parquet/RegionName=${regionName}/quadkey=${quadkey}/`;

        try {
          // List parquet files in this quadkey partition
          const files = await listBlobFiles(config.storageAccount, "footprints", prefix, token);

          // Add each file URL
          for (const fileName of files) {
            const url = `https://${config.storageAccount}.blob.core.windows.net/footprints/${fileName}?${token}`;
            parquetUrls.push(`'${url}'`);
          }
        } catch (e) {
          // Quadkey might not exist in this region, continue
          console.error(`Warning: Could not list files for quadkey ${quadkey}: ${e}`);
        }
      }

      if (parquetUrls.length === 0) {
        throw new Error(
          `No MS Buildings parquet files found for bbox ${bbox}. The area might not have building data.`
        );
      }

      // Query with spatial filter - use read_parquet with list of files
      const urlList = parquetUrls.join(", "); // Query all available files

      countQuery = `
        SELECT COUNT(*) as n FROM (
          SELECT geometry FROM read_parquet([${urlList}])
          WHERE ST_Intersects(ST_GeomFromWKB(geometry), ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}))
        )
      `;

      query = `
        SELECT ST_GeomFromWKB(geometry) as geometry
        FROM read_parquet([${urlList}])
        WHERE ST_Intersects(ST_GeomFromWKB(geometry), ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}))
      `;
    } else {
      throw new Error(`Unsupported parquet collection: ${collection}`);
    }

    // Get count first
    const countResult = await connection.runAndReadAll(countQuery);
    const count = Number(countResult.getRowObjects()[0].n);

    if (count === 0) {
      throw new Error(`No geometries found in bbox ${bbox}`);
    }

    // Export to file
    if (outputFormat === "geojson") {
      const exportQuery = `
        COPY (${query}) TO '${outputPath}' WITH (FORMAT GDAL, DRIVER 'GeoJSON');
      `;
      await connection.runAndReadAll(exportQuery);
    } else {
      const exportQuery = `
        COPY (${query}) TO '${outputPath}' WITH (FORMAT PARQUET, COMPRESSION ZSTD);
      `;
      await connection.runAndReadAll(exportQuery);
    }

    return { count, path: outputPath };
  } finally {
    // DuckDB Node API doesn't have explicit close methods
    // Instance will be garbage collected
  }
}

/**
 * Get proj4 projection string from GeoTIFF geokeys
 * Returns null if the image is already in WGS84/EPSG:4326
 */
export function getProjectionFromGeoKeys(geoKeys: any): string | null {
  // Check for standard EPSG codes
  const projCSType = geoKeys.ProjectedCSTypeGeoKey;
  const geoCSType = geoKeys.GeographicTypeGeoKey;

  // If it's EPSG:4326 (WGS84 geographic), no transformation needed
  if (geoCSType === 4326 && !projCSType) {
    return null;
  }

  // Common projected EPSG codes that we can handle
  if (projCSType) {
    // UTM zones (326xx = North, 327xx = South)
    if (projCSType >= 32601 && projCSType <= 32660) {
      const zone = projCSType - 32600;
      return `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;
    }
    if (projCSType >= 32701 && projCSType <= 32760) {
      const zone = projCSType - 32700;
      return `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`;
    }

    // Web Mercator (EPSG:3857)
    if (projCSType === 3857) {
      return "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs";
    }

    // EPSG:5070 - Albers Equal Area (used by MTBS)
    if (projCSType === 5070 || projCSType === 32767) {
      // Check if it's Albers from the citation
      const citation = geoKeys.GTCitationGeoKey || "";
      if (citation.includes("Albers") || geoKeys.ProjCoordTransGeoKey === 11) {
        // Use the projection parameters from geokeys if available
        const lat0 = geoKeys.ProjNatOriginLatGeoKey || 23;
        const lon0 = geoKeys.ProjNatOriginLongGeoKey || -96;
        const lat1 = geoKeys.ProjStdParallel1GeoKey || 29.5;
        const lat2 = geoKeys.ProjStdParallel2GeoKey || 45.5;
        const x0 = geoKeys.ProjFalseEastingGeoKey || 0;
        const y0 = geoKeys.ProjFalseNorthingGeoKey || 0;
        return `+proj=aea +lat_0=${lat0} +lon_0=${lon0} +lat_1=${lat1} +lat_2=${lat2} +x_0=${x0} +y_0=${y0} +datum=NAD83 +units=m +no_defs`;
      }
    }
  }

  // Fallback: Check citation for UTM zone information
  const citation = geoKeys.GTCitationGeoKey || "";
  const utmMatch = citation.match(/UTM zone (\d+)([NS])/i);
  if (utmMatch) {
    const zone = parseInt(utmMatch[1]);
    const hemisphere = utmMatch[2].toUpperCase() === "N" ? "" : " +south";
    return `+proj=utm +zone=${zone} +datum=NAD83 +units=m +no_defs${hemisphere}`;
  }

  // Fallback: Check for UTM projection by method and parameters
  const projMethod = geoKeys.ProjCoordTransGeoKey;
  if (projMethod === 1) {
    // Transverse Mercator (UTM)
    const lon0 = geoKeys.ProjNatOriginLongGeoKey;
    const lat0 = geoKeys.ProjNatOriginLatGeoKey || 0;
    const _k0 = geoKeys.ProjScaleAtNatOriginGeoKey || 0.9996; // Standard UTM scale
    const _x0 = geoKeys.ProjFalseEastingGeoKey || 500000;
    const _y0 = geoKeys.ProjFalseNorthingGeoKey || (lat0 >= 0 ? 0 : 10000000);

    if (lon0 !== undefined) {
      // Calculate UTM zone from longitude
      const zone = Math.floor((lon0 + 180) / 6) + 1;
      const hemisphere = lat0 >= 0 ? "" : " +south";
      return `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs${hemisphere}`;
    }
  }

  // Sinusoidal projection (used by MODIS) - ProjCoordTransGeoKey = 24
  if (geoKeys.ProjCoordTransGeoKey === 24) {
    const lon0 = geoKeys.ProjNatOriginLongGeoKey || 0;
    const x0 = geoKeys.ProjFalseEastingGeoKey || 0;
    const y0 = geoKeys.ProjFalseNorthingGeoKey || 0;
    return `+proj=sinu +lon_0=${lon0} +x_0=${x0} +y_0=${y0} +a=6371007.181 +b=6371007.181 +units=m +no_defs`;
  }

  // Default: assume WGS84 if we can't determine
  return null;
}

/**
 * Calculate pixel window from geographic bbox using GeoTIFF's internal geotransform
 * Handles projected coordinate systems by transforming bbox to image CRS
 */
function calculateWindowFromGeotransform(
  image: any, // GeoTIFF image
  geoBbox: [number, number, number, number],
  maxSize?: number
): [number, number, number, number] {
  const fullWidth = image.getWidth();
  const fullHeight = image.getHeight();
  const origin = image.getOrigin(); // [x, y] of top-left corner
  const resolution = image.getResolution(); // [xRes, yRes] - yRes is typically negative
  const geoKeys = image.getGeoKeys();

  let [reqWest, reqSouth, reqEast, reqNorth] = geoBbox;
  const [originX, originY] = origin;
  const [xRes, yRes] = resolution;

  // Check if we need to transform the bbox
  const targetProj = getProjectionFromGeoKeys(geoKeys);
  if (targetProj) {
    // Transform bbox corners from WGS84 to image CRS
    try {
      const swCorner = proj4("EPSG:4326", targetProj, [reqWest, reqSouth]);
      const neCorner = proj4("EPSG:4326", targetProj, [reqEast, reqNorth]);
      const nwCorner = proj4("EPSG:4326", targetProj, [reqWest, reqNorth]);
      const seCorner = proj4("EPSG:4326", targetProj, [reqEast, reqSouth]);

      // Get the bounding box of all transformed corners
      reqWest = Math.min(swCorner[0], nwCorner[0], seCorner[0], neCorner[0]);
      reqEast = Math.max(swCorner[0], nwCorner[0], seCorner[0], neCorner[0]);
      reqSouth = Math.min(swCorner[1], nwCorner[1], seCorner[1], neCorner[1]);
      reqNorth = Math.max(swCorner[1], nwCorner[1], seCorner[1], neCorner[1]);
    } catch (e) {
      console.error("Projection transformation failed:", e);
      // Fall back to using coordinates as-is
    }
  }

  // Convert geographic coordinates to pixel coordinates using geotransform
  // For standard north-up images: xRes > 0, yRes < 0
  // pixel_x = (geo_x - originX) / xRes
  // pixel_y = (geo_y - originY) / yRes  (yRes is negative, so this gives correct row)

  let left = Math.floor((reqWest - originX) / xRes);
  let right = Math.ceil((reqEast - originX) / xRes);
  let top = Math.floor((reqNorth - originY) / yRes);
  let bottom = Math.ceil((reqSouth - originY) / yRes);

  // Clamp to image bounds
  left = Math.max(0, Math.min(fullWidth, left));
  right = Math.max(0, Math.min(fullWidth, right));
  top = Math.max(0, Math.min(fullHeight, top));
  bottom = Math.max(0, Math.min(fullHeight, bottom));

  // Ensure valid window (left < right, top < bottom)
  if (left >= right) {
    const center = Math.floor((left + right) / 2);
    left = Math.max(0, center - 256);
    right = Math.min(fullWidth, center + 256);
  }
  if (top >= bottom) {
    const center = Math.floor((top + bottom) / 2);
    top = Math.max(0, center - 256);
    bottom = Math.min(fullHeight, center + 256);
  }

  let readWindow: [number, number, number, number] = [left, top, right, bottom];

  // Apply maxSize constraint only if explicitly provided
  if (maxSize !== undefined) {
    const windowW = readWindow[2] - readWindow[0];
    const windowH = readWindow[3] - readWindow[1];

    if (windowW > maxSize || windowH > maxSize) {
      const scale = Math.min(maxSize / windowW, maxSize / windowH);
      const newW = Math.floor(windowW * scale);
      const newH = Math.floor(windowH * scale);
      const centerX = Math.floor((readWindow[0] + readWindow[2]) / 2);
      const centerY = Math.floor((readWindow[1] + readWindow[3]) / 2);

      readWindow = [
        Math.max(0, centerX - Math.floor(newW / 2)),
        Math.max(0, centerY - Math.floor(newH / 2)),
        Math.min(fullWidth, centerX + Math.ceil(newW / 2)),
        Math.min(fullHeight, centerY + Math.ceil(newH / 2)),
      ];
    }
  }

  return readWindow;
}

export function bufferHasSignal(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] !== 0) {
      return true;
    }
  }
  return false;
}

/**
 * Read RGB bands directly from a multi-band COG (e.g., NAIP RGBIR)
 * Returns a buffer of interleaved RGB uint8 data ready for Sharp
 * This avoids the geotiff.js writeArrayBuffer issue with color interpretation
 *
 * @param assetUrl - URL of the COG asset
 * @param maxSize - Maximum output dimension in pixels
 * @param bandIndices - Which bands to use for R, G, B (default: [0, 1, 2])
 * @param geoBbox - Optional geographic bbox [west, south, east, north] to crop to
 * @param itemBbox - Item's full bbox for coordinate conversion (deprecated, uses geotransform instead)
 * @param skipNormalization - If true, assumes data is already uint8 (0-255) and skips percentile stretch
 */
async function readRGBFromCOG(
  assetUrl: string,
  maxSize?: number,
  bandIndices: [number, number, number] = [0, 1, 2],
  geoBbox?: [number, number, number, number],
  itemBbox?: [number, number, number, number],
  skipNormalization: boolean = false
): Promise<{ buffer: Buffer; width: number; height: number }> {
  // Sign the URL
  let signedUrl: string;
  try {
    signedUrl = await signUrl(assetUrl);
  } catch {
    signedUrl = assetUrl;
  }

  // Open the GeoTIFF
  const tiff = await fromUrl(signedUrl);
  const image = await tiff.getImage();

  const fullWidth = image.getWidth();
  const fullHeight = image.getHeight();

  // Calculate window based on geographic bbox using geotransform, or use center crop
  let readWindow: [number, number, number, number];

  if (geoBbox) {
    // Use the GeoTIFF's internal geotransform for accurate coordinate conversion
    readWindow = calculateWindowFromGeotransform(image, geoBbox, maxSize);
  } else {
    // Default: center crop
    const size = Math.min(maxSize || 512, fullWidth, fullHeight);
    const centerX = Math.floor(fullWidth / 2);
    const centerY = Math.floor(fullHeight / 2);
    readWindow = [
      Math.max(0, centerX - size / 2),
      Math.max(0, centerY - size / 2),
      Math.min(fullWidth, centerX + size / 2),
      Math.min(fullHeight, centerY + size / 2),
    ];
  }

  const windowWidth = readWindow[2] - readWindow[0];
  const windowHeight = readWindow[3] - readWindow[1];

  // Read only the specified window
  const data = await image.readRasters({ window: readWindow });

  // Extract RGB bands (geotiff.js returns array of band arrays)
  const numPixels = windowWidth * windowHeight;
  const rgbBuffer = Buffer.alloc(numPixels * 3);

  const [rIdx, gIdx, bIdx] = bandIndices;
  const rBand = data[rIdx] as any;
  const gBand = data[gIdx] as any;
  const bBand = data[bIdx] as any;

  if (skipNormalization) {
    // Data is already uint8 (0-255) - just copy directly
    for (let i = 0; i < numPixels; i++) {
      rgbBuffer[i * 3] = Math.max(0, Math.min(255, rBand[i]));
      rgbBuffer[i * 3 + 1] = Math.max(0, Math.min(255, gBand[i]));
      rgbBuffer[i * 3 + 2] = Math.max(0, Math.min(255, bBand[i]));
    }
  } else {
    // Calculate percentile stretch for proper contrast (2nd-98th percentile)
    const getPercentile = (band: any, p: number): number => {
      const sorted = Array.from(band as any[]).sort((a: number, b: number) => a - b);
      const idx = Math.floor(sorted.length * p);
      return sorted[idx] as number;
    };

    const p2r = getPercentile(rBand, 0.02);
    const p2g = getPercentile(gBand, 0.02);
    const p2b = getPercentile(bBand, 0.02);
    const rangeR = getPercentile(rBand, 0.98) - p2r || 1;
    const rangeG = getPercentile(gBand, 0.98) - p2g || 1;
    const rangeB = getPercentile(bBand, 0.98) - p2b || 1;

    const normalize = (val: number, p2: number, range: number) => {
      const normalized = (val - p2) / range;
      return Math.max(0, Math.min(255, Math.round(normalized * 255)));
    };

    for (let i = 0; i < numPixels; i++) {
      rgbBuffer[i * 3] = normalize(rBand[i], p2r, rangeR);
      rgbBuffer[i * 3 + 1] = normalize(gBand[i], p2g, rangeG);
      rgbBuffer[i * 3 + 2] = normalize(bBand[i], p2b, rangeB);
    }
  }

  // Close the GeoTIFF to release HTTP connection
  await tiff.close();

  return {
    buffer: rgbBuffer,
    width: windowWidth,
    height: windowHeight,
  };
}

/**
 * Download a spatial subset (window) from a COG using HTTP range requests
 * Saves as a proper GeoTIFF with correct metadata, transform, and coordinates
 *
 * @param assetUrl - URL of the COG asset
 * @param outputPath - Local path to save the GeoTIFF
 * @param window - Optional pixel window {minX, minY, maxX, maxY}
 * @param maxSize - Maximum output dimension in pixels
 * @param geoBbox - Optional geographic bbox [west, south, east, north] to crop to
 * @param itemBbox - Item's full bbox for coordinate conversion (required if geoBbox provided)
 */
async function downloadCOGWindow(
  assetUrl: string,
  outputPath: string,
  window?: { minX: number; minY: number; maxX: number; maxY: number },
  maxSize?: number,
  geoBbox?: [number, number, number, number],
  itemBbox?: [number, number, number, number]
): Promise<{ path: string; size: number; width: number; height: number }> {
  // Create output directory if it doesn't exist
  const dir = path.dirname(outputPath);
  await mkdir(dir, { recursive: true });

  // Sign the URL using the Planetary Computer sign API
  let signedUrl: string;
  try {
    signedUrl = await signUrl(assetUrl);
  } catch {
    console.error("Warning: Failed to sign URL, trying unsigned access");
    signedUrl = assetUrl;
  }

  // Open the GeoTIFF using HTTP range requests
  const tiff = await fromUrl(signedUrl);
  const image = await tiff.getImage();

  // Get image dimensions and metadata
  const fullWidth = image.getWidth();
  const fullHeight = image.getHeight();
  const geoKeys = image.getGeoKeys();
  const origin = image.getOrigin();
  const resolution = image.getResolution();
  const samplesPerPixel = image.getSamplesPerPixel();

  // Calculate window based on pixel coords, geographic bbox, or use center crop
  let readWindow: [number, number, number, number];
  if (window) {
    readWindow = [window.minX, window.minY, window.maxX, window.maxY];
  } else if (geoBbox && itemBbox) {
    // Convert geographic bbox to pixel coordinates
    const [itemWest, itemSouth, itemEast, itemNorth] = itemBbox;
    const [reqWest, reqSouth, reqEast, reqNorth] = geoBbox;

    // Clamp requested bbox to item bbox
    const cropWest = Math.max(itemWest, reqWest);
    const cropSouth = Math.max(itemSouth, reqSouth);
    const cropEast = Math.min(itemEast, reqEast);
    const cropNorth = Math.min(itemNorth, reqNorth);

    // Convert to pixel coordinates
    const itemWidth = itemEast - itemWest;
    const itemHeight = itemNorth - itemSouth;

    const left = Math.floor(((cropWest - itemWest) / itemWidth) * fullWidth);
    const top = Math.floor(((itemNorth - cropNorth) / itemHeight) * fullHeight);
    const right = Math.ceil(((cropEast - itemWest) / itemWidth) * fullWidth);
    const bottom = Math.ceil(((itemNorth - cropSouth) / itemHeight) * fullHeight);

    readWindow = [
      Math.max(0, left),
      Math.max(0, top),
      Math.min(fullWidth, right),
      Math.min(fullHeight, bottom),
    ];

    // Apply maxSize constraint only if explicitly provided
    if (maxSize !== undefined) {
      const windowW = readWindow[2] - readWindow[0];
      const windowH = readWindow[3] - readWindow[1];

      if (windowW > maxSize || windowH > maxSize) {
        const scale = Math.min(maxSize / windowW, maxSize / windowH);
        const newW = Math.floor(windowW * scale);
        const newH = Math.floor(windowH * scale);
        const centerX = Math.floor((readWindow[0] + readWindow[2]) / 2);
        const centerY = Math.floor((readWindow[1] + readWindow[3]) / 2);

        readWindow = [
          Math.max(0, centerX - Math.floor(newW / 2)),
          Math.max(0, centerY - Math.floor(newH / 2)),
          Math.min(fullWidth, centerX + Math.ceil(newW / 2)),
          Math.min(fullHeight, centerY + Math.ceil(newH / 2)),
        ];
      }
    }
  } else {
    // Default: read a small 512x512 window from the center
    const size = Math.min(maxSize || 512, fullWidth, fullHeight);
    const centerX = Math.floor(fullWidth / 2);
    const centerY = Math.floor(fullHeight / 2);
    readWindow = [
      Math.max(0, centerX - size / 2),
      Math.max(0, centerY - size / 2),
      Math.min(fullWidth, centerX + size / 2),
      Math.min(fullHeight, centerY + size / 2),
    ];
  }

  const windowWidth = readWindow[2] - readWindow[0];
  const windowHeight = readWindow[3] - readWindow[1];

  // Read only the specified window
  const data = await image.readRasters({
    window: readWindow,
  });

  // Calculate the new origin for the windowed subset
  const newOrigin = [
    origin[0] + readWindow[0] * resolution[0],
    origin[1] + readWindow[1] * resolution[1],
  ];

  // Prepare metadata for the output GeoTIFF
  const metadata = {
    height: windowHeight,
    width: windowWidth,
    samplesPerPixel: samplesPerPixel,
    geoKeys: geoKeys,
    origin: newOrigin,
    resolution: resolution,
  };

  // Handle multi-band vs single-band data
  // geotiff.js readRasters returns an array of TypedArrays (one per band)
  // writeArrayBuffer expects interleaved data for multi-band images
  let typedArray: any;

  if (samplesPerPixel === 1) {
    // Single band - use directly
    const rasterData = data[0];
    if (typeof rasterData === "number") {
      typedArray = new Uint8Array([rasterData]);
    } else {
      typedArray = rasterData;
    }
  } else {
    // Multi-band - interleave the bands (pixel-interleaved format)
    const numPixels = windowWidth * windowHeight;
    const bands = data as unknown as ArrayLike<number>[];

    // Determine the array type from the first band
    const firstBand = bands[0];
    const ArrayConstructor = firstBand.constructor as new (length: number) => any;
    typedArray = new ArrayConstructor(numPixels * samplesPerPixel);

    // Interleave: for each pixel, write all band values consecutively
    for (let i = 0; i < numPixels; i++) {
      for (let b = 0; b < samplesPerPixel; b++) {
        typedArray[i * samplesPerPixel + b] = (bands[b] as any)[i];
      }
    }
  }

  // Write as GeoTIFF using writeArrayBuffer
  const arrayBuffer = await writeArrayBuffer(typedArray, metadata);
  await writeFile(outputPath, Buffer.from(arrayBuffer));

  // Close the GeoTIFF to release HTTP connection
  await tiff.close();

  const stats = await stat(outputPath);

  return {
    path: outputPath,
    size: stats.size,
    width: windowWidth,
    height: windowHeight,
  };
}

/**
 * Download a STAC asset (e.g., GeoTIFF) from a URL
 * For COG files, downloads a small spatial subset using HTTP range requests
 * For other files, downloads the entire file
 */
async function downloadAsset(
  assetUrl: string,
  outputPath: string,
  window?: { minX: number; minY: number; maxX: number; maxY: number },
  maxSize?: number,
  geoBbox?: [number, number, number, number],
  itemBbox?: [number, number, number, number]
): Promise<{ path: string; size: number; width?: number; height?: number }> {
  // Check if this is a GeoTIFF/COG (by extension)
  const isCOG = assetUrl.toLowerCase().endsWith(".tif") || assetUrl.toLowerCase().endsWith(".tiff");

  if (isCOG) {
    // Use windowed read for COG files
    return await downloadCOGWindow(assetUrl, outputPath, window, maxSize, geoBbox, itemBbox);
  }

  // For non-COG files, download the entire file
  // Create output directory if it doesn't exist
  const dir = path.dirname(outputPath);
  await mkdir(dir, { recursive: true });

  let downloadUrl = assetUrl;

  // Try downloading without signing first
  let response = await fetch(assetUrl);

  // If we get a 403 or 409 (Forbidden/Conflict - public access not permitted), try using a SAS token
  if (response.status === 403 || response.status === 409) {
    try {
      // Infer collection from URL
      const collection = inferCollectionFromUrl(assetUrl);
      if (!collection) {
        throw new Error("Could not infer collection from URL");
      }

      // Get SAS token for this collection
      const token = await getCollectionToken(collection);

      // Append token to URL
      const separator = assetUrl.includes("?") ? "&" : "?";
      downloadUrl = `${assetUrl}${separator}${token}`;

      response = await fetch(downloadUrl);
    } catch (tokenError) {
      throw new Error(
        `Access forbidden and token retrieval failed: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`
      );
    }
  }

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  // Stream the response to file
  const fileStream = createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);

  // Get file size
  const stats = await import("fs/promises").then((fs) => fs.stat(outputPath));

  return {
    path: outputPath,
    size: stats.size,
  };
}

/**
 * Download multiple bands and stack them into a single multi-band GeoTIFF
 * Uses HTTP range requests to read windows from each COG, then stacks and writes
 */
async function downloadAndStackBands(
  assetUrls: { name: string; url: string }[],
  outputPath: string,
  maxSize?: number,
  normalizeToUint8?: boolean,
  geoBbox?: [number, number, number, number]
): Promise<{ path: string; size: number; width: number; height: number; bands: string[] }> {
  // Create output directory if it doesn't exist
  const dir = path.dirname(outputPath);
  await mkdir(dir, { recursive: true });

  const bandData: Array<{ name: string; data: any; width: number; height: number }> = [];
  let geoKeys: any;
  let origin: number[];
  let resolution: number[];
  let commonWidth = 0;
  let commonHeight = 0;

  // Download each band
  for (const { name, url } of assetUrls) {
    // Sign URL using the Planetary Computer sign API
    let signedUrl: string;
    try {
      signedUrl = await signUrl(url);
    } catch {
      // If signing fails, try without it
      signedUrl = url;
    }

    const tiff = await fromUrl(signedUrl);
    const image = await tiff.getImage();

    const fullWidth = image.getWidth();
    const fullHeight = image.getHeight();

    // Calculate window based on geographic bbox using geotransform, or use center crop
    let readWindow: [number, number, number, number];

    if (geoBbox) {
      // Use the GeoTIFF's internal geotransform for accurate coordinate conversion
      readWindow = calculateWindowFromGeotransform(image, geoBbox, maxSize);
    } else {
      // Default: center crop
      const size = Math.min(maxSize || 512, fullWidth, fullHeight);
      const centerX = Math.floor(fullWidth / 2);
      const centerY = Math.floor(fullHeight / 2);
      readWindow = [
        Math.max(0, centerX - size / 2),
        Math.max(0, centerY - size / 2),
        Math.min(fullWidth, centerX + size / 2),
        Math.min(fullHeight, centerY + size / 2),
      ];
    }

    const windowWidth = readWindow[2] - readWindow[0];
    const windowHeight = readWindow[3] - readWindow[1];

    // Read the window
    const data = await image.readRasters({ window: readWindow });

    // Store first band's geo metadata
    if (bandData.length === 0) {
      geoKeys = image.getGeoKeys();
      const imgOrigin = image.getOrigin();
      const imgResolution = image.getResolution();
      origin = [
        imgOrigin[0] + readWindow[0] * imgResolution[0],
        imgOrigin[1] + readWindow[1] * imgResolution[1],
      ];
      resolution = imgResolution;
      commonWidth = windowWidth;
      commonHeight = windowHeight;
    }

    // Handle single vs multi-band source (take first band if multi)
    const rasterData = data[0];
    bandData.push({ name, data: rasterData, width: windowWidth, height: windowHeight });

    // Close the GeoTIFF to release HTTP connection
    await tiff.close();
  }

  // Stack all bands into interleaved format
  const numPixels = commonWidth * commonHeight;
  const numBands = bandData.length;

  let stackedData: any;

  if (normalizeToUint8) {
    // Normalize each band to 0-255 using 2nd-98th percentile stretch
    stackedData = new Uint8Array(numPixels * numBands);

    for (let b = 0; b < numBands; b++) {
      const bandValues = bandData[b].data;

      // Get sorted values for percentile calculation (sample for performance)
      const sampleSize = Math.min(10000, bandValues.length);
      const step = Math.max(1, Math.floor(bandValues.length / sampleSize));
      const samples: number[] = [];
      for (let i = 0; i < bandValues.length; i += step) {
        const val = bandValues[i];
        if (val !== 0 && !isNaN(val)) samples.push(val);
      }
      samples.sort((a, b) => a - b);

      const p2 = samples[Math.floor(samples.length * 0.02)] || 0;
      const p98 = samples[Math.floor(samples.length * 0.98)] || 1;
      const range = p98 - p2 || 1;

      // Normalize and interleave
      for (let i = 0; i < numPixels; i++) {
        const val = bandValues[i];
        const normalized = Math.max(0, Math.min(255, ((val - p2) / range) * 255));
        stackedData[i * numBands + b] = Math.round(normalized);
      }
    }
  } else {
    // Preserve original data type
    const firstBand = bandData[0].data;
    const ArrayConstructor = firstBand.constructor as new (length: number) => any;
    stackedData = new ArrayConstructor(numPixels * numBands);

    // Interleave bands
    for (let i = 0; i < numPixels; i++) {
      for (let b = 0; b < numBands; b++) {
        stackedData[i * numBands + b] = bandData[b].data[i];
      }
    }
  }

  // Write stacked GeoTIFF
  const metadata = {
    height: commonHeight,
    width: commonWidth,
    samplesPerPixel: numBands,
    geoKeys: geoKeys,
    origin: origin!,
    resolution: resolution!,
  };

  const arrayBuffer = await writeArrayBuffer(stackedData, metadata);
  await writeFile(outputPath, Buffer.from(arrayBuffer));

  const stats = await stat(outputPath);

  return {
    path: outputPath,
    size: stats.size,
    width: commonWidth,
    height: commonHeight,
    bands: bandData.map((b) => b.name),
  };
}

/**
 * Generate RGB preview image from STAC item using visualization strategy
 */
async function generateRGBPreview(
  item: any,
  rgbStrategy: any,
  outputPath: string,
  max_pixels?: number,
  bbox?: [number, number, number, number],
  itemBbox?: [number, number, number, number],
  save_colormap?: boolean
): Promise<void> {
  let _result: { width: number; height: number } | null = null;
  let _finalImagePath = outputPath;
  let _outputFormat: "jpg" | "png" = outputPath.endsWith(".png") ? "png" : "jpg";
  let legendPath: string | null = null;

  if (rgbStrategy.type === "visual") {
    // Use visual/TCI asset directly (Sentinel-2)
    const asset = item.assets?.[rgbStrategy.asset];
    if (!asset?.href) {
      throw new Error(`Visual asset not found in item ${item.id}`);
    }

    const rgbResult = await readRGBFromCOG(asset.href, max_pixels, [0, 1, 2], bbox, itemBbox, true);
    if (!bufferHasSignal(rgbResult.buffer)) {
      throw new Error("Visual asset window appears empty (all zeros)");
    }
    _result = { width: rgbResult.width, height: rgbResult.height };
    await sharp(rgbResult.buffer, {
      raw: { width: rgbResult.width, height: rgbResult.height, channels: 3 },
    })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    _finalImagePath = outputPath;
    _outputFormat = "jpg";
  } else if (rgbStrategy.type === "image") {
    // Use single stacked image asset with specified band indices (NAIP)
    const asset = item.assets?.[rgbStrategy.asset];
    if (!asset?.href) {
      throw new Error(`Image asset not found in item ${item.id}`);
    }

    const bandIndices = rgbStrategy.bandIndices || [0, 1, 2];
    const rgbResult = await readRGBFromCOG(
      asset.href,
      max_pixels,
      bandIndices,
      bbox,
      itemBbox,
      rgbStrategy.skipNormalization !== false // default to true for normalization
    );
    if (!bufferHasSignal(rgbResult.buffer)) {
      throw new Error("Image asset window appears empty (all zeros)");
    }
    _result = { width: rgbResult.width, height: rgbResult.height };
    await sharp(rgbResult.buffer, {
      raw: { width: rgbResult.width, height: rgbResult.height, channels: 3 },
    })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    _finalImagePath = outputPath;
    _outputFormat = "jpg";
  } else if (rgbStrategy.type === "bands") {
    // Stack individual bands (Landsat, NAIP, etc.)
    const assetNames = [rgbStrategy.assets.red, rgbStrategy.assets.green, rgbStrategy.assets.blue];
    const assetUrls = assetNames.map((name) => ({
      name,
      url: item.assets![name].href,
    }));

    const tempTifPath = path.join(path.dirname(outputPath), `temp_preview_${Date.now()}.tif`);
    const stackResult = await downloadAndStackBands(
      assetUrls,
      tempTifPath,
      max_pixels,
      true // normalize for preview
    );
    _result = { width: stackResult.width, height: stackResult.height };

    await sharp(tempTifPath).jpeg({ quality: 90 }).toFile(outputPath);

    // Clean up temp file
    try {
      await rm(tempTifPath);
    } catch {
      // ignore cleanup errors
    }
  } else if (rgbStrategy.type === "classified") {
    // Apply classification colormap
    const rgbResult = await readClassifiedWithColormap(
      item.assets![rgbStrategy.asset].href,
      rgbStrategy.classInfo,
      max_pixels,
      bbox,
      itemBbox
    );
    _result = { width: rgbResult.width, height: rgbResult.height };

    await sharp(rgbResult.buffer, {
      raw: { width: rgbResult.width, height: rgbResult.height, channels: 3 },
    })
      .png()
      .toFile(outputPath);
    _outputFormat = "png";

    // Save colormap legend if requested
    if (save_colormap) {
      legendPath = path.join(
        path.dirname(outputPath),
        `${path.basename(outputPath, ".png")}_legend.json`
      );
      const legend = {
        classes: rgbStrategy.classInfo.colors.map((c: ClassificationColor) => ({
          value: c.value,
          description: c.description,
          color: [c.r, c.g, c.b],
        })),
      };
      await writeFile(legendPath, JSON.stringify(legend, null, 2));
    }
  } else if (rgbStrategy.type === "dem") {
    // Apply DEM colormap (terrain colors)
    const rgbResult = await readDEMWithColormap(
      item.assets![rgbStrategy.asset].href,
      max_pixels,
      bbox
    );
    _result = { width: rgbResult.width, height: rgbResult.height };

    await sharp(rgbResult.buffer, {
      raw: { width: rgbResult.width, height: rgbResult.height, channels: 3 },
    })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    _outputFormat = "jpg";
  } else if (rgbStrategy.type === "sar") {
    // Apply SAR false color
    const rgbResult = await readSARFalseColor(
      item.assets![rgbStrategy.assets.vv].href,
      item.assets![rgbStrategy.assets.vh]?.href,
      max_pixels,
      bbox
    );
    _result = { width: rgbResult.width, height: rgbResult.height };

    await sharp(rgbResult.buffer, {
      raw: { width: rgbResult.width, height: rgbResult.height, channels: 3 },
    })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    _outputFormat = "jpg";
  }
}

/**
 * Read classified data from a COG and apply colormap
 * Returns RGB buffer ready for Sharp
 */
async function readClassifiedWithColormap(
  assetUrl: string,
  classInfo: ClassificationInfo,
  maxSize?: number,
  geoBbox?: [number, number, number, number],
  _itemBbox?: [number, number, number, number] // deprecated, uses geotransform instead
): Promise<{ buffer: Buffer; width: number; height: number; classesFound: string[] }> {
  // Sign the URL
  let signedUrl: string;
  try {
    signedUrl = await signUrl(assetUrl);
  } catch {
    signedUrl = assetUrl;
  }

  // Open the GeoTIFF
  const tiff = await fromUrl(signedUrl);
  const image = await tiff.getImage();

  const fullWidth = image.getWidth();
  const fullHeight = image.getHeight();

  // Calculate window based on geographic bbox using geotransform, or use center crop
  let readWindow: [number, number, number, number];

  if (geoBbox) {
    // Use the GeoTIFF's internal geotransform for accurate coordinate conversion
    readWindow = calculateWindowFromGeotransform(image, geoBbox, maxSize);
  } else {
    // Default: center crop
    const size = Math.min(maxSize || 512, fullWidth, fullHeight);
    const centerX = Math.floor(fullWidth / 2);
    const centerY = Math.floor(fullHeight / 2);
    readWindow = [
      Math.max(0, centerX - size / 2),
      Math.max(0, centerY - size / 2),
      Math.min(fullWidth, centerX + size / 2),
      Math.min(fullHeight, centerY + size / 2),
    ];
  }

  const windowWidth = readWindow[2] - readWindow[0];
  const windowHeight = readWindow[3] - readWindow[1];

  // Read only the specified window
  const data = await image.readRasters({ window: readWindow });
  const classData = data[0] as Uint8Array | Int16Array | Uint16Array;

  // Build value->color lookup map for efficiency
  const colorMap = new Map<number, ClassificationColor>();
  for (const c of classInfo.colors) {
    colorMap.set(c.value, c);
  }

  // Track which classes are found
  const classesFoundSet = new Set<string>();

  // Apply colormap
  const numPixels = windowWidth * windowHeight;
  const rgbBuffer = Buffer.alloc(numPixels * 3);

  for (let i = 0; i < numPixels; i++) {
    const val = classData[i];
    const color = colorMap.get(val);

    if (color) {
      rgbBuffer[i * 3] = color.r;
      rgbBuffer[i * 3 + 1] = color.g;
      rgbBuffer[i * 3 + 2] = color.b;
      if (val !== classInfo.noDataValue) {
        classesFoundSet.add(color.description);
      }
    } else {
      // Unknown value - use gray
      rgbBuffer[i * 3] = 128;
      rgbBuffer[i * 3 + 1] = 128;
      rgbBuffer[i * 3 + 2] = 128;
    }
  }

  // Close the GeoTIFF to release HTTP connection
  await tiff.close();

  return {
    buffer: rgbBuffer,
    width: windowWidth,
    height: windowHeight,
    classesFound: Array.from(classesFoundSet),
  };
}

/**
 * Get temporal warning message for a collection if applicable
 * Returns null if no special temporal handling needed
 */

async function buildZarrSelection(
  dims: string[],
  rootLocation: zarr.Location<any>,
  bbox?: [number, number, number, number],
  datetime?: string,
  collection?: string,
  options?: { forceMinTimeSlices?: boolean }
): Promise<(ReturnType<typeof zarr.slice> | number | null)[]> {
  const selection: (ReturnType<typeof zarr.slice> | number | null)[] = dims.map(() => null);

  if (!bbox && !datetime) {
    return selection;
  }

  // Handle Daymet special case - uses Lambert Conformal Conic with 2D lat/lon
  if (collection?.startsWith("daymet")) {
    return await buildDaymetSelection(dims, rootLocation, bbox, datetime, options);
  }

  // For other collections, try to find coordinate arrays
  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i];

    if (dim === "time" && datetime) {
      try {
        // Try multiple possible names for time coordinate
        const timePaths = ["time", "times", "date", "dates"];
        let timeArray: zarr.Array<any, any> | null = null;

        for (const timePath of timePaths) {
          try {
            const arr = (await zarr.open(rootLocation.resolve(timePath), {
              kind: "array",
            })) as zarr.Array<any, any>;
            if (arr instanceof zarr.Array) {
              timeArray = arr;
              process.stderr.write(`[ZARR-SLICE] Found time array at path: ${timePath}\n`);
              break;
            }
          } catch {
            // continue
          }
        }

        if (!timeArray) {
          process.stderr.write(`[ZARR-SLICE] Warning: time coordinate not found\n`);
        } else {
          const timeValues = (await zarr.get(timeArray)) as { data: ArrayLike<any> };
          const timeData = toNumberArray(timeValues.data);

          process.stderr.write(
            `[ZARR-SLICE] Time dimension: ${timeData.length} values, range: [${timeData[0]}, ${timeData[timeData.length - 1]}]\n`
          );

          const timeRange = parseDatetimeRangeString(datetime);
          if (timeRange) {
            const minTime = timeRange.start;
            const maxTime = timeRange.end;

            process.stderr.write(
              `[ZARR-SLICE] Requested time range: [${new Date(minTime).toISOString()}, ${new Date(maxTime).toISOString()}]\n`
            );

            // Detect time units based on value magnitude and collection
            const sampleTime = Math.abs(timeData[0]);
            const maxTime_ = Math.abs(timeData[timeData.length - 1]);
            const isEra5 = collection === "era5-pds";
            const isTerraClimate = collection === "terraclimate";

            // ERA5 uses Unix timestamps in seconds
            if (isEra5 || (sampleTime > 1e9 && sampleTime < 2e9)) {
              process.stderr.write(
                `[ZARR-SLICE] Detected seconds since Unix epoch (ERA5 format)\n`
              );

              let startIdx = -1;
              let endIdx = -1;

              for (let j = 0; j < timeData.length; j++) {
                const t = timeData[j] * 1000; // Convert seconds to milliseconds
                if (t >= minTime && startIdx === -1) {
                  startIdx = j;
                }
                if (t <= maxTime) {
                  endIdx = j;
                }
              }

              if (startIdx !== -1 && endIdx !== -1) {
                selection[i] = zarr.slice(startIdx, endIdx + 1);
                process.stderr.write(
                  `[ZARR-SLICE] Time slice: [${startIdx}, ${endIdx + 1}] = ${endIdx - startIdx + 1} time steps\n`
                );
              } else {
                process.stderr.write(
                  `[ZARR-SLICE] Warning: No matching time indices found (startIdx=${startIdx}, endIdx=${endIdx})\n`
                );
              }
              continue;
            }

            // TerraClimate uses days since 1958-01-01 with monthly resolution
            if (isTerraClimate || (sampleTime >= 0 && maxTime_ < 30000 && timeData.length < 1000)) {
              const epoch1958 = Date.parse("1958-01-01T00:00:00Z");
              const msPerDay = 24 * 3600 * 1000;
              process.stderr.write(
                `[ZARR-SLICE] Detected days since 1958-01-01 (TerraClimate format)\n`
              );

              let startIdx = -1;
              let endIdx = -1;

              for (let j = 0; j < timeData.length; j++) {
                const t = epoch1958 + timeData[j] * msPerDay;
                if (t >= minTime && startIdx === -1) {
                  startIdx = j;
                }
                if (t <= maxTime) {
                  endIdx = j;
                }
              }

              if (startIdx !== -1 && endIdx !== -1) {
                selection[i] = zarr.slice(startIdx, endIdx + 1);
                process.stderr.write(
                  `[ZARR-SLICE] Time slice: [${startIdx}, ${endIdx + 1}] = ${endIdx - startIdx + 1} time steps\n`
                );
              } else {
                process.stderr.write(
                  `[ZARR-SLICE] Warning: No matching time indices found (startIdx=${startIdx}, endIdx=${endIdx})\n`
                );
              }
              continue;
            }

            let timeMultiplier = 1;
            let timeUnit = "ms";

            if (sampleTime > 1e15) {
              // Nanoseconds to milliseconds
              timeMultiplier = 1e-6;
              timeUnit = "ns";
            } else if (sampleTime > 1e12) {
              // Already milliseconds
              timeMultiplier = 1;
              timeUnit = "ms";
            } else if (sampleTime > 1e9) {
              // Seconds to milliseconds
              timeMultiplier = 1000;
              timeUnit = "s";
            } else {
              // Assume days since 1970
              timeMultiplier = 24 * 3600 * 1000;
              timeUnit = "days";
            }

            process.stderr.write(`[ZARR-SLICE] Detected time unit: ${timeUnit}\n`);

            // Generic millisecond/second/nanosecond handling
            let startIdx = -1;
            let endIdx = -1;

            for (let j = 0; j < timeData.length; j++) {
              const t = timeData[j] * timeMultiplier;
              if (t >= minTime && startIdx === -1) {
                startIdx = j;
              }
              if (t <= maxTime) {
                endIdx = j;
              }
            }

            if (startIdx !== -1 && endIdx !== -1) {
              selection[i] = zarr.slice(startIdx, endIdx + 1);
              process.stderr.write(
                `[ZARR-SLICE] Time slice: [${startIdx}, ${endIdx + 1}] = ${endIdx - startIdx + 1} time steps\n`
              );
            } else {
              process.stderr.write(
                `[ZARR-SLICE] Warning: No matching time indices found (startIdx=${startIdx}, endIdx=${endIdx})\n`
              );
            }
          }
        }
      } catch (err) {
        process.stderr.write(
          `[ZARR-SLICE] Warning: time dimension error - ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
    } else if ((dim === "lat" || dim === "latitude") && bbox) {
      const latArray = (await zarr.open(rootLocation.resolve(dim), {
        kind: "array",
      })) as zarr.Array<any, any>;
      const latValues = (await zarr.get(latArray)) as { data: ArrayLike<any> };
      const latData = toNumberArray(latValues.data);

      const [latStart, latEnd] = findIndexRange(latData, bbox[1], bbox[3]);
      selection[i] = zarr.slice(Math.max(0, latStart), Math.min(latData.length, latEnd + 1));
    } else if ((dim === "lon" || dim === "longitude") && bbox) {
      const lonArray = (await zarr.open(rootLocation.resolve(dim), {
        kind: "array",
      })) as zarr.Array<any, any>;
      const lonValues = (await zarr.get(lonArray)) as { data: ArrayLike<any> };
      const lonData = toNumberArray(lonValues.data);

      const [lonStart, lonEnd] = findIndexRange(lonData, bbox[0], bbox[2]);
      selection[i] = zarr.slice(Math.max(0, lonStart), Math.min(lonData.length, lonEnd + 1));
    }
  }

  return selection;
}
async function buildDaymetSelection(
  dims: string[],
  rootLocation: zarr.Location<any>,
  bbox?: [number, number, number, number],
  datetime?: string,
  _options?: { forceMinTimeSlices?: boolean }
): Promise<(ReturnType<typeof zarr.slice> | number | null)[]> {
  const selection: (ReturnType<typeof zarr.slice> | number | null)[] = dims.map(() => null);
  const debugInfo: string[] = [];

  debugInfo.push(`Daymet dimensions: ${dims.join(", ")}`);

  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i];

    if (dim === "time" && datetime) {
      try {
        const timeArray = (await zarr.open(rootLocation.resolve("time"), {
          kind: "array",
        })) as zarr.Array<any, any>;
        const timeLength = timeArray.shape[0];

        debugInfo.push(`Time dimension has ${timeLength} values`);

        const timeRange = parseDatetimeRangeString(datetime);
        if (timeRange) {
          const minDate = new Date(timeRange.start);
          const maxDate = new Date(timeRange.end);

          debugInfo.push(
            `Requested time range: [${minDate.toISOString()}, ${maxDate.toISOString()}]`
          );

          // Daymet data starts 1980-01-01
          const daymetStart = new Date("1980-01-01T00:00:00Z");

          // Determine resolution from time array length
          // Annual: ~41 values (1980-2020)
          // Monthly: ~492 values (41 years × 12)
          // Daily: ~14965 values (41 years × 365)
          const isAnnual = timeLength <= 50;
          const isMonthly = timeLength > 50 && timeLength <= 600;
          // else daily

          let startIdx: number;
          let endIdx: number;

          if (isAnnual) {
            // Calculate year indices
            const startYears = minDate.getUTCFullYear() - 1980;
            const endYears = maxDate.getUTCFullYear() - 1980;
            startIdx = Math.max(0, startYears);
            endIdx = Math.min(timeLength - 1, endYears);
            debugInfo.push(`Annual resolution: startYears=${startYears}, endYears=${endYears}`);
          } else if (isMonthly) {
            // Calculate month indices
            const startMonths = (minDate.getUTCFullYear() - 1980) * 12 + minDate.getUTCMonth();
            const endMonths = (maxDate.getUTCFullYear() - 1980) * 12 + maxDate.getUTCMonth();
            startIdx = Math.max(0, startMonths);
            endIdx = Math.min(timeLength - 1, endMonths);
            debugInfo.push(
              `Monthly resolution: startMonths=${startMonths}, endMonths=${endMonths}`
            );
          } else {
            // Calculate day indices
            const msPerDay = 24 * 60 * 60 * 1000;
            const startDays = Math.floor((minDate.getTime() - daymetStart.getTime()) / msPerDay);
            const endDays = Math.floor((maxDate.getTime() - daymetStart.getTime()) / msPerDay);
            startIdx = Math.max(0, startDays);
            endIdx = Math.min(timeLength - 1, endDays);
            debugInfo.push(`Daily resolution: startDays=${startDays}, endDays=${endDays}`);
          }

          debugInfo.push(`Found startIdx=${startIdx}, endIdx=${endIdx}`);

          if (startIdx <= endIdx && startIdx >= 0 && endIdx < timeLength) {
            const slice = zarr.slice(startIdx, endIdx + 1);
            selection[i] = slice;
            debugInfo.push(
              `Time slice: [${startIdx}, ${endIdx + 1}] = ${endIdx - startIdx + 1} time steps`
            );
          } else {
            debugInfo.push(
              `Warning: time range out of bounds (startIdx=${startIdx}, endIdx=${endIdx}, length=${timeLength})`
            );
          }
        }
      } catch (err) {
        debugInfo.push(
          `Warning: time dimension error - ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else if ((dim === "y" || dim === "x") && bbox) {
      try {
        // For Daymet, we need to convert bbox from WGS84 to Lambert Conformal Conic
        const yArray = (await zarr.open(rootLocation.resolve("y"), {
          kind: "array",
        })) as zarr.Array<any, any>;
        const xArray = (await zarr.open(rootLocation.resolve("x"), {
          kind: "array",
        })) as zarr.Array<any, any>;

        const yValues = (await zarr.get(yArray)) as { data: ArrayLike<any> };
        const xValues = (await zarr.get(xArray)) as { data: ArrayLike<any> };
        const yData = toNumberArray(yValues.data);
        const xData = toNumberArray(xValues.data);

        debugInfo.push(
          `Y dimension: ${yData.length} values, range: [${Math.min(...yData)}, ${Math.max(...yData)}]`
        );
        debugInfo.push(
          `X dimension: ${xData.length} values, range: [${Math.min(...xData)}, ${Math.max(...xData)}]`
        );

        // Convert bbox from WGS84 to Lambert Conformal Conic
        const [west, south, east, north] = bbox;
        const southWest = proj4("EPSG:4326", DAYMET_LAMBERT_PROJ, [west, south]);
        const northEast = proj4("EPSG:4326", DAYMET_LAMBERT_PROJ, [east, north]);

        const xMin = Math.min(southWest[0], northEast[0]);
        const xMax = Math.max(southWest[0], northEast[0]);
        const yMin = Math.min(southWest[1], northEast[1]);
        const yMax = Math.max(southWest[1], northEast[1]);

        debugInfo.push(
          `Converted bbox [${west}, ${south}, ${east}, ${north}] to Lambert: [${xMin}, ${yMin}, ${xMax}, ${yMax}]`
        );

        if (dim === "x") {
          const [xStart, xEnd] = findIndexRange(xData, xMin, xMax);
          if (xStart <= xEnd) {
            selection[i] = zarr.slice(Math.max(0, xStart), Math.min(xData.length, xEnd + 1));
            debugInfo.push(
              `X slice: [${Math.max(0, xStart)}, ${Math.min(xData.length, xEnd + 1)}] = ${Math.min(xData.length, xEnd + 1) - Math.max(0, xStart)} values`
            );
          }
        } else if (dim === "y") {
          const [yStart, yEnd] = findIndexRange(yData, yMin, yMax);
          if (yStart <= yEnd) {
            selection[i] = zarr.slice(Math.max(0, yStart), Math.min(yData.length, yEnd + 1));
            debugInfo.push(
              `Y slice: [${Math.max(0, yStart)}, ${Math.min(yData.length, yEnd + 1)}] = ${Math.min(yData.length, yEnd + 1) - Math.max(0, yStart)} values`
            );
          }
        }
      } catch (err) {
        debugInfo.push(
          `Warning: ${dim} dimension error - ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // Log debug info
  if (process.stderr) {
    debugInfo.forEach((msg) => {
      process.stderr.write(`[DAYMET-SLICE] ${msg}\n`);
    });
  }

  return selection;
}
async function _buildEra5Selection(
  dims: string[],
  rootLocation: zarr.Location<any>,
  bbox?: [number, number, number, number],
  datetime?: string,
  options?: { forceMinTimeSlices?: boolean }
): Promise<(ReturnType<typeof zarr.slice> | number | null)[]> {
  const selection: (ReturnType<typeof zarr.slice> | number | null)[] = dims.map(() => null);
  const debugInfo: string[] = [];

  debugInfo.push(`Dimensions: ${dims.join(", ")}`);

  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i];

    if (dim === "time" && datetime) {
      try {
        // Try multiple possible names for time coordinate
        const timePaths = ["time", "times", "date", "dates"];
        let timeArray: zarr.Array<any, any> | null = null;

        for (const timePath of timePaths) {
          try {
            const arr = (await zarr.open(rootLocation.resolve(timePath), {
              kind: "array",
            })) as zarr.Array<any, any>;
            if (arr instanceof zarr.Array) {
              timeArray = arr;
              debugInfo.push(`Found time array at path: ${timePath}`);
              break;
            }
          } catch {
            // continue
          }
        }

        if (!timeArray) {
          debugInfo.push(`Warning: time coordinate not found in paths: ${timePaths.join(", ")}`);
        } else {
          const timeValues = (await zarr.get(timeArray)) as { data: ArrayLike<any> };
          const timeData = toNumberArray(timeValues.data);

          debugInfo.push(
            `Found time dimension with ${timeData.length} values, range: [${timeData[0]}, ${timeData[timeData.length - 1]}]`
          );

          const timeRange = parseDatetimeRangeString(datetime);
          if (timeRange) {
            const minTime = timeRange.start;
            const maxTime = timeRange.end;

            let startIdx = -1;
            let endIdx = -1;

            for (let j = 0; j < timeData.length; j++) {
              // Handle both seconds and milliseconds
              const t = Math.abs(timeData[j]) > 1e10 ? timeData[j] : timeData[j] * 1000;
              if (t >= minTime && startIdx === -1) {
                startIdx = j;
              }
              if (t <= maxTime) {
                endIdx = j;
              }
            }

            if (startIdx !== -1 && endIdx !== -1) {
              const minSlices = options?.forceMinTimeSlices ? 1 : 0;
              const slice = zarr.slice(startIdx, Math.max(startIdx + minSlices + 1, endIdx + 1));
              selection[i] = slice;
              debugInfo.push(
                `Time slice: [${startIdx}, ${Math.max(startIdx + minSlices + 1, endIdx + 1)}]`
              );
            }
          }
        }
      } catch (err) {
        debugInfo.push(
          `Warning: time dimension error - ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else if ((dim === "latitude" || dim === "lat") && bbox) {
      try {
        // Try multiple possible names for latitude coordinate
        const latPaths = ["latitude", "lat", "y", "lat_0"];
        let latArray: zarr.Array<any, any> | null = null;
        let usedPath = "";

        for (const latPath of latPaths) {
          try {
            const arr = (await zarr.open(rootLocation.resolve(latPath), {
              kind: "array",
            })) as zarr.Array<any, any>;
            if (arr instanceof zarr.Array) {
              latArray = arr;
              usedPath = latPath;
              debugInfo.push(`Found latitude array at path: ${latPath}`);
              break;
            }
          } catch {
            // continue
          }
        }

        if (!latArray) {
          debugInfo.push(`Warning: latitude coordinate not found in paths: ${latPaths.join(", ")}`);
        } else {
          const latValues = (await zarr.get(latArray)) as { data: ArrayLike<any> };
          const latData = toNumberArray(latValues.data);

          debugInfo.push(
            `Latitude array (${usedPath}) has ${latData.length} values, range: [${latData[0]}, ${latData[latData.length - 1]}]`
          );

          // ERA5 latitude typically goes from 90 to -90
          const south = bbox[1];
          const north = bbox[3];

          const [latStart, latEnd] = findIndexRange(
            latData,
            Math.min(north, south),
            Math.max(north, south)
          );
          if (latStart <= latEnd) {
            const slice = zarr.slice(Math.max(0, latStart), Math.min(latData.length, latEnd + 1));
            selection[i] = slice;
            debugInfo.push(
              `Latitude slice for bbox [${south}, ${north}]: [${Math.max(0, latStart)}, ${Math.min(latData.length, latEnd + 1)}]`
            );
          } else {
            debugInfo.push(
              `Warning: latitude indices out of range: [${latStart}, ${latEnd}] vs length ${latData.length}`
            );
          }
        }
      } catch (err) {
        debugInfo.push(
          `Warning: latitude dimension error - ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else if ((dim === "longitude" || dim === "lon") && bbox) {
      try {
        // Try multiple possible names for longitude coordinate
        const lonPaths = ["longitude", "lon", "x", "lon_0"];
        let lonArray: zarr.Array<any, any> | null = null;
        let usedPath = "";

        for (const lonPath of lonPaths) {
          try {
            const arr = (await zarr.open(rootLocation.resolve(lonPath), {
              kind: "array",
            })) as zarr.Array<any, any>;
            if (arr instanceof zarr.Array) {
              lonArray = arr;
              usedPath = lonPath;
              debugInfo.push(`Found longitude array at path: ${lonPath}`);
              break;
            }
          } catch {
            // continue
          }
        }

        if (!lonArray) {
          debugInfo.push(
            `Warning: longitude coordinate not found in paths: ${lonPaths.join(", ")}`
          );
        } else {
          const lonValues = (await zarr.get(lonArray)) as { data: ArrayLike<any> };
          const lonData = toNumberArray(lonValues.data);

          debugInfo.push(
            `Longitude array (${usedPath}) has ${lonData.length} values, range: [${lonData[0]}, ${lonData[lonData.length - 1]}]`
          );

          let west = bbox[0];
          let east = bbox[2];

          // Handle coordinate system conversion (0-360 vs -180-180)
          const lonMin = lonData[0];
          const lonMax = lonData[lonData.length - 1];

          // If data is in 0-360 range and bbox is in -180-180 range, convert
          if (lonMin >= 0 && lonMax <= 360 && west < 0) {
            debugInfo.push(`Converting bbox from -180-180 to 0-360 convention`);
            west = west + 360;
            east = east + 360;
            debugInfo.push(`Converted bbox longitude: [${west}, ${east}]`);
          }

          const [lonStart, lonEnd] = findIndexRange(lonData, west, east);
          if (lonStart <= lonEnd) {
            const slice = zarr.slice(Math.max(0, lonStart), Math.min(lonData.length, lonEnd + 1));
            selection[i] = slice;
            debugInfo.push(
              `Longitude slice for bbox [${west}, ${east}]: [${Math.max(0, lonStart)}, ${Math.min(lonData.length, lonEnd + 1)}]`
            );
          } else {
            debugInfo.push(
              `Warning: longitude indices out of range: [${lonStart}, ${lonEnd}] vs length ${lonData.length}`
            );
          }
        }
      } catch (err) {
        debugInfo.push(
          `Warning: longitude dimension error - ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // Log debug info to stderr only if warnings are present
  if (process.stderr) {
    const warnings = debugInfo.filter((msg) => msg.includes("Warning"));
    warnings.forEach((msg) => {
      process.stderr.write(`[ERA5-SLICE] ${msg}\n`);
    });
  }

  return selection;
}

async function sliceArrayFromStore(
  rootLocation: zarr.Location<any>,
  arrayPath: string,
  assetLabel: string,
  outputBaseDir: string,
  collection: string,
  bbox?: [number, number, number, number],
  datetime?: string,
  options?: { forceMinTimeSlices?: boolean }
): Promise<{ asset: string; path: string; shape: number[]; min: number; max: number }> {
  const arrayLocation = arrayPath ? rootLocation.resolve(arrayPath) : rootLocation;
  const dataArray = (await zarr.open(arrayLocation, {
    kind: "array",
  })) as zarr.Array<any, any>;
  const dims = (dataArray.attrs?._ARRAY_DIMENSIONS as string[]) ?? [];
  const selection =
    dims.length > 0
      ? await buildZarrSelection(dims, rootLocation, bbox, datetime, collection, options)
      : undefined;
  const chunk = (await zarr.get(dataArray, selection as any)) as {
    data: ArrayLike<number>;
    shape: number[];
  };

  // Save to the output directory directly as a group, not in subdirectories
  await mkdir(outputBaseDir, { recursive: true });
  const fsStore = new FileSystemStore(outputBaseDir);
  const localRoot = zarr.root(fsStore);

  // Create an array within the group with the asset name as the key
  const localArray = await zarr.create(localRoot.resolve(assetLabel), {
    shape: chunk.shape,
    chunk_shape: chunk.shape,
    data_type: dataArray.dtype,
    attributes: {
      source_collection: collection,
      source_asset: assetLabel,
      source_dimensions: dims,
      requested_bbox: bbox ?? null,
      requested_datetime: datetime ?? null,
    },
  });
  await zarr.set(localArray, null, chunk as any);
  const stats = computeArrayStats(chunk.data);
  return {
    asset: assetLabel,
    path: outputBaseDir,
    shape: chunk.shape,
    min: stats.min,
    max: stats.max,
  };
}

/**
 * Terrain colormap: converts normalized elevation (0-1) to RGB
 * Uses a classic terrain palette: blue (water) -> green (lowland) -> brown (highland) -> white (snow/peaks)
 */
/**
 * Read DEM data from a COG and apply terrain colormap
 * Returns RGB buffer ready for Sharp
 */
async function readDEMWithColormap(
  assetUrl: string,
  maxSize?: number,
  geoBbox?: [number, number, number, number]
): Promise<{ buffer: Buffer; width: number; height: number; minElev: number; maxElev: number }> {
  // Sign the URL
  let signedUrl: string;
  try {
    signedUrl = await signUrl(assetUrl);
  } catch {
    signedUrl = assetUrl;
  }

  // Open the GeoTIFF
  const tiff = await fromUrl(signedUrl);
  const image = await tiff.getImage();

  const fullWidth = image.getWidth();
  const fullHeight = image.getHeight();

  // Calculate window based on geographic bbox using geotransform, or use center crop
  let readWindow: [number, number, number, number];

  if (geoBbox) {
    // Use the GeoTIFF's internal geotransform for accurate coordinate conversion
    readWindow = calculateWindowFromGeotransform(image, geoBbox, maxSize);
  } else {
    // Default: center crop
    const size = Math.min(maxSize || 512, fullWidth, fullHeight);
    const centerX = Math.floor(fullWidth / 2);
    const centerY = Math.floor(fullHeight / 2);
    readWindow = [
      Math.max(0, centerX - size / 2),
      Math.max(0, centerY - size / 2),
      Math.min(fullWidth, centerX + size / 2),
      Math.min(fullHeight, centerY + size / 2),
    ];
  }

  const windowWidth = readWindow[2] - readWindow[0];
  const windowHeight = readWindow[3] - readWindow[1];

  // Read only the specified window
  const data = await image.readRasters({ window: readWindow });
  const elevData = data[0] as Float32Array | Int16Array | Uint16Array;

  // Find min/max elevation (excluding nodata values)
  let minElev = Infinity;
  let maxElev = -Infinity;
  const noDataValue = image.getGDALNoData();

  for (let i = 0; i < elevData.length; i++) {
    const val = elevData[i];
    if (noDataValue !== null && val === noDataValue) continue;
    if (val < -500 || val > 9000) continue; // Skip obvious nodata values
    if (val < minElev) minElev = val;
    if (val > maxElev) maxElev = val;
  }

  // Handle edge case where no valid data found
  if (minElev === Infinity || maxElev === -Infinity) {
    minElev = 0;
    maxElev = 1000;
  }

  // Apply colormap
  const numPixels = windowWidth * windowHeight;
  const rgbBuffer = Buffer.alloc(numPixels * 3);
  const elevRange = maxElev - minElev || 1;

  for (let i = 0; i < numPixels; i++) {
    const elev = elevData[i];
    let t: number;

    // Handle nodata
    if ((noDataValue !== null && elev === noDataValue) || elev < -500 || elev > 9000) {
      t = 0; // Treat nodata as lowest elevation
    } else {
      t = (elev - minElev) / elevRange;
    }

    const [r, g, b] = terrainColormap(t);
    rgbBuffer[i * 3] = r;
    rgbBuffer[i * 3 + 1] = g;
    rgbBuffer[i * 3 + 2] = b;
  }
  // Close the GeoTIFF to release HTTP connection
  await tiff.close();

  return {
    buffer: rgbBuffer,
    width: windowWidth,
    height: windowHeight,
    minElev,
    maxElev,
  };
}

/**
 * Read SAR data (VV and VH polarizations) and create false color composite
 * False color: R=VV, G=VH, B=VV/VH (ratio)
 * Returns RGB buffer ready for Sharp
 */
async function readSARFalseColor(
  vvUrl: string,
  vhUrl: string,
  maxSize?: number,
  geoBbox?: [number, number, number, number]
): Promise<{ buffer: Buffer; width: number; height: number }> {
  // Sign URLs
  let signedVV: string, signedVH: string;
  try {
    signedVV = await signUrl(vvUrl);
  } catch {
    signedVV = vvUrl;
  }
  try {
    signedVH = await signUrl(vhUrl);
  } catch {
    signedVH = vhUrl;
  }

  // Open both GeoTIFFs
  const tiffVV = await fromUrl(signedVV);
  const tiffVH = await fromUrl(signedVH);
  const imageVV = await tiffVV.getImage();
  const imageVH = await tiffVH.getImage();

  const fullWidth = imageVV.getWidth();
  const fullHeight = imageVV.getHeight();

  // Calculate window based on geographic bbox using geotransform, or use center crop
  let readWindow: [number, number, number, number];

  if (geoBbox) {
    readWindow = calculateWindowFromGeotransform(imageVV, geoBbox, maxSize);
  } else {
    const size = Math.min(maxSize || 512, fullWidth, fullHeight);
    const centerX = Math.floor(fullWidth / 2);
    const centerY = Math.floor(fullHeight / 2);
    readWindow = [
      Math.max(0, centerX - size / 2),
      Math.max(0, centerY - size / 2),
      Math.min(fullWidth, centerX + size / 2),
      Math.min(fullHeight, centerY + size / 2),
    ];
  }

  const windowWidth = readWindow[2] - readWindow[0];
  const windowHeight = readWindow[3] - readWindow[1];

  // Read both bands
  const dataVV = await imageVV.readRasters({ window: readWindow });
  const dataVH = await imageVH.readRasters({ window: readWindow });
  const vvBand = dataVV[0] as Float32Array;
  const vhBand = dataVH[0] as Float32Array;

  // Calculate percentiles for normalization (SAR data is typically in dB or linear scale)
  const getPercentiles = (band: Float32Array): { p2: number; p98: number } => {
    const validValues: number[] = [];
    for (let i = 0; i < band.length; i++) {
      const v = band[i];
      if (isFinite(v) && v > -50 && v < 50) validValues.push(v); // Filter valid dB range
    }
    validValues.sort((a, b) => a - b);
    return {
      p2: validValues[Math.floor(validValues.length * 0.02)] || -20,
      p98: validValues[Math.floor(validValues.length * 0.98)] || 0,
    };
  };

  const vvPerc = getPercentiles(vvBand);
  const vhPerc = getPercentiles(vhBand);

  // Create false color composite
  const numPixels = windowWidth * windowHeight;
  const rgbBuffer = Buffer.alloc(numPixels * 3);

  for (let i = 0; i < numPixels; i++) {
    const vv = vvBand[i];
    const vh = vhBand[i];

    // Normalize VV to 0-255
    const vvNorm = Math.max(
      0,
      Math.min(255, ((vv - vvPerc.p2) / (vvPerc.p98 - vvPerc.p2 || 1)) * 255)
    );

    // Normalize VH to 0-255
    const vhNorm = Math.max(
      0,
      Math.min(255, ((vh - vhPerc.p2) / (vhPerc.p98 - vhPerc.p2 || 1)) * 255)
    );

    // VV/VH ratio (in linear space, then normalized)
    // Higher ratio = more single-bounce (urban, bare)
    // Lower ratio = more volume scattering (vegetation)
    const ratio = vv - vh; // In dB, subtraction is division
    const ratioNorm = Math.max(0, Math.min(255, ((ratio + 10) / 20) * 255));

    rgbBuffer[i * 3] = Math.round(vvNorm); // R = VV
    rgbBuffer[i * 3 + 1] = Math.round(vhNorm); // G = VH
    rgbBuffer[i * 3 + 2] = Math.round(ratioNorm); // B = VV/VH ratio
  }

  // Close both GeoTIFFs to release HTTP connections
  await tiffVV.close();
  await tiffVH.close();

  return {
    buffer: rgbBuffer,
    width: windowWidth,
    height: windowHeight,
  };
}

// Define the STAC search tool
const STAC_SEARCH_TOOL: Tool = {
  name: "search_stac",
  description:
    "Search the Microsoft Planetary Computer STAC catalog for satellite imagery and geospatial data. Query by collection, spatial bounding box, and time range.\n\nPopular collections: sentinel-2-l2a (10m optical), landsat-c2-l2 (30m optical), naip (60cm aerial), cop-dem-glo-30 (30m elevation), sentinel-1-rtc (10m SAR).",
  inputSchema: {
    type: "object",
    properties: {
      collection: {
        type: "string",
        description:
          "STAC collection ID. Popular: 'sentinel-2-l2a' (10m optical), 'landsat-c2-l2' (30m optical), 'naip' (60cm aerial US), 'cop-dem-glo-30' (30m elevation), 'sentinel-1-rtc' (10m SAR)",
        default: "sentinel-2-l2a",
      },
      bbox: {
        type: "array",
        description:
          "Spatial bounding box as [west, south, east, north] in WGS84 (EPSG:4326). Example: [-122.5, 47.0, -122.0, 47.5] for Seattle area",
        items: {
          type: "number",
        },
        minItems: 4,
        maxItems: 4,
      },
      datetime: {
        type: "string",
        description:
          "Time range in ISO8601 format. Examples: '2024-06-01T00:00:00Z/2024-06-30T23:59:59Z' (range), '2024-06-01T00:00:00Z/..' (from date), '../2024-06-30T23:59:59Z' (until date), '2024-06-15T12:00:00Z' (single), '2024-06-01/2024-06-30' (date only)",
      },
      limit: {
        type: "number",
        description: "Maximum number of items to return (default: 10, max: 100)",
        default: 10,
        minimum: 1,
        maximum: 100,
      },
    },
    required: ["collection"],
  },
};

// Tool: get_collections - unified collection info tool
const GET_COLLECTIONS_TOOL: Tool = {
  name: "get_collections",
  description:
    "Get information about STAC collections on the Microsoft Planetary Computer (126+ collections available). If collection_id is provided, returns detailed info including assets, resolutions, and bands. Use this to discover asset names for download_raster.\n\nPopular collections: sentinel-2-l2a, landsat-c2-l2, naip, cop-dem-glo-30, sentinel-1-rtc, modis-09A1-061.",
  inputSchema: {
    type: "object",
    properties: {
      collection_id: {
        type: "string",
        description:
          "Optional collection ID to get details for (e.g., 'sentinel-2-l2a'). If omitted, lists all collections.",
      },
      format: {
        type: "string",
        enum: ["list", "summary"],
        description:
          "Output format when listing all collections: 'list' for readable text, 'summary' for compact JSON. Default: 'summary'",
        default: "summary",
      },
      refresh: {
        type: "boolean",
        description: "Force refresh from API (ignored when collection_id is provided)",
        default: false,
      },
    },
  },
};

// Tool: download_raster - unified raster data download with auto-preview
const DOWNLOAD_RASTER_TOOL: Tool = {
  name: "download_raster",
  description:
    "Download satellite/raster data from Planetary Computer collections. Downloads requested bands as GeoTIFF and auto-generates an RGB preview image.\n\nSupported collections:\n- Optical: sentinel-2-l2a, naip, landsat-c2-l2, hls2-l30/s30\n- DEM: cop-dem-glo-30, alos-dem\n- Land Cover: esa-worldcover, io-lulc-annual-v02, mtbs\n- SAR: sentinel-1-rtc\n\nFor vector data (buildings), use download_geometries instead.\nFor Zarr data (climate/weather), use download_zarr instead.",
  inputSchema: {
    type: "object",
    properties: {
      collection: {
        type: "string",
        description: "STAC collection ID",
      },
      bbox: {
        type: "array",
        description: "Geographic bounding box as [west, south, east, north] in WGS84 (EPSG:4326)",
        items: { type: "number" },
        minItems: 4,
        maxItems: 4,
      },
      datetime: {
        type: "string",
        description:
          "Time range in ISO8601 format. Example: '2024-01-01T00:00:00Z/2024-06-30T23:59:59Z'",
      },
      assets: {
        type: "array",
        description:
          "Asset names to download. Optional - will auto-select appropriate bands if omitted.",
        items: { type: "string" },
      },
      max_cloud_cover: {
        type: "number",
        description: "Maximum cloud cover percentage (0-100). Default: 20.",
        default: 20,
      },
      max_pixels: {
        type: "number",
        description:
          "Optional maximum dimension in pixels. If not set, downloads at native resolution for the bbox. Set to limit file size (e.g., 1024, 2048).",
      },
      generate_preview: {
        type: "boolean",
        description: "Generate RGB preview image alongside GeoTIFF. Default: true.",
        default: true,
      },
      save_colormap: {
        type: "boolean",
        description:
          "For classified data, save a JSON file with the colormap legend. Default: false.",
        default: false,
      },
      output_filename: {
        type: "string",
        description: "Optional output filename (without extension)",
      },
      output_directory: {
        type: "string",
        description: "Optional output directory. Defaults to ~/Downloads/planetary-computer/",
      },
    },
    required: ["collection", "bbox", "datetime"],
  },
};

// Tool: download_geometries - download vector/tabular parquet data with spatial filtering
const DOWNLOAD_GEOMETRIES_TOOL: Tool = {
  name: "download_geometries",
  description:
    "Download vector/building data from Planetary Computer with spatial filtering.\n\nONLY for vector data: ms-buildings.\n\nDo NOT use for satellite imagery like NAIP, Sentinel, Landsat, etc. - use download_raster instead.\n\nQueries remote parquet files and exports building polygons intersecting your area of interest.\n\nOutputs GeoJSON (default) or Parquet format.\n\nNOTE: Returns ALL geometries intersecting the bbox - no artificial limits.",
  inputSchema: {
    type: "object",
    properties: {
      collection: {
        type: "string",
        description: "Collection ID. Currently only 'ms-buildings' is supported.",
      },
      bbox: {
        type: "array",
        description: "Geographic bounding box as [west, south, east, north] in WGS84 (EPSG:4326)",
        items: { type: "number" },
        minItems: 4,
        maxItems: 4,
      },
      datetime: {
        type: "string",
        description:
          "Time range in ISO8601 format. Example: '2024-01-01T00:00:00Z/2024-06-30T23:59:59Z'. Some collections (like ms-buildings) are static.",
      },
      output_format: {
        type: "string",
        enum: ["geojson", "parquet"],
        description: "Output format. Default: 'geojson'.",
        default: "geojson",
      },
      output_filename: {
        type: "string",
        description: "Optional output filename",
      },
      output_directory: {
        type: "string",
        description: "Optional output directory. Defaults to ~/Downloads/planetary-computer/",
      },
    },
    required: ["collection", "bbox"],
  },
};

// Tool: download_zarr - slice and download Zarr data
const DOWNLOAD_ZARR_TOOL: Tool = {
  name: "download_zarr",
  description:
    "Download spatial/temporal slices from multidimensional climate/weather data.\n\nUse for: daymet-daily-*, daymet-monthly-*, era5-pds, terraclimate.\n\nDo NOT use for satellite imagery or vector data.\n\nSlices the multidimensional array based on AOI and time-range and saves locally as a Zarr group.",
  inputSchema: {
    type: "object",
    properties: {
      collection: {
        type: "string",
        description: "STAC collection ID (e.g., 'daymet-daily-hi', 'era5-pds', 'terraclimate')",
      },
      bbox: {
        type: "array",
        description: "Geographic bounding box as [west, south, east, north] in WGS84 (EPSG:4326)",
        items: { type: "number" },
        minItems: 4,
        maxItems: 4,
      },
      datetime: {
        type: "string",
        description:
          "Time range in ISO8601 format. Example: '2024-01-01T00:00:00Z/2024-01-31T23:59:59Z'",
      },
      assets: {
        type: "array",
        description: "Asset names (variables) to download. Example: ['tmax', 'tmin'] for Daymet.",
        items: { type: "string" },
      },
      output_filename: {
        type: "string",
        description: "Optional output directory name for the Zarr group",
      },
      output_directory: {
        type: "string",
        description: "Optional output directory. Defaults to ~/Downloads/planetary-computer/",
      },
    },
    required: ["collection", "bbox", "datetime", "assets"],
  },
};

const DESCRIBE_COLLECTION_TOOL: Tool = {
  name: "describe_collection",
  description:
    "Return structured metadata for a Planetary Computer collection, including RGB/DEM/SAR strategy, asset hints, and recommended tools to call next.",
  inputSchema: {
    type: "object",
    properties: {
      collection: {
        type: "string",
        description: "STAC collection ID to inspect (e.g., 'sentinel-2-l2a', 'cop-dem-glo-30').",
      },
    },
    required: ["collection"],
  },
};

const RENDER_ZARR_PREVIEW_TOOL: Tool = {
  name: "render_zarr_preview",
  description: "Create a heatmap preview (PNG) from a local Zarr subset produced by download_zarr.",
  inputSchema: {
    type: "object",
    properties: {
      zarr_path: {
        type: "string",
        description:
          "Path to the local Zarr asset directory (e.g., .../samples/zarr-tests/daymet_daily_na/tmax)",
      },
      time_index: {
        type: "integer",
        minimum: 0,
        description: "Time index to visualize (0-based). Defaults to 0.",
      },
      output_basename: {
        type: "string",
        description: "Optional base filename for the outputs. Defaults to 'preview'.",
      },
    },
    required: ["zarr_path"],
  },
};

// Create and configure the MCP server
const server = new Server(
  {
    name: "planetary-computer-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
  }
);

function notifyProgress(message: string, level: "info" | "warn" | "error" = "info") {
  try {
    void server.notification({
      method: "notifications/message",
      params: { level, message },
    });
  } catch {
    // Ignore notification errors (e.g., disconnected client)
  }
}

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      STAC_SEARCH_TOOL,
      GET_COLLECTIONS_TOOL,
      DESCRIBE_COLLECTION_TOOL,
      DOWNLOAD_RASTER_TOOL,
      DOWNLOAD_GEOMETRIES_TOOL,
      DOWNLOAD_ZARR_TOOL,
      RENDER_ZARR_PREVIEW_TOOL,
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Handler for get_collections (unified)
  if (request.params.name === "get_collections") {
    const {
      collection_id,
      format = "summary",
      refresh = false,
    } = (request.params.arguments || {}) as {
      collection_id?: string;
      format?: "list" | "summary";
      refresh?: boolean;
    };

    try {
      // If collection_id provided, get details for that specific collection
      if (collection_id) {
        const details = await getCollectionDetails(collection_id);
        const formatted = formatCollectionDetails(details);
        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      // Otherwise, list all collections
      const text =
        format === "list"
          ? await listCollections({ refresh })
          : await listCollectionsSummary({ refresh });
      return {
        content: [{ type: "text", text }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error getting collections: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  if (request.params.name === "describe_collection") {
    const { collection } = request.params.arguments as { collection: string };
    try {
      const details = await getCollectionDetails(collection);
      const itemAssets = details.itemAssets || {};
      const category = DEM_COLLECTIONS.has(collection)
        ? "dem"
        : SAR_COLLECTIONS.has(collection)
          ? "sar"
          : CLASSIFICATION_COLORMAPS[collection]
            ? "classified"
            : "optical";
      const recommendedTools =
        category === "dem"
          ? ["download_raster (assets=['data'])"]
          : category === "sar"
            ? ["download_raster (assets=['vv','vh'])"]
            : category === "classified"
              ? ["download_raster (save_colormap=true)"]
              : ["download_raster"];
      const rgbStrategy = getRGBStrategy(collection, itemAssets);
      const assetDetails = Object.entries(itemAssets).map(([name, value]) => {
        const primaryBand =
          Array.isArray(value?.["eo:bands"]) && value["eo:bands"].length > 0
            ? value["eo:bands"][0]
            : null;
        const bandInfo = primaryBand
          ? {
              bandName: primaryBand.name ?? null,
              commonName: primaryBand.commonName ?? null,
              description: primaryBand.description ?? null,
            }
          : undefined;
        return {
          name,
          title: value.title || null,
          description: value.description || null,
          roles: value.roles || [],
          type: value.type || null,
          bandInfo: bandInfo,
        };
      });
      const sampleAssets = assetDetails.slice(0, 10);
      const bandSummaries =
        details.summaries?.["eo:bands"]?.map((band) => ({
          name: band.name,
          commonName: band.commonName,
          gsd: band.gsd,
          centerWavelength: band.centerWavelength,
        })) ?? [];
      const textLines = [
        `# ${details.title || collection}`,
        ``,
        `**Category:** ${category}`,
        `**Recommended tools:** ${recommendedTools.join(", ")}`,
        `**Default visual strategy:** ${rgbStrategy ? rgbStrategy.type : "none detected"}`,
        `**Total item assets:** ${Object.keys(itemAssets).length}`,
      ];
      if (details.description) {
        textLines.push(``, details.description);
      }
      if (bandSummaries.length > 0) {
        textLines.push(``, `## Spectral Bands`);
        for (const band of bandSummaries.slice(0, 8)) {
          const parts = [`- ${band.name}`];
          if (band.commonName) parts.push(`(${band.commonName})`);
          if (band.gsd) parts.push(`@ ${band.gsd}m`);
          if (band.centerWavelength) parts.push(`${band.centerWavelength}μm`);
          textLines.push(parts.join(" "));
        }
        if (bandSummaries.length > 8) {
          textLines.push(`- ... ${bandSummaries.length - 8} more`);
        }
      }
      if (sampleAssets.length > 0) {
        textLines.push(``, `## Asset Details (first ${sampleAssets.length})`);
        for (const asset of sampleAssets) {
          const parts = [`- ${asset.name}`];
          if (asset.title) parts.push(`— ${asset.title}`);
          if (asset.description) parts.push(`(${asset.description})`);
          if (asset.bandInfo?.commonName) {
            parts.push(`[common name: ${asset.bandInfo.commonName}]`);
          }
          if (asset.roles?.length) {
            parts.push(`roles: ${asset.roles.join(", ")}`);
          }
          textLines.push(parts.join(" "));
        }
        if (assetDetails.length > sampleAssets.length) {
          textLines.push(`- ... ${assetDetails.length - sampleAssets.length} more assets`);
        }
      }
      const metadata = {
        collection,
        title: details.title || collection,
        description: details.description || null,
        category,
        recommended_tools: recommendedTools,
        default_visual_strategy: rgbStrategy?.type ?? null,
        rgb_assets:
          rgbStrategy && "assets" in rgbStrategy ? (rgbStrategy as any).assets : undefined,
        is_dem: DEM_COLLECTIONS.has(collection),
        is_sar: SAR_COLLECTIONS.has(collection),
        is_classified: Boolean(CLASSIFICATION_COLORMAPS[collection]),
        sample_assets: sampleAssets,
        all_assets: assetDetails,
        band_summaries: bandSummaries,
        gsd_values: details.summaries?.gsd ?? null,
      };
      return {
        content: [
          { type: "text", text: textLines.join("\n") },
          {
            type: "text",
            text: `JSON metadata:\n${JSON.stringify(metadata, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error describing collection: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  if (request.params.name === "render_zarr_preview") {
    const {
      zarr_path,
      time_index = 0,
      output_basename = "preview",
    } = request.params.arguments as {
      zarr_path: string;
      time_index?: number;
      output_basename?: string;
    };
    try {
      const absolutePath = path.resolve(zarr_path);
      const stats = await stat(absolutePath);
      if (!stats.isDirectory()) {
        throw new Error(`${absolutePath} is not a directory`);
      }

      const sliceInfo = await loadLocalZarrSlice(absolutePath, Number(time_index) || 0);
      const { slice, width, height, bbox, assetName } = sliceInfo;
      const { min, max } = computeDisplayRange(slice);
      const palette = assetName && /prcp|precip/i.test(assetName) ? "ylgnbu" : "default";
      const rgbaBuffer = createHeatmapBuffer(slice, width, height, min, max, palette);

      const pngFilename = `${output_basename}.png`;
      const pngPath = path.join(absolutePath, pngFilename);

      const pngBuffer = await sharp(rgbaBuffer, {
        raw: { width, height, channels: 4 },
      })
        .png()
        .toBuffer();
      await writeFile(pngPath, pngBuffer);

      const metadata = {
        zarr_path: absolutePath,
        png_path: pngPath,
        bbox,
        width,
        height,
        time_index,
        data_range: { min, max },
        palette,
      };

      return {
        content: [
          {
            type: "text",
            text: `Preview image saved to ${pngPath}\nBounds: [${bbox.join(", ")}]\nDimensions: ${width}x${height}`,
          },
          { type: "text", text: `JSON metadata:\n${JSON.stringify(metadata, null, 2)}` },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error rendering Zarr preview: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  // Handler for download_raster
  // Handler for download_raster
  if (request.params.name === "download_raster") {
    const {
      collection,
      bbox,
      datetime,
      assets,
      max_cloud_cover = 20,
      max_pixels,
      generate_preview = true,
      save_colormap = false,
      output_filename,
      output_directory,
    } = request.params.arguments as {
      collection: string;
      bbox: [number, number, number, number];
      datetime: string;
      assets?: string[];
      max_cloud_cover?: number;
      max_pixels?: number;
      generate_preview?: boolean;
      save_colormap?: boolean;
      output_filename?: string;
      output_directory?: string;
    };

    try {
      notifyProgress(
        `Searching ${collection} for ${datetime} within bbox [${bbox.join(", ")}]`,
        "info"
      );
      // Search for imagery
      const searchParams: STACSearchParams = {
        collections: [collection],
        bbox,
        datetime,
        limit: 1,
        sortby: [{ field: "eo:cloud_cover", direction: "asc" }],
      };

      const searchResults = await searchSTAC(searchParams);

      if (searchResults.features.length === 0) {
        // Check for temporal info to provide helpful suggestion
        const temporalWarning = getTemporalWarning(collection, datetime);
        let errorMsg = `No imagery found for collection ${collection} in the given AOI and time range.`;
        if (temporalWarning) {
          errorMsg += "\n\n" + temporalWarning;
        }
        throw new Error(errorMsg);
      }

      const filteredItems = searchResults.features.filter((item) => {
        const cloudCover = item.properties?.["eo:cloud_cover"];
        return cloudCover === undefined || cloudCover <= max_cloud_cover;
      });

      if (filteredItems.length === 0) {
        const bestCloud = searchResults.features[0]?.properties?.["eo:cloud_cover"];
        const cloudMsg =
          bestCloud !== undefined
            ? `Closest available cloud cover: ${bestCloud.toFixed(2)}%`
            : "This collection does not report cloud cover.";
        throw new Error(`No images found with cloud cover <= ${max_cloud_cover}%. ${cloudMsg}`);
      }

      const bestItem = filteredItems[0];
      const selectedCloud = bestItem.properties?.["eo:cloud_cover"];
      notifyProgress(
        `Selected item ${bestItem.id} (cloud cover: ${selectedCloud?.toFixed(2) ?? "N/A"}%)`,
        "info"
      );

      // Auto-infer assets if not provided
      let inferredAssets: string[];
      if (!assets || assets.length === 0) {
        inferredAssets = inferAssetsForCollection(collection, bestItem.assets || {});
        if (inferredAssets.length === 0) {
          const availableAssets = Object.keys(bestItem.assets || {}).join(", ");
          throw new Error(
            `Could not infer appropriate assets for collection '${collection}'. Available assets: ${availableAssets}`
          );
        }
        notifyProgress(`Auto-selected assets: ${inferredAssets.join(", ")}`, "info");
      } else {
        inferredAssets = assets;
      }

      // Validate all requested assets exist
      const assetUrls: { name: string; url: string }[] = [];
      const missingAssets: string[] = [];

      for (const assetName of inferredAssets) {
        const asset = bestItem.assets?.[assetName];
        if (asset?.href) {
          assetUrls.push({ name: assetName, url: asset.href });
        } else {
          missingAssets.push(assetName);
        }
      }

      if (assetUrls.length === 0) {
        const availableAssets = Object.keys(bestItem.assets || {}).join(", ");
        throw new Error(`None of the requested assets found. Available: ${availableAssets}`);
      }

      // Determine output path
      const defaultDir = path.join(os.homedir(), "Downloads", "planetary-computer");
      const targetDir = output_directory || defaultDir;
      const bandLabel =
        inferredAssets.length === 1 ? inferredAssets[0] : `${inferredAssets.length}bands`;
      const filename = output_filename || `${bestItem.id}_${bandLabel}.tif`;
      const outputPath = path.join(
        targetDir,
        filename.endsWith(".tif") ? filename : `${filename}.tif`
      );

      await mkdir(targetDir, { recursive: true });

      let result: { width: number; height: number; bands: string[] };

      if (assetUrls.length === 1) {
        // Single asset: download directly (preserving all bands)
        notifyProgress(`Downloading ${assetUrls[0].name} asset`, "info");
        const downloadResult = await downloadAsset(
          assetUrls[0].url,
          outputPath,
          undefined,
          max_pixels
        );
        result = {
          width: downloadResult.width || 0,
          height: downloadResult.height || 0,
          bands: [assetUrls[0].name],
        };
      } else {
        notifyProgress(`Stacking ${assetUrls.length} assets into a single GeoTIFF`, "info");
        const stackResult = await downloadAndStackBands(assetUrls, outputPath, max_pixels, false);
        result = { width: stackResult.width, height: stackResult.height, bands: stackResult.bands };
      }

      const finalStats = await stat(outputPath);
      notifyProgress(`Finished writing multispectral image to ${outputPath}`, "info");

      // Generate RGB preview if requested
      let previewPath: string | null = null;
      let legendPath: string | null = null;
      if (generate_preview) {
        try {
          notifyProgress("Generating RGB preview image", "info");

          // Get collection details to determine RGB strategy
          const collectionDetails = await getCollectionDetails(collection);
          const _itemAssets = collectionDetails.itemAssets || {};
          let rgbStrategy = getRGBStrategy(collection, bestItem.assets || {});

          // Re-determine RGB strategy using actual item assets
          if (!rgbStrategy || rgbStrategy.type === "classified") {
            rgbStrategy = getRGBStrategy(collection, bestItem.assets || {});
          }

          if (rgbStrategy) {
            // Determine preview output path
            const previewFilename = output_filename
              ? `${output_filename}_preview.jpg`
              : `${bestItem.id}_preview.jpg`;
            previewPath = path.join(targetDir, previewFilename);

            // Generate preview using the same logic as download_visual
            await generateRGBPreview(
              bestItem,
              rgbStrategy,
              previewPath,
              max_pixels,
              bbox,
              bestItem.bbox as [number, number, number, number],
              save_colormap
            );

            if (save_colormap && rgbStrategy.type === "classified") {
              legendPath = path.join(
                targetDir,
                `${path.basename(previewPath, ".jpg")}_legend.json`
              );
            }
          } else {
            notifyProgress("Could not determine RGB strategy for preview generation", "warn");
          }
        } catch (previewError) {
          notifyProgress(`Preview generation failed: ${previewError}`, "warn");
        }
      }

      let message = `Successfully downloaded to: ${outputPath}\n`;
      message += `File size: ${(finalStats.size / 1024).toFixed(2)} KB\n`;
      message += `Dimensions: ${result.width}x${result.height} pixels\n`;
      message += `Bands: ${result.bands.join(", ")} (${result.bands.length} band${result.bands.length > 1 ? "s" : ""})\n`;
      message += `Item: ${bestItem.id}\n`;
      message += `Datetime: ${bestItem.properties?.datetime || "N/A"}\n`;
      message += `Cloud cover: ${bestItem.properties?.["eo:cloud_cover"]?.toFixed(2) || "N/A"}%`;

      if (previewPath) {
        try {
          const previewStats = await stat(previewPath);
          message += `\nRGB Preview: ${previewPath} (${(previewStats.size / 1024).toFixed(2)} KB)`;
        } catch {
          // Preview file doesn't exist, skip it
        }
      }

      if (legendPath) {
        message += `\nLegend: ${legendPath}`;
      }

      if (missingAssets.length > 0) {
        message += `\nWarning: Assets not found: ${missingAssets.join(", ")}`;
      }

      return {
        content: [{ type: "text", text: message }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error downloading multispectral: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  if (request.params.name === "search_stac") {
    const {
      collection,
      bbox,
      datetime,
      limit = 10,
    } = request.params.arguments as {
      collection: string;
      bbox?: [number, number, number, number];
      datetime?: string;
      limit?: number;
    };

    try {
      const searchParams: STACSearchParams = {
        collections: [collection],
        limit: Math.min(limit, 100),
      };

      if (bbox && Array.isArray(bbox) && bbox.length === 4) {
        searchParams.bbox = bbox as [number, number, number, number];
      }

      if (datetime) {
        searchParams.datetime = datetime;
      }

      const results = await searchSTAC(searchParams);

      // Check for temporal warnings
      const temporalWarning = getTemporalWarning(collection, datetime);

      let formattedOutput = "";

      // Add temporal warning at the top if applicable and results are empty or warning indicates mismatch
      if (
        temporalWarning &&
        (results.features.length === 0 || temporalWarning.includes("Potential issue"))
      ) {
        formattedOutput += temporalWarning + "\n";
      }

      formattedOutput += formatSTACResults(results);

      return {
        content: [
          {
            type: "text",
            text: formattedOutput,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error searching STAC catalog: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Handler for download_geometries
  if (request.params.name === "download_geometries") {
    const {
      collection,
      bbox,
      datetime,
      output_format = "geojson",
      output_filename,
      output_directory,
    } = request.params.arguments as {
      collection: string;
      bbox: [number, number, number, number];
      datetime?: string;
      output_format?: "geojson" | "parquet";
      output_filename?: string;
      output_directory?: string;
    };

    try {
      // Determine output path
      const defaultDir = path.join(os.homedir(), "Downloads", "planetary-computer");
      const targetDir = output_directory || defaultDir;
      await mkdir(targetDir, { recursive: true });

      const ext = output_format === "geojson" ? ".geojson" : ".parquet";
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = output_filename || `${collection}_${timestamp}${ext}`;
      const outputPath = path.join(
        targetDir,
        filename.endsWith(ext) ? filename : `${filename}${ext}`
      );

      // Query and export geometries
      const result = await queryParquetGeometries(collection, bbox, outputPath, output_format);

      // Get file size
      const stats = await stat(outputPath);
      const fileSizeKB = (stats.size / 1024).toFixed(2);

      let message = `Successfully downloaded ${result.count} geometries to: ${result.path}\n`;
      message += `File size: ${fileSizeKB} KB\n`;
      message += `Format: ${output_format.toUpperCase()}\n`;
      message += `Collection: ${collection}\n`;
      message += `Bounding box: [${bbox.join(", ")}]`;
      if (datetime) {
        message += `\nDatetime: ${datetime}`;
      }

      return {
        content: [{ type: "text", text: message }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error downloading geometries: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  // Handler for download_zarr
  if (request.params.name === "download_zarr") {
    const { collection, bbox, datetime, assets, output_filename, output_directory } = request.params
      .arguments as {
      collection: string;
      bbox?: [number, number, number, number];
      datetime?: string;
      assets: string[];
      output_filename?: string;
      output_directory?: string;
    };

    try {
      const collectionDetails = await getCollectionDetails(collection);
      let effectiveDatetime = datetime;
      let daymetAdjusted = false;
      if (DAYMET_DAILY_COLLECTIONS.has(collection) && datetime) {
        const padded = maybePadDaymetDatetime(datetime);
        if (padded) {
          effectiveDatetime = padded.datetime;
          daymetAdjusted = padded.adjusted;
        }
      }
      const extentMismatch = getTemporalExtentMismatchMessage(collectionDetails, effectiveDatetime);
      if (extentMismatch) {
        throw new Error(extentMismatch);
      }

      const defaultDir = path.join(os.homedir(), "Downloads", "planetary-computer");
      const targetDir = output_directory || defaultDir;
      await mkdir(targetDir, { recursive: true });
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = output_filename || `${collection}_${timestamp}_zarr`;
      const outputPath = path.join(targetDir, filename);
      await mkdir(outputPath, { recursive: true });

      const savedAssets: {
        asset: string;
        path: string;
        shape: number[];
        min: number;
        max: number;
      }[] = [];
      const warnings: string[] = [];
      if (daymetAdjusted) {
        warnings.push(
          `Expanded single-day datetime '${datetime}' by one day to ${effectiveDatetime} to capture Daymet data.`
        );
      }
      const sliceSelectionOptions = daymetAdjusted ? { forceMinTimeSlices: true } : undefined;

      const isEra5 = collection === "era5-pds";
      const preferredEra5Kind = "an";

      const collectionAsset = selectZarrAsset(collectionDetails);
      if (collectionAsset) {
        const httpHref = convertAbfsToHttps(collectionAsset.href, collectionAsset.storageAccount);
        if (!httpHref.startsWith("http")) {
          throw new Error(
            `Unsupported Zarr asset protocol for ${collection}: ${collectionAsset.href}`
          );
        }
        notifyProgress(`Opening Zarr store for ${collection} (${collectionAsset.name})`, "info");
        const signedHref = await signUrl(httpHref);
        const remoteStore = new zarr.FetchStore(signedHref);
        const rootLocation = zarr.root(remoteStore);

        for (const assetName of assets) {
          try {
            const result = await sliceArrayFromStore(
              rootLocation,
              assetName,
              assetName,
              outputPath,
              collection,
              bbox,
              effectiveDatetime,
              sliceSelectionOptions
            );
            savedAssets.push(result);
          } catch (assetError) {
            warnings.push(
              `Asset '${assetName}' could not be sliced: ${assetError instanceof Error ? assetError.message : String(assetError)}`
            );
          }
        }
      } else {
        let matchedItem: STACItem | undefined;
        if (isEra5) {
          const era5MonthId = getEra5MonthId(effectiveDatetime);
          if (!era5MonthId) {
            throw new Error(
              "Unable to determine ERA5 month from the provided datetime. Pick a date between 1979 and 2020."
            );
          }
          const era5Kinds = [preferredEra5Kind, "fc"];
          let lastError: Error | null = null;
          for (const kind of era5Kinds) {
            const itemId = `era5-pds-${era5MonthId}-${kind}`;
            try {
              matchedItem = await getCollectionItem(collection, itemId);
              if (kind !== preferredEra5Kind) {
                warnings.push(
                  `Preferred ERA5 kind '${preferredEra5Kind}' not available for ${era5MonthId}; using '${kind}' instead.`
                );
              }
              break;
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err));
            }
          }
          if (!matchedItem) {
            throw lastError ?? new Error(`No ERA5 items found for month ${era5MonthId}.`);
          }
        } else {
          const searchParams: STACSearchParams = {
            collections: [collection],
            limit: 10,
          };
          if (bbox) {
            searchParams.bbox = bbox;
          }
          if (effectiveDatetime) {
            searchParams.datetime = effectiveDatetime;
          }

          let searchResults: STACSearchResponse = await searchSTAC(searchParams);

          if (searchResults.features.length === 0 && effectiveDatetime) {
            const timeRange = parseDatetimeRangeString(effectiveDatetime);
            if (timeRange && Number.isFinite(timeRange.start)) {
              const monthString = new Date(timeRange.start).toISOString().slice(0, 7);
              searchResults = await searchSTAC({
                ...searchParams,
                datetime: monthString,
              });
            }
          }

          if (searchResults.features.length === 0) {
            const bboxText = bbox ? `[${bbox.join(", ")}]` : "ANY";
            const datetimeText = effectiveDatetime ?? "ANY";
            throw new Error(
              `No items found for collection ${collection} within bbox ${bboxText} and datetime ${datetimeText}.`
            );
          }
          matchedItem = searchResults.features.find((item) =>
            assets.every((assetName) => Boolean(item.assets?.[assetName]))
          );
          if (!matchedItem) {
            matchedItem = searchResults.features[0];
            warnings.push(
              "Requested assets not found together in a single item; slicing available assets from the first item."
            );
          }
        }

        for (const assetName of assets) {
          const asset = matchedItem.assets?.[assetName];
          if (!asset?.href) {
            warnings.push(`Asset '${assetName}' not found in item ${matchedItem.id}`);
            continue;
          }
          try {
            const httpHref = convertAbfsToHttps(asset.href, extractStorageAccountFromAsset(asset));
            if (!httpHref.startsWith("http")) {
              throw new Error(`Unsupported asset protocol: ${asset.href}`);
            }
            const signedHref = await signUrl(httpHref);
            notifyProgress(`Opening zarr store for asset ${assetName}`, "info");
            const remoteStore = new zarr.FetchStore(signedHref);
            const rootLocation = zarr.root(remoteStore);

            // For ERA5, we need to determine the correct array path within the zarr store
            let arrayPath = assetName;
            if (collection === "era5-pds") {
              // Try to find the variable in the zarr store
              // ERA5 variables might be at root level or nested
              const rootArray = await zarr.open(rootLocation, { kind: "array" }).catch(() => null);
              if (rootArray && rootArray instanceof zarr.Array) {
                // Root is an array, use it directly
                arrayPath = "";
              } else {
                // Try common ERA5 variable paths
                const possiblePaths = [
                  assetName,
                  `/${assetName}`,
                  assetName.replace(/_/g, "-"),
                  `/${assetName.replace(/_/g, "-")}`,
                ];

                let found = false;
                for (const tryPath of possiblePaths) {
                  try {
                    const arr = await zarr.open(
                      tryPath ? rootLocation.resolve(tryPath) : rootLocation,
                      { kind: "array" }
                    );
                    if (arr instanceof zarr.Array) {
                      arrayPath = tryPath;
                      found = true;
                      break;
                    }
                  } catch {
                    // Continue to next path
                  }
                }

                if (!found) {
                  // List available paths if we can
                  throw new Error(
                    `Variable '${assetName}' not found in ERA5 zarr store. Tried paths: ${possiblePaths.join(", ")}`
                  );
                }
              }
            }

            const result = await sliceArrayFromStore(
              rootLocation,
              arrayPath,
              assetName,
              outputPath,
              collection,
              bbox,
              effectiveDatetime,
              sliceSelectionOptions
            );
            savedAssets.push(result);
          } catch (assetError) {
            warnings.push(
              `Asset '${assetName}' could not be sliced: ${assetError instanceof Error ? assetError.message : String(assetError)}`
            );
          }
        }
      }

      if (!savedAssets.length) {
        throw new Error(
          `Unable to extract any Zarr assets for ${collection}. ${warnings.join(" ")}`
        );
      }

      let message = `Saved ${savedAssets.length} Zarr subset(s) to: ${outputPath}\n`;
      for (const info of savedAssets) {
        message += `- ${info.asset}: shape=${info.shape.join("x")} min=${info.min.toFixed(3)} max=${info.max.toFixed(3)}\n`;
      }
      if (warnings.length) {
        message += `\nWarnings:\n${warnings.join("\n")}`;
      }

      const metadata = {
        collection,
        bbox: bbox ?? null,
        datetime: effectiveDatetime ?? null,
        output_path: outputPath,
        assets_requested: assets,
        assets_saved: savedAssets,
        warnings,
      };

      return {
        content: [
          { type: "text", text: message },
          { type: "text", text: `JSON metadata:\n${JSON.stringify(metadata, null, 2)}` },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error working with Zarr data: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

let _transportInstance: StdioServerTransport | null = null;
let _serverStarted = false;

/**
 * Start the MCP server
 * @param transport - Optional transport instance, defaults to StdioServerTransport
 */
export async function startServer(transport?: StdioServerTransport) {
  if (_serverStarted) return;
  const t = transport ?? new StdioServerTransport();
  _transportInstance = t;
  await server.connect(t);
  _serverStarted = true;
  console.error("Planetary Computer MCP Server running on stdio");
}

/**
 * Stop the MCP server
 */
export async function stopServer() {
  if (!_serverStarted) return;
  try {
    // Attempt graceful shutdown by closing transport if available
    if (_transportInstance && typeof (_transportInstance as any).close === "function") {
      try {
        await (_transportInstance as any).close();
      } catch {
        // ignore
      }
    }
  } finally {
    _serverStarted = false;
    _transportInstance = null;
  }
}

// If this module is executed directly (CLI), start the server and hook fatal errors
// Check for direct execution via various paths:
// - Local dev: src/index.ts, src/index.js, dist/src/index.js
// - npm/npx global: symlink named "planetary-computer-mcp"
// - npx execution: _npx cache paths
const scriptPath = process.argv[1] ?? "";
const isDirectExecution =
  scriptPath.endsWith("src/index.ts") ||
  scriptPath.endsWith("src/index.js") ||
  scriptPath.endsWith("dist/src/index.js") ||
  scriptPath.endsWith("planetary-computer-mcp") ||
  scriptPath.includes("planetary-computer-mcp");

if (isDirectExecution) {
  startServer().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
