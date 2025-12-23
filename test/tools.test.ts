import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  bboxToQuadkeys,
  CATEGORICAL_PALETTE,
  CLASSIFICATION_COLORMAPS,
  DEM_COLLECTIONS,
  getRegionNameForQuadkey,
  hexToRgb,
  inferCollectionFromUrl,
  RGB_BAND_MAPPING,
  SAR_COLLECTIONS,
} from "../src/utils.js";
import {
  computeDisplayRange,
  createHeatmapBuffer,
  loadLocalZarrSlice,
} from "../src/zarr-preview.js";
// Import utility functions from index.ts for testing
import {
  bufferHasSignal,
  buildSearchCacheKey,
  getEra5MonthId,
  getProjectionFromGeoKeys,
  validateFilePath,
} from "../src/index.js";

describe("Utility helpers", () => {
  describe("bboxToQuadkeys", () => {
    it("produces quadkeys for bounding boxes", () => {
      const bbox: [number, number, number, number] = [-122.5, 47.0, -122.0, 47.5];
      const quadkeys = bboxToQuadkeys(bbox, 9);
      assert(quadkeys.length >= 4);
      const unique = new Set(quadkeys);
      assert.strictEqual(unique.size, quadkeys.length);
      quadkeys.forEach((qk) => {
        assert(/^[0-3]+$/.test(qk));
      });
    });

    it("anchors each geographic quadrant to a region label", () => {
      assert.strictEqual(getRegionNameForQuadkey("0"), "United%20States");
      assert.strictEqual(getRegionNameForQuadkey("1"), "Europe");
      assert.strictEqual(getRegionNameForQuadkey("2"), "Asia");
      assert.strictEqual(getRegionNameForQuadkey("3"), "Africa");
    });
  });

  describe("collection inference", () => {
    it("detects well-known collections from asset URLs", () => {
      assert.strictEqual(
        inferCollectionFromUrl("https://sentinel2-l2.blob.core.windows.net/path/B04.tif"),
        "sentinel-2-l2a"
      );
      assert.strictEqual(
        inferCollectionFromUrl("https://landsat-c2.blob.core.windows.net/path/red.tif"),
        "landsat-c2-l2"
      );
      assert.strictEqual(
        inferCollectionFromUrl("https://sentinel1-grd-rtc/path/vv.tif"),
        "sentinel-1-rtc"
      );
      assert.strictEqual(inferCollectionFromUrl("https://example.com/unknown.tif"), null);
    });

    it("tracks RGB mapping strategies", () => {
      assert.deepStrictEqual(RGB_BAND_MAPPING["sentinel-2-l2a"], {
        red: "B04",
        green: "B03",
        blue: "B02",
      });
      assert.deepStrictEqual(RGB_BAND_MAPPING["hls2-l30"], {
        red: "B04",
        green: "B03",
        blue: "B02",
      });
      assert.strictEqual(RGB_BAND_MAPPING["modis-09A1-061"]?.green, "sur_refl_b04");
    });
  });

  describe("classification palettes", () => {
    it("provides consistent categorical palette ranges", () => {
      CATEGORICAL_PALETTE.forEach((entry) => {
        assert(entry.r >= 0 && entry.r <= 255);
        assert(entry.g >= 0 && entry.g <= 255);
        assert(entry.b >= 0 && entry.b <= 255);
      });
    });

    it("exposes named colormaps for supported collections", () => {
      const mtbsColors = CLASSIFICATION_COLORMAPS["mtbs"];
      assert.ok(mtbsColors.length > 0);
      const firstClass = mtbsColors[0];
      assert.strictEqual(firstClass.description, "No Data");
      assert.strictEqual(firstClass.value, 0);
    });

    it("parses hex colors correctly", () => {
      const { r, g, b } = hexToRgb("419BDF");
      assert.strictEqual(r, 65);
      assert.strictEqual(g, 155);
      assert.strictEqual(b, 223);
    });
  });

  describe("collection sets", () => {
    it("flags DEM collections", () => {
      assert(DEM_COLLECTIONS.has("cop-dem-glo-30"));
      assert(!DEM_COLLECTIONS.has("sentinel-2-l2a"));
    });

    it("flags SAR collections", () => {
      assert(SAR_COLLECTIONS.has("sentinel-1-rtc"));
      assert(SAR_COLLECTIONS.has("sentinel-1-grd"));
      assert(!SAR_COLLECTIONS.has("naip"));
    });
  });
});

describe("Zarr preview helpers", () => {
  it("loads local slices and generates preview buffers", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "pc-zarr-preview-"));
    const assetDir = path.join(tmpRoot, "tmax");
    try {
      await mkdir(path.join(assetDir, "c", "0", "0"), { recursive: true });
      const meta = {
        shape: [2, 2, 3],
        data_type: "float32",
        attributes: {
          requested_bbox: [-105.5, 39.5, -105.0, 40.0],
          source_asset: "tmax",
        },
      };
      await writeFile(path.join(assetDir, "zarr.json"), JSON.stringify(meta, null, 2));

      const values = Float32Array.from([0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15]);
      const chunkPath = path.join(assetDir, "c", "0", "0", "0");
      await writeFile(chunkPath, Buffer.from(values.buffer));

      const { slice, width, height, bbox, assetName } = await loadLocalZarrSlice(assetDir, 1);
      assert.strictEqual(width, 3);
      assert.strictEqual(height, 2);
      assert.deepStrictEqual(bbox, [-105.5, 39.5, -105.0, 40.0]);
      assert.strictEqual(assetName, "tmax");
      assert.strictEqual(slice.length, width * height);
      assert.strictEqual(slice[0], 10);
      assert.strictEqual(slice[5], 15);

      const range = computeDisplayRange(slice);
      assert(range.max > range.min);

      const buffer = createHeatmapBuffer(slice, width, height, range.min, range.max);
      assert.strictEqual(buffer.length, width * height * 4);
      // ensure opaque pixels were written
      assert(buffer.some((value, idx) => idx % 4 === 3 && value === 255));

      const precipBuffer = createHeatmapBuffer(Float64Array.from([0, 5]), 1, 2, 0, 10, "ylgnbu");
      assert.strictEqual(precipBuffer.length, 8);
      assert.strictEqual(precipBuffer[0], 255);
      assert.strictEqual(precipBuffer[1], 255);
      assert.strictEqual(precipBuffer[2], 229);
      assert.strictEqual(precipBuffer[3], 255);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("Index utility functions", () => {
  describe("validateFilePath", () => {
    it("validates safe file paths", () => {
      assert.strictEqual(validateFilePath("/tmp/test.txt"), true);
      assert.strictEqual(validateFilePath("./relative/path.txt"), true);
      assert.strictEqual(validateFilePath("safe-file.txt"), true);
    });

    it("rejects directory traversal attempts", () => {
      assert.strictEqual(validateFilePath("../escape.txt"), false);
      assert.strictEqual(validateFilePath("../../../etc/passwd"), false);
      assert.strictEqual(validateFilePath("./../escape.txt"), false);
    });

    it("validates paths within allowed directories", () => {
      assert.strictEqual(validateFilePath("/tmp/allowed/file.txt", ["/tmp"]), true);
      assert.strictEqual(validateFilePath("/tmp/allowed/file.txt", ["/tmp/allowed"]), true);
      assert.strictEqual(validateFilePath("/tmp/forbidden/file.txt", ["/tmp/allowed"]), false);
    });

    it("handles invalid paths gracefully", () => {
      assert.strictEqual(validateFilePath(""), false);
      assert.strictEqual(validateFilePath(null as any), false);
    });
  });

  describe("buildSearchCacheKey", () => {
    it("generates consistent cache keys for identical parameters", () => {
      const params1 = {
        collections: ["sentinel-2-l2a"],
        bbox: [-122.5, 47.0, -122.0, 47.5] as [number, number, number, number],
        datetime: "2024-01-01/2024-01-31",
        limit: 10,
      };
      const params2 = {
        collections: ["sentinel-2-l2a"],
        bbox: [-122.5, 47.0, -122.0, 47.5] as [number, number, number, number],
        datetime: "2024-01-01/2024-01-31",
        limit: 10,
      };
      assert.strictEqual(buildSearchCacheKey(params1), buildSearchCacheKey(params2));
    });

    it("generates different keys for different parameters", () => {
      const params1 = {
        collections: ["sentinel-2-l2a"],
        bbox: [-122.5, 47.0, -122.0, 47.5] as [number, number, number, number],
      };
      const params2 = {
        collections: ["landsat-c2-l2"],
        bbox: [-122.5, 47.0, -122.0, 47.5] as [number, number, number, number],
      };
      assert.notStrictEqual(buildSearchCacheKey(params1), buildSearchCacheKey(params2));
    });

    it("handles undefined and null values", () => {
      const params = { collections: [] as string[], bbox: undefined, datetime: undefined };
      const key = buildSearchCacheKey(params);
      assert.strictEqual(typeof key, "string");
      assert(key.length > 0);
    });

    it("sorts collections for consistent keys", () => {
      const params1 = { collections: ["b", "a", "c"] };
      const params2 = { collections: ["a", "b", "c"] };
      assert.strictEqual(buildSearchCacheKey(params1), buildSearchCacheKey(params2));
    });
  });

  describe("getEra5MonthId", () => {
    it("extracts year-month from datetime strings", () => {
      assert.strictEqual(getEra5MonthId("2024-06-15T10:00:00Z"), "2024-06");
      assert.strictEqual(getEra5MonthId("2023-12-01/2023-12-31"), "2023-12");
      assert.strictEqual(getEra5MonthId("2022-01-15"), "2022-01");
    });

    it("handles edge cases", () => {
      assert.strictEqual(getEra5MonthId(""), null);
      assert.strictEqual(getEra5MonthId(undefined), null);
      assert.strictEqual(getEra5MonthId("invalid-date"), null);
      assert.strictEqual(getEra5MonthId("2024-13-01"), null); // Invalid month
    });

    it("pads single-digit months", () => {
      assert.strictEqual(getEra5MonthId("2024-01-15"), "2024-01");
      assert.strictEqual(getEra5MonthId("2024-12-15"), "2024-12");
    });
  });

  describe("bufferHasSignal", () => {
    it("detects non-zero values in buffers", () => {
      assert.strictEqual(bufferHasSignal(Buffer.from([0, 0, 0, 0])), false);
      assert.strictEqual(bufferHasSignal(Buffer.from([0, 0, 1, 0])), true);
      assert.strictEqual(bufferHasSignal(Buffer.from([255, 0, 0, 0])), true);
    });

    it("handles empty buffers", () => {
      assert.strictEqual(bufferHasSignal(Buffer.alloc(0)), false);
    });

    it("handles large buffers efficiently", () => {
      const largeBuffer = Buffer.alloc(10000, 0);
      assert.strictEqual(bufferHasSignal(largeBuffer), false);
      largeBuffer[9999] = 1;
      assert.strictEqual(bufferHasSignal(largeBuffer), true);
    });
  });

  describe("getProjectionFromGeoKeys", () => {
    it("returns null for WGS84 geographic", () => {
      const geoKeys = { GeographicTypeGeoKey: 4326 };
      assert.strictEqual(getProjectionFromGeoKeys(geoKeys), null);
    });

    it("handles UTM north zones", () => {
      const geoKeys = { ProjectedCSTypeGeoKey: 32633 }; // UTM Zone 33N
      const result = getProjectionFromGeoKeys(geoKeys);
      assert(result?.includes("+proj=utm"));
      assert(result?.includes("+zone=33"));
      assert(!result?.includes("+south"));
    });

    it("handles UTM south zones", () => {
      const geoKeys = { ProjectedCSTypeGeoKey: 32733 }; // UTM Zone 33S
      const result = getProjectionFromGeoKeys(geoKeys);
      assert(result?.includes("+proj=utm"));
      assert(result?.includes("+zone=33"));
      assert(result?.includes("+south"));
    });

    it("handles Web Mercator", () => {
      const geoKeys = { ProjectedCSTypeGeoKey: 3857 };
      const result = getProjectionFromGeoKeys(geoKeys);
      assert(result?.includes("+proj=merc"));
      assert(result?.includes("+a=6378137"));
    });

    it("returns null for unsupported projections", () => {
      const geoKeys = { ProjectedCSTypeGeoKey: 99999 };
      assert.strictEqual(getProjectionFromGeoKeys(geoKeys), null);
    });
  });
});
