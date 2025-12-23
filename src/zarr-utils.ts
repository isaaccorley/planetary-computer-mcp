import proj4 from "proj4";
import { DAYMET_DAILY_COLLECTIONS, DAYMET_LAMBERT_PROJ } from "./utils.js";

/**
 * Zarr and array processing utility functions
 */

/**
 * Convert array-like values to number array
 */
export function toNumberArray(values: ArrayLike<number>): number[] {
  const result = new Array(values.length ?? 0);
  for (let i = 0; i < result.length; i++) {
    const val = (values as any)[i];
    result[i] = typeof val === "number" ? val : Number(val);
  }
  return result;
}

/**
 * Find index range for values within min/max bounds
 */
export function findIndexRange(
  values: number[],
  minValue: number,
  maxValue: number
): [number, number] {
  if (!values.length) {
    return [0, -1];
  }
  const ascending = values[values.length - 1] >= values[0];
  let start = 0;
  let end = values.length - 1;

  if (ascending) {
    while (start <= end && values[start] < minValue) start++;
    while (end >= start && values[end] > maxValue) end--;
  } else {
    while (start <= end && values[start] > maxValue) start++;
    while (end >= start && values[end] < minValue) end--;
  }

  return [start, end];
}

/**
 * Compute array strides from shape
 */
export function computeStrides(shape: number[]): number[] {
  const strides = new Array(shape.length);
  let stride = 1;
  for (let i = shape.length - 1; i >= 0; i--) {
    strides[i] = stride;
    stride *= shape[i];
  }
  return strides;
}

/**
 * Find range from min/max arrays
 */
export function findRangeFromMinMax(
  minVals: number[],
  maxVals: number[],
  minTarget: number,
  maxTarget: number
): [number, number] | null {
  let start = -1;
  let end = -1;
  for (let i = 0; i < minVals.length; i++) {
    if (maxVals[i] < minTarget || minVals[i] > maxTarget) {
      continue;
    }
    if (start === -1) start = i;
    end = i;
  }
  if (start === -1) {
    return null;
  }
  return [start, end];
}

/**
 * Derive index range from multi-dimensional array
 */
export function deriveIndexRangeFromMultiDim(
  values: ArrayLike<number>,
  shape: number[],
  axis: number,
  minValue: number,
  maxValue: number
): [number, number] | null {
  const axisSize = shape[axis];
  const minVals = new Array(axisSize).fill(Number.POSITIVE_INFINITY);
  const maxVals = new Array(axisSize).fill(Number.NEGATIVE_INFINITY);
  const strides = computeStrides(shape);
  const total = shape.reduce((a, b) => a * b, 1);

  for (let idx = 0; idx < total; idx++) {
    const axisIndex = Math.floor(idx / strides[axis]) % axisSize;
    const value = Number((values as any)[idx]);
    if (!Number.isFinite(value)) continue;
    if (value < minVals[axisIndex]) minVals[axisIndex] = value;
    if (value > maxVals[axisIndex]) maxVals[axisIndex] = value;
  }

  for (let i = 0; i < axisSize; i++) {
    if (!Number.isFinite(minVals[i])) minVals[i] = minVals[i - 1] ?? minValue;
    if (!Number.isFinite(maxVals[i])) maxVals[i] = maxVals[i - 1] ?? maxValue;
  }

  return findRangeFromMinMax(minVals, maxVals, minValue, maxValue);
}

/**
 * Normalize longitude value
 */
export function normalizeLongitudeValue(lon: number, minVal: number, maxVal: number): number {
  if (minVal >= -180 && maxVal <= 180) {
    return lon;
  }
  if (lon < 0) {
    return lon + 360;
  }
  return lon;
}

/**
 * Parse time units string
 */
export function parseTimeUnits(values: number[], units?: string): number[] | null {
  if (!units) return null;
  const match = units.match(/(day|hour|minute|second)s?\s+since\s+(.+)/i);
  if (!match) return null;
  const [, unit, baseStr] = match;
  const baseMs = Date.parse(baseStr.trim());
  if (Number.isNaN(baseMs)) return null;
  const factor = unit.toLowerCase().startsWith("day")
    ? 24 * 60 * 60 * 1000
    : unit.toLowerCase().startsWith("hour")
      ? 60 * 60 * 1000
      : unit.toLowerCase().startsWith("minute")
        ? 60 * 1000
        : 1000;
  return values.map((val) => baseMs + Number(val) * factor);
}

/**
 * Convert time coordinate values
 */
export function convertTimeCoordinate(
  values: number[],
  attrs: Record<string, any>
): number[] | null {
  const units =
    typeof attrs?.units === "string"
      ? attrs.units
      : typeof attrs?.Units === "string"
        ? attrs.Units
        : undefined;
  const converted = parseTimeUnits(values, units);
  return converted ?? null;
}

/**
 * Compute array statistics
 */
export function computeArrayStats(data: ArrayLike<number>): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const length = (data as any).length ?? 0;
  for (let i = 0; i < length; i++) {
    const value = Number((data as any)[i]);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === Number.POSITIVE_INFINITY) min = 0;
  if (max === Number.NEGATIVE_INFINITY) max = 0;
  return { min, max };
}

/**
 * Get array min/max values
 */
export function getArrayMinMax(values: ArrayLike<number>): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const length = (values as any).length ?? 0;
  for (let i = 0; i < length; i++) {
    const value = Number((values as any)[i]);
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === Number.POSITIVE_INFINITY) min = 0;
  if (max === Number.NEGATIVE_INFINITY) max = 0;
  return { min, max };
}
/**
 * Convert bbox to grid ranges for Daymet collections
 */
export function convertBboxToGridRanges(
  collection: string,
  bbox?: [number, number, number, number]
): { xRange?: [number, number]; yRange?: [number, number] } | null {
  if (!bbox) return null;
  if (!DAYMET_DAILY_COLLECTIONS.has(collection)) {
    return null;
  }
  const transformer = proj4("EPSG:4326", DAYMET_LAMBERT_PROJ);
  const corners = [
    transformer.forward([bbox[0], bbox[1]]),
    transformer.forward([bbox[0], bbox[3]]),
    transformer.forward([bbox[2], bbox[1]]),
    transformer.forward([bbox[2], bbox[3]]),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return {
    xRange: [Math.min(...xs), Math.max(...xs)],
    yRange: [Math.min(...ys), Math.max(...ys)],
  };
}
