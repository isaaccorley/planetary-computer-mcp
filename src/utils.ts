export interface ParquetCollectionConfig {
  storageAccount: string;
  container: string;
  geometryColumn: string;
  partitionPattern?: string;
  tokenCollection?: string;
}

export const PARQUET_COLLECTIONS: Record<string, ParquetCollectionConfig> = {
  "ms-buildings": {
    storageAccount: "bingmlbuildings",
    container: "footprints",
    geometryColumn: "geometry",
    partitionPattern: "global/2022-07-06/ml-buildings.parquet/RegionName=*/quadkey=*/",
    tokenCollection: "ms-buildings",
  },
};

export const RGB_BAND_MAPPING: Record<string, { red: string; green: string; blue: string } | null> =
  {
    "sentinel-2-l2a": { red: "B04", green: "B03", blue: "B02" },
    naip: null,
    "landsat-c2-l2": { red: "red", green: "green", blue: "blue" },
    "hls2-l30": { red: "B04", green: "B03", blue: "B02" },
    "hls2-s30": { red: "B04", green: "B03", blue: "B02" },
    "modis-09A1-061": { red: "sur_refl_b01", green: "sur_refl_b04", blue: "sur_refl_b03" },
  };

export const DEM_COLLECTIONS = new Set([
  "cop-dem-glo-30",
  "cop-dem-glo-90",
  "alos-dem",
  "nasadem",
  "3dep-seamless",
  "3dep-lidar-dtm",
  "3dep-lidar-dsm",
]);

/**
 * SAR collections that need false-color visualization (VV, VH, VV/VH ratio as RGB)
 */
export const SAR_COLLECTIONS = new Set(["sentinel-1-rtc", "sentinel-1-grd"]);

export const DAYMET_DAILY_COLLECTIONS = new Set([
  "daymet-daily-na",
  "daymet-daily-hi",
  "daymet-daily-pr",
]);

export const DAYMET_LAMBERT_PROJ =
  "+proj=lcc +lat_1=25 +lat_2=60 +lat_0=42.5 +lon_0=-100 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs";

export interface STACCollectionDetail {
  id: string;
  type: string;
  title?: string;
  description?: string;
  extent?: {
    spatial?: { bbox?: number[][] };
    temporal?: { interval?: (string | null)[][] };
  };
  keywords?: string[];
  summaries?: {
    gsd?: number[];
    "eo:bands"?: Array<{
      name: string;
      gsd?: number;
      commonName?: string;
      description?: string;
      centerWavelength?: number;
    }>;
  };
  itemAssets?: Record<
    string,
    {
      gsd?: number;
      type?: string;
      title?: string;
      description?: string;
      roles?: string[];
      "eo:bands"?: Array<{
        name: string;
        commonName?: string;
        description?: string;
      }>;
      // Classification metadata (file:values format - MTBS, IO-LULC, NRCAN)
      "file:values"?: Array<{
        values: number[];
        summary: string;
      }>;
      // Classification metadata (classification:classes format - ESA WorldCover)
      "classification:classes"?: Array<{
        value: number;
        description: string;
        "color-hint"?: string; // hex RGB without #
      }>;
    }
  >;
  assets?: Record<
    string,
    {
      href: string;
      type?: string;
      title?: string;
      roles?: string[];
      "xarray:open_kwargs"?: Record<string, unknown>;
      "xarray:storage_options"?: Record<string, unknown>;
    }
  >;
  links?: any[];
}

export interface ClassificationColor {
  value: number;
  r: number;
  g: number;
  b: number;
  description: string;
}

export interface TemporalInfo {
  type: "static" | "annual" | "irregular" | "state-varies";
  description: string;
  validYears?: number[]; // For annual/irregular: years with data
  fixedDate?: string; // For static: the single date
  notes?: string; // Additional context
}

export interface ClassificationInfo {
  assetName: string;
  colors: ClassificationColor[];
  noDataValue?: number;
}

export const CLASSIFICATION_COLORMAPS: Record<string, ClassificationColor[]> = {
  mtbs: [
    { value: 0, r: 0, g: 0, b: 0, description: "No Data" },
    { value: 1, r: 0, g: 168, b: 132, description: "Unburned to Low" },
    { value: 2, r: 255, g: 255, b: 190, description: "Low" },
    { value: 3, r: 255, g: 211, b: 127, description: "Moderate" },
    { value: 4, r: 255, g: 85, b: 0, description: "High" },
    { value: 5, r: 38, g: 115, b: 0, description: "Increased Greenness" },
    { value: 6, r: 163, g: 163, b: 163, description: "Non-Processing Area" },
  ],
  "io-lulc-annual-v02": [
    { value: 0, r: 0, g: 0, b: 0, description: "No Data" },
    { value: 1, r: 65, g: 155, b: 223, description: "Water" },
    { value: 2, r: 57, g: 125, b: 73, description: "Trees" },
    { value: 4, r: 122, g: 135, b: 198, description: "Flooded Vegetation" },
    { value: 5, r: 228, g: 150, b: 53, description: "Crops" },
    { value: 7, r: 196, g: 40, b: 27, description: "Built Area" },
    { value: 8, r: 165, g: 155, b: 143, description: "Bare Ground" },
    { value: 9, r: 179, g: 214, b: 249, description: "Snow/Ice" },
    { value: 10, r: 226, g: 226, b: 226, description: "Clouds" },
    { value: 11, r: 201, g: 212, b: 121, description: "Rangeland" },
  ],
  "io-lulc": [
    { value: 0, r: 0, g: 0, b: 0, description: "No Data" },
    { value: 1, r: 65, g: 155, b: 223, description: "Water" },
    { value: 2, r: 57, g: 125, b: 73, description: "Trees" },
    { value: 4, r: 122, g: 135, b: 198, description: "Flooded Vegetation" },
    { value: 5, r: 228, g: 150, b: 53, description: "Crops" },
    { value: 7, r: 196, g: 40, b: 27, description: "Built Area" },
    { value: 8, r: 165, g: 155, b: 143, description: "Bare Ground" },
    { value: 9, r: 179, g: 214, b: 249, description: "Snow/Ice" },
    { value: 10, r: 226, g: 226, b: 226, description: "Clouds" },
    { value: 11, r: 201, g: 212, b: 121, description: "Rangeland" },
  ],
  "nrcan-landcover": [
    { value: 0, r: 0, g: 0, b: 0, description: "No Data" },
    { value: 1, r: 0, g: 61, b: 0, description: "Temperate/Sub-polar Needleleaf" },
    { value: 2, r: 148, g: 156, b: 112, description: "Sub-polar Taiga Needleleaf" },
    { value: 5, r: 0, g: 99, b: 0, description: "Temperate/Sub-polar Broadleaf Deciduous" },
    { value: 6, r: 30, g: 171, b: 5, description: "Mixed Forest" },
    { value: 8, r: 141, g: 144, b: 35, description: "Temperate/Sub-polar Shrubland" },
    { value: 10, r: 212, g: 206, b: 121, description: "Temperate/Sub-polar Grassland" },
    { value: 11, r: 117, g: 153, b: 130, description: "Sub-polar/Polar Shrubland-Lichen-Moss" },
    { value: 12, r: 219, g: 206, b: 177, description: "Sub-polar/Polar Grassland-Lichen-Moss" },
    { value: 13, r: 186, g: 212, b: 219, description: "Sub-polar/Polar Barren-Lichen-Moss" },
    { value: 14, r: 107, g: 163, b: 138, description: "Wetland" },
    { value: 15, r: 255, g: 255, b: 0, description: "Cropland" },
    { value: 16, r: 194, g: 161, b: 112, description: "Barren Lands" },
    { value: 17, r: 255, g: 0, b: 0, description: "Urban" },
    { value: 18, r: 0, g: 0, b: 200, description: "Water" },
    { value: 19, r: 255, g: 255, b: 255, description: "Snow and Ice" },
  ],
};

export const COLLECTION_TEMPORAL_INFO: Record<string, TemporalInfo> = {
  // Static DEMs - single snapshot in time
  "cop-dem-glo-30": {
    type: "static",
    description: "Static global DEM (single release)",
    fixedDate: "2021-04-22",
    notes: "Use any datetime range that includes 2021",
  },
  "cop-dem-glo-90": {
    type: "static",
    description: "Static global DEM (single release)",
    fixedDate: "2021-04-22",
    notes: "Use any datetime range that includes 2021",
  },
  "alos-dem": {
    type: "static",
    description: "Static global DEM from JAXA ALOS PRISM",
    fixedDate: "2016-12-07",
    notes: "Use datetime range including 2016 (e.g., 2016-01-01/2016-12-31)",
  },
  nasadem: {
    type: "static",
    description: "Static global DEM (SRTM reprocessed)",
    fixedDate: "2000-02-20",
    notes: "Use datetime range including 2000 (e.g., 2000-01-01/2000-12-31)",
  },
  "3dep-seamless": {
    type: "static",
    description: "Static US elevation mosaic",
    fixedDate: "2012-01-01",
    notes: "Use datetime range including 2012",
  },
  "3dep-lidar-dtm": {
    type: "irregular",
    description: "Lidar-derived terrain model, varies by region",
    notes: "Coverage dates vary by location. Try broad datetime ranges.",
  },
  "3dep-lidar-dsm": {
    type: "irregular",
    description: "Lidar-derived surface model, varies by region",
    notes: "Coverage dates vary by location. Try broad datetime ranges.",
  },

  // NAIP - annual aerial imagery, varies by state
  naip: {
    type: "state-varies",
    description: "US aerial imagery captured on ~3-year cycle per state",
    validYears: [
      2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023,
    ],
    notes:
      "Coverage varies by state/year. Each state imaged every 2-3 years. Use full year ranges (e.g., 2021-01-01/2021-12-31).",
  },

  // Land cover products - typically annual or multi-year
  "io-lulc-annual-v02": {
    type: "annual",
    description: "Annual global land cover (10m)",
    validYears: [2017, 2018, 2019, 2020, 2021, 2022, 2023],
    notes: "One mosaic per year. Use single year datetime range.",
  },
  "io-lulc": {
    type: "annual",
    description: "Annual global land cover (10m)",
    validYears: [2017, 2018, 2019, 2020, 2021],
    notes: "One mosaic per year. Use single year datetime range.",
  },
  "esa-worldcover": {
    type: "static",
    description: "Global land cover (10m) - single 2020/2021 mosaic",
    fixedDate: "2021-01-01",
    notes: "Single global mosaic. Use any datetime range that includes 2021.",
  },
  mtbs: {
    type: "irregular",
    description: "US wildfire burn severity, varies by fire/year",
    notes:
      "Coverage depends on fire locations. Try broad datetime ranges (e.g., 2010-01-01/2023-12-31).",
  },
};

function latLonToQuadkey(lat: number, lon: number, zoom: number): string {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, zoom)
  );
  let quadkey = "";
  for (let i = zoom; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadkey += digit.toString();
  }
  return quadkey;
}

/**
 * Convert a bounding box to a list of quadkeys covering the area
 * @param bbox - Bounding box [west, south, east, north]
 * @param zoom - Zoom level
 * @returns Array of quadkey strings
 */
export function bboxToQuadkeys(bbox: [number, number, number, number], zoom: number = 9): string[] {
  const [west, south, east, north] = bbox;
  const quadkeys = new Set<string>();
  const step = Math.max((east - west) / 10, (north - south) / 10, 0.1);
  for (let lon = west; lon <= east; lon += step) {
    for (let lat = south; lat <= north; lat += step) {
      quadkeys.add(latLonToQuadkey(lat, lon, zoom));
    }
  }
  quadkeys.add(latLonToQuadkey(south, west, zoom));
  quadkeys.add(latLonToQuadkey(south, east, zoom));
  quadkeys.add(latLonToQuadkey(north, west, zoom));
  quadkeys.add(latLonToQuadkey(north, east, zoom));
  return Array.from(quadkeys);
}

/**
 * Get the region name for a quadkey based on its first digit
 * @param quadkey - The quadkey string
 * @returns Region name URL-encoded
 */
export function getRegionNameForQuadkey(quadkey: string): string {
  const firstDigit = quadkey[0];
  if (firstDigit === "0") {
    return "United%20States";
  } else if (firstDigit === "1") {
    return "Europe";
  } else if (firstDigit === "2") {
    return "Asia";
  } else {
    return "Africa";
  }
}

/**
 * List blob files in an Azure storage container with a given prefix
 * @param storageAccount - Storage account name
 * @param container - Container name
 * @param prefix - Prefix to filter blobs
 * @param sasToken - SAS token for authentication
 * @returns Array of blob names ending with .parquet
 */
export async function listBlobFiles(
  storageAccount: string,
  container: string,
  prefix: string,
  sasToken: string
): Promise<string[]> {
  const listUrl = `https://${storageAccount}.blob.core.windows.net/${container}?restype=container&comp=list&prefix=${prefix}&${sasToken}`;
  const response = await fetch(listUrl);
  if (!response.ok) {
    throw new Error(`Failed to list blobs: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const blobMatches = text.match(/<Name>([^<]+)<\/Name>/g);
  if (!blobMatches) {
    return [];
  }
  const files = blobMatches.map((m) => m.replace(/<\/?Name>/g, ""));
  return files.filter((name) => name.endsWith(".parquet"));
}

/**
 * Convert a hex color string to RGB values
 * @param hex - Hex color string (with or without #)
 * @returns RGB object with r, g, b properties
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  hex = hex.replace("#", "");
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Infer the STAC collection ID from an asset URL
 * @param assetUrl - The asset URL
 * @returns Collection ID or null if not recognized
 */
export function inferCollectionFromUrl(assetUrl: string): string | null {
  const urlLower = assetUrl.toLowerCase();
  if (urlLower.includes("sentinel2-l2")) return "sentinel-2-l2a";
  if (urlLower.includes("landsat-c2")) return "landsat-c2-l2";
  if (urlLower.includes("sentinel1-grd-rtc") || urlLower.includes("sentinel1euwestrtc"))
    return "sentinel-1-rtc";
  if (urlLower.includes("sentinel1-grd") && !urlLower.includes("rtc")) return "sentinel-1-grd";
  if (urlLower.includes("naip")) return "naip";
  if (urlLower.includes("daymet")) return "daymet-daily-hi";
  if (urlLower.includes("copernicus-dem") || urlLower.includes("elevationeuwest"))
    return "cop-dem-glo-30";
  if (urlLower.includes("modis")) return "modis-09A1-061";
  return null;
}

export const CATEGORICAL_PALETTE = [
  { r: 166, g: 206, b: 227 },
  { r: 31, g: 120, b: 180 },
  { r: 178, g: 223, b: 138 },
  { r: 51, g: 160, b: 44 },
  { r: 251, g: 154, b: 153 },
  { r: 227, g: 26, b: 28 },
  { r: 253, g: 191, b: 111 },
  { r: 255, g: 127, b: 0 },
  { r: 202, g: 178, b: 214 },
  { r: 106, g: 61, b: 154 },
  { r: 255, g: 255, b: 153 },
  { r: 177, g: 89, b: 40 },
  { r: 141, g: 211, b: 199 },
  { r: 255, g: 237, b: 111 },
  { r: 190, g: 186, b: 218 },
  { r: 128, g: 177, b: 211 },
  { r: 253, g: 180, b: 98 },
  { r: 179, g: 222, b: 105 },
  { r: 252, g: 205, b: 229 },
  { r: 188, g: 128, b: 189 },
];
