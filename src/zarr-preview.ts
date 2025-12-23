import { readFile, readdir } from "fs/promises";
import path from "path";

export type BBox = [number, number, number, number];

/**
 * Recursively find the first chunk file in a Zarr directory structure
 * @param dir - Directory to search
 * @returns Path to the first chunk file found
 */
async function findFirstChunkFile(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile()) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      try {
        const nested = await findFirstChunkFile(fullPath);
        if (nested) return nested;
      } catch {
        // continue searching
      }
    }
  }
  throw new Error(`No chunk files found within ${dir}`);
}

/**
 * Convert a buffer to Float64Array based on the Zarr dtype
 * @param buffer - Raw buffer data
 * @param dtype - Zarr data type string
 * @param expectedValues - Expected number of values
 * @returns Float64Array with converted values
 */
function bufferToFloat64Array(buffer: Buffer, dtype: string, expectedValues: number): Float64Array {
  const underlying = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  let source: ArrayLike<number>;
  switch (dtype) {
    case "float64":
      source = new Float64Array(underlying);
      break;
    case "float32":
      source = new Float32Array(underlying);
      break;
    case "int32":
      source = new Int32Array(underlying);
      break;
    case "uint32":
      source = new Uint32Array(underlying);
      break;
    case "int16":
      source = new Int16Array(underlying);
      break;
    case "uint16":
      source = new Uint16Array(underlying);
      break;
    case "int8":
      source = new Int8Array(underlying);
      break;
    case "uint8":
    case "byte":
      source = new Uint8Array(underlying);
      break;
    default:
      throw new Error(`Unsupported Zarr dtype '${dtype}'`);
  }
  if ((source as any).length < expectedValues) {
    throw new Error(
      `Chunk too small. Expected ${expectedValues} values, found ${(source as any).length}`
    );
  }
  const result = new Float64Array(expectedValues);
  for (let i = 0; i < expectedValues; i++) {
    result[i] = Number((source as any)[i]);
  }
  return result;
}

export function computeDisplayRange(values: Float64Array): { min: number; max: number } {
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(values.length / 100000));
  for (let i = 0; i < values.length; i += step) {
    const v = values[i];
    if (Number.isFinite(v)) {
      sample.push(v);
    }
  }
  if (sample.length === 0) {
    return { min: 0, max: 1 };
  }
  sample.sort((a, b) => a - b);
  const loIdx = Math.floor(sample.length * 0.02);
  const hiIdx = Math.floor(sample.length * 0.98);
  const min = sample[loIdx] ?? sample[0];
  const max = sample[hiIdx] ?? sample[sample.length - 1];
  if (max <= min) {
    return { min, max: min + 1 };
  }
  return { min, max };
}

type ColorPalette = "default" | "ylgnbu";

/**
 * Get RGB color from a palette at a normalized position
 * @param palette - Color palette name
 * @param t - Normalized value between 0 and 1
 * @returns RGB tuple
 */
function getColorFromPalette(palette: ColorPalette, t: number): [number, number, number] {
  const defaultStops = [
    { pos: 0, r: 49, g: 54, b: 149 },
    { pos: 0.25, r: 69, g: 117, b: 180 },
    { pos: 0.5, r: 116, g: 173, b: 209 },
    { pos: 0.75, r: 244, g: 109, b: 67 },
    { pos: 1, r: 165, g: 0, b: 38 },
  ];
  const ylgnbuStops = [
    { pos: 0, r: 255, g: 255, b: 229 },
    { pos: 0.25, r: 204, g: 235, b: 197 },
    { pos: 0.5, r: 102, g: 194, b: 164 },
    { pos: 0.75, r: 44, g: 162, b: 191 },
    { pos: 1, r: 4, g: 90, b: 141 },
  ];
  const stops = palette === "ylgnbu" ? ylgnbuStops : defaultStops;
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const lower = stops[i];
    const upper = stops[i + 1];
    if (clamped >= lower.pos && clamped <= upper.pos) {
      const span = upper.pos - lower.pos || 1;
      const f = (clamped - lower.pos) / span;
      return [
        Math.round(lower.r + (upper.r - lower.r) * f),
        Math.round(lower.g + (upper.g - lower.g) * f),
        Math.round(lower.b + (upper.b - lower.b) * f),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last.r, last.g, last.b];
}

export function createHeatmapBuffer(
  slice: Float64Array,
  width: number,
  height: number,
  minValue: number,
  maxValue: number,
  palette: ColorPalette = "default"
): Buffer {
  const buffer = Buffer.alloc(width * height * 4);
  const range = maxValue - minValue || 1;
  for (let idx = 0; idx < slice.length; idx++) {
    const value = slice[idx];
    const offset = idx * 4;
    if (!Number.isFinite(value)) {
      buffer[offset + 3] = 0;
      continue;
    }
    const normalized = (value - minValue) / range;
    const [r, g, b] = getColorFromPalette(palette, normalized);
    buffer[offset] = r;
    buffer[offset + 1] = g;
    buffer[offset + 2] = b;
    buffer[offset + 3] = 255;
  }
  return buffer;
}

export interface LoadedZarrSlice {
  slice: Float64Array;
  width: number;
  height: number;
  bbox: BBox;
  assetName: string | null;
}

/**
 * Load a time slice from a local Zarr dataset
 * @param assetDir - Directory containing the Zarr data
 * @param timeIndex - Time index to slice
 * @returns Loaded slice data with metadata
 */
export async function loadLocalZarrSlice(
  assetDir: string,
  timeIndex: number
): Promise<LoadedZarrSlice> {
  const meta = JSON.parse(await readFile(path.join(assetDir, "zarr.json"), "utf-8")) as {
    shape?: number[];
    data_type?: string;
    attributes?: Record<string, unknown>;
  };

  if (!Array.isArray(meta.shape) || meta.shape.length !== 3) {
    throw new Error("This helper expects a 3D Zarr array (time, y, x).");
  }
  const [timeLen, height, width] = meta.shape.map((value) => Number(value));
  if (!Number.isFinite(timeLen) || !Number.isFinite(height) || !Number.isFinite(width)) {
    throw new Error("Invalid Zarr shape metadata.");
  }
  if (timeIndex < 0 || timeIndex >= timeLen) {
    throw new Error(`time_index ${timeIndex} is out of range (0-${timeLen - 1}).`);
  }
  const bbox = meta.attributes?.["requested_bbox"];
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every((value) => typeof value === "number")
  ) {
    throw new Error("Zarr subset is missing requested_bbox metadata.");
  }

  const chunkDir = path.join(assetDir, "c");
  const chunkPath = await findFirstChunkFile(chunkDir);
  const rawChunk = await readFile(chunkPath);
  const totalValues = timeLen * height * width;
  const dtype = typeof meta.data_type === "string" ? meta.data_type : "float32";
  const denseArray = bufferToFloat64Array(rawChunk, dtype, totalValues);
  const sliceStart = timeIndex * width * height;
  const sliceEnd = sliceStart + width * height;
  const slice = denseArray.subarray(sliceStart, sliceEnd);

  const assetName =
    typeof meta.attributes?.["source_asset"] === "string"
      ? (meta.attributes?.["source_asset"] as string)
      : null;

  return {
    slice,
    width,
    height,
    bbox: bbox as BBox,
    assetName,
  };
}
