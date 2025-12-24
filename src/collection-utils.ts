import {
  ClassificationColor,
  ClassificationInfo,
  COLLECTION_TEMPORAL_INFO,
  CATEGORICAL_PALETTE,
  CLASSIFICATION_COLORMAPS,
  DEM_COLLECTIONS,
  RGB_BAND_MAPPING,
  SAR_COLLECTIONS,
  hexToRgb,
} from "./utils.js";
import { extractStorageAccountFromAsset } from "./geo-utils.js";

/**
 * Extract classification information from STAC item assets
 * @param collectionId - The collection ID
 * @param itemAssets - The item assets from STAC
 * @returns Classification info or null if not found
 */
export function extractClassificationInfo(
  collectionId: string,
  itemAssets: Record<string, any>
): ClassificationInfo | null {
  // Find asset with classification metadata
  for (const [assetName, asset] of Object.entries(itemAssets)) {
    // Check for classification:classes (ESA WorldCover style - has colors)
    if (asset["classification:classes"]?.length) {
      const classes = asset["classification:classes"] as Array<{
        value: number;
        description: string;
        "color-hint"?: string;
      }>;

      const colors: ClassificationColor[] = classes.map((c) => {
        const rgb = c["color-hint"] ? hexToRgb(c["color-hint"]) : { r: 128, g: 128, b: 128 };
        return {
          value: c.value,
          r: rgb.r,
          g: rgb.g,
          b: rgb.b,
          description: c.description,
        };
      });

      // Get nodata from raster:bands if available
      const noData = asset["raster:bands"]?.[0]?.nodata;

      return {
        assetName,
        colors,
        noDataValue: typeof noData === "number" ? noData : undefined,
      };
    }

    // Check for file:values (MTBS, IO-LULC, NRCAN style - needs predefined colors)
    if (asset["file:values"]?.length) {
      // Check if we have a predefined colormap for this collection
      const predefinedColors = CLASSIFICATION_COLORMAPS[collectionId];

      if (predefinedColors) {
        return {
          assetName,
          colors: predefinedColors,
          noDataValue: 0, // Most file:values collections use 0 as nodata
        };
      }

      // Generate colors from file:values using a categorical palette
      const values = asset["file:values"] as Array<{ values: number[]; summary: string }>;

      const colors: ClassificationColor[] = values.map((v, i) => ({
        value: v.values[0],
        r: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length].r,
        g: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length].g,
        b: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length].b,
        description: v.summary,
      }));

      return {
        assetName,
        colors,
        noDataValue: 0,
      };
    }
  }

  return null;
}

/**
 * Get temporal warning for a collection
 * @param collection - The collection ID
 * @param datetime - Optional datetime string
 * @returns Warning message or null
 */
export function getTemporalWarning(collection: string, datetime?: string): string | null {
  const info = COLLECTION_TEMPORAL_INFO[collection];
  if (!info) return null;

  let warning = `**Temporal note for ${collection}**: ${info.description}\n`;

  if (info.type === "static" && info.fixedDate) {
    warning += `This is a static dataset with a single timestamp: ${info.fixedDate}.\n`;

    // Check if user's datetime range includes the fixed date
    if (datetime) {
      const fixedYear = new Date(info.fixedDate).getFullYear();
      const userDatetimeIncludesYear = datetime.includes(String(fixedYear));
      if (!userDatetimeIncludesYear) {
        warning += `Potential issue: the datetime "${datetime}" may not include ${fixedYear}. `;
        warning += `Try: "${fixedYear}-01-01T00:00:00Z/${fixedYear}-12-31T23:59:59Z"\n`;
      }
    }
  } else if (info.type === "annual" && info.validYears) {
    warning += `Available years: ${info.validYears.join(", ")}.\n`;

    // Check if user's datetime matches available years
    if (datetime) {
      const yearMatch = datetime.match(/(\d{4})/);
      if (yearMatch) {
        const userYear = parseInt(yearMatch[1]);
        if (!info.validYears.includes(userYear)) {
          const closestYear = info.validYears.reduce((prev, curr) =>
            Math.abs(curr - userYear) < Math.abs(prev - userYear) ? curr : prev
          );
          warning += `Potential issue: year ${userYear} may not have data. Closest available: ${closestYear}.\n`;
        }
      }
    }
  } else if (info.type === "state-varies") {
    warning += `Coverage varies by location. ${info.notes || ""}\n`;
  } else if (info.type === "irregular") {
    if (info.validYears) {
      warning += `Available years: ${info.validYears.join(", ")}.\n`;
    }
  }

  if (info.notes && !warning.includes(info.notes)) {
    warning += `Note: ${info.notes}\n`;
  }

  return warning;
}

/**
 * Select the best Zarr asset from a collection
 * @param collection - The STAC collection detail
 * @returns Asset info or null
 */
export function selectZarrAsset(
  collection: any
): { name: string; href: string; storageAccount?: string } | null {
  const assets: Record<string, any> = collection.assets || {};
  const priority = ["zarr-https", "zarr-abfs", "zarr", "zarr-consolidated"];
  for (const key of priority) {
    if (assets[key]?.href) {
      return {
        name: key,
        href: assets[key].href,
        storageAccount: extractStorageAccountFromAsset(assets[key]),
      };
    }
  }
  for (const [name, asset] of Object.entries(assets)) {
    if (asset.href && asset.type?.includes("zarr")) {
      return {
        name,
        href: asset.href,
        storageAccount: extractStorageAccountFromAsset(asset),
      };
    }
  }
  return null;
}

/**
 * Get suggestion for non-optical collections
 * @param collection - The collection ID
 * @returns Suggestion message
 */
export function getNonOpticalSuggestion(collection: string): string {
  const suggestions: Record<string, string> = {
    "cop-dem-glo-30":
      "This is elevation data (DEM). Use download_raster with assets=['data'] to get elevation values.",
    "cop-dem-glo-90":
      "This is elevation data (DEM). Use download_raster with assets=['data'] to get elevation values.",
    "sentinel-1-rtc":
      "This is SAR radar data. Use download_raster with assets=['vv', 'vh'] for backscatter data.",
    "sentinel-1-grd":
      "This is SAR radar data. Use download_raster with assets=['vv', 'vh'] for backscatter data.",
    "alos-dem":
      "This is elevation data (DEM). Use download_raster with assets=['data'] to get elevation values.",
  };

  // Check for partial matches
  const lowerCollection = collection.toLowerCase();
  if (lowerCollection.includes("dem") || lowerCollection.includes("elevation")) {
    return "This appears to be elevation data. Use download_raster with assets=['data'] to get elevation values.";
  }
  if (lowerCollection.includes("sar") || lowerCollection.includes("sentinel-1")) {
    return "This appears to be SAR radar data. Use download_raster with assets=['vv', 'vh'] for backscatter data.";
  }

  return (
    suggestions[collection] ||
    "Use download_raster with specific asset names. Run get_collections with collection_id to see available assets."
  );
}

/**
 * Determine how to get RGB for a collection
 * @param collection - The collection ID
 * @param itemAssets - The item assets from STAC
 * @returns RGB strategy or null
 */
export function getRGBStrategy(
  collection: string,
  itemAssets: Record<string, any>
):
  | { type: "visual"; asset: string }
  | {
      type: "image";
      asset: string;
      skipNormalization: boolean;
      bandIndices?: [number, number, number];
    }
  | {
      type: "bands";
      assets: { red: string; green: string; blue: string };
      needsNormalization: boolean;
    }
  | { type: "dem"; asset: string }
  | { type: "classified"; classInfo: ClassificationInfo }
  | { type: "sar"; vv: string; vh: string }
  | null {
  // 0. Check if this is a SAR collection (VV/VH false color)
  if (SAR_COLLECTIONS.has(collection)) {
    // SAR uses VV, VH bands - create false color composite
    if (itemAssets["vv"] && itemAssets["vh"]) {
      return { type: "sar", vv: "vv", vh: "vh" };
    }
  }

  // 0.5. Check if this is a DEM collection
  if (DEM_COLLECTIONS.has(collection)) {
    // For DEM collections, always try to use "data" asset as it's the most common
    // The download handler will handle cases where the asset doesn't exist
    return { type: "dem", asset: "data" };
  }

  // 0.5. Check for classified/categorical data (before checking for visual assets)
  // This handles land cover, burn severity, etc.
  const classInfo = extractClassificationInfo(collection, itemAssets);
  if (classInfo) {
    return { type: "classified", classInfo };
  }

  // 1. Check for explicit visual/TCI asset
  if (itemAssets["visual"]) {
    return { type: "visual", asset: "visual" };
  }

  // 1.5. Explicit NAIP handling - RGB bands are indices (0, 1, 2)
  if (collection === "naip") {
    // For NAIP, always try to use "image" asset as it's the most common
    // The download handler will handle cases where the asset doesn't exist
    return { type: "image", asset: "image", skipNormalization: true, bandIndices: [0, 1, 2] };
  }

  // 2. Check for single stacked image (NAIP-style)
  // NAIP is RGBIR and already uint8 (0-255)
  if (itemAssets["image"] && !itemAssets["red"]) {
    // NAIP and similar RGBIR collections are already uint8
    const skipNormalization = collection === "naip";
    return { type: "image", asset: "image", skipNormalization };
  }

  // ASTER support disabled for now - projection handling needs work
  // if (collection === "aster-l1t" && itemAssets["VNIR"]) {
  //   return { type: "image", asset: "VNIR", skipNormalization: false, bandIndices: [1, 0, 2] };
  // }

  // 3. Check known collection mappings
  const mapping = RGB_BAND_MAPPING[collection];
  if (mapping) {
    return {
      type: "bands",
      assets: mapping,
      needsNormalization: collection !== "naip", // NAIP is already uint8
    };
  }

  // 4. Try to find bands by commonName in itemAssets
  const redAsset = Object.entries(itemAssets).find(
    ([_, v]) => v["eo:bands"]?.[0]?.commonName === "red"
  )?.[0];
  const greenAsset = Object.entries(itemAssets).find(
    ([_, v]) => v["eo:bands"]?.[0]?.commonName === "green"
  )?.[0];
  const blueAsset = Object.entries(itemAssets).find(
    ([_, v]) => v["eo:bands"]?.[0]?.commonName === "blue"
  )?.[0];

  if (redAsset && greenAsset && blueAsset) {
    return {
      type: "bands",
      assets: { red: redAsset, green: greenAsset, blue: blueAsset },
      needsNormalization: true,
    };
  }

  // 5. Fallback: check for red/green/blue asset names directly
  if (itemAssets["red"] && itemAssets["green"] && itemAssets["blue"]) {
    return {
      type: "bands",
      assets: { red: "red", green: "green", blue: "blue" },
      needsNormalization: true,
    };
  }

  return null;
}

/**
 * Infer appropriate assets to download for a collection when none specified
 * @param collection - The collection ID
 * @param itemAssets - The item assets from STAC
 * @returns Array of asset names to download
 */
export function inferAssetsForCollection(
  collection: string,
  itemAssets: Record<string, any>
): string[] {
  // Optical collections: prefer RGB bands
  if (RGB_BAND_MAPPING[collection]) {
    const mapping = RGB_BAND_MAPPING[collection];
    const assets = [mapping.red, mapping.green, mapping.blue];
    // Check if all assets exist
    if (assets.every((asset) => itemAssets[asset])) {
      return assets;
    }
  }

  // DEM collections: use 'data' asset
  if (DEM_COLLECTIONS.has(collection)) {
    if (itemAssets["data"]) {
      return ["data"];
    }
  }

  // SAR collections: use VV and VH polarizations
  if (SAR_COLLECTIONS.has(collection)) {
    const assets = [];
    if (itemAssets["vv"]) assets.push("vv");
    if (itemAssets["vh"]) assets.push("vh");
    if (assets.length > 0) return assets;
  }

  // Classified collections: use the classification asset
  const classificationInfo = extractClassificationInfo(collection, itemAssets);
  if (classificationInfo) {
    return [classificationInfo.assetName];
  }

  // Fallback: use the first available asset that looks like data
  const dataAssets = Object.keys(itemAssets).filter(
    (name) =>
      (!name.includes("thumbnail") &&
        !name.includes("metadata") &&
        !name.includes("info") &&
        itemAssets[name].type?.includes("tiff")) ||
      itemAssets[name].type?.includes("geotiff") ||
      name === "image" ||
      name === "data"
  );

  if (dataAssets.length > 0) {
    return [dataAssets[0]];
  }

  // Last resort: return all assets (shouldn't happen)
  return Object.keys(itemAssets).slice(0, 3);
}
