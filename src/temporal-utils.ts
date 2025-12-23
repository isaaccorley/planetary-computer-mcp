/**
 * Temporal and date utility functions
 */

export interface TemporalRange {
  start: number; // milliseconds since epoch
  end: number; // milliseconds since epoch
}

import { STACCollectionDetail } from "./utils.js";

/**
 * Parse a datetime range string into a TemporalRange
 */
export function parseDatetimeRangeString(datetime?: string): TemporalRange | null {
  if (!datetime) return null;
  const trimmed = datetime.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/")) {
    const [rawStart, rawEnd] = trimmed.split("/");
    const startStr = rawStart && rawStart !== ".." ? rawStart.trim() : "";
    const endStr = rawEnd && rawEnd !== ".." ? rawEnd.trim() : "";
    const startMs = startStr ? Date.parse(startStr) : Number.NEGATIVE_INFINITY;
    const endMs = endStr ? Date.parse(endStr) : Number.POSITIVE_INFINITY;
    if ((startStr && Number.isNaN(startMs)) || (endStr && Number.isNaN(endMs))) {
      return null;
    }
    return { start: Math.min(startMs, endMs), end: Math.max(startMs, endMs) };
  }
  const instant = Date.parse(trimmed);
  if (Number.isNaN(instant)) return null;
  return { start: instant, end: instant };
}

/**
 * Pad Daymet datetime to include the full day range
 */
export function maybePadDaymetDatetime(
  datetime?: string
): { datetime: string; adjusted: boolean } | null {
  if (!datetime) return null;
  const range = parseDatetimeRangeString(datetime);
  if (
    !range ||
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start !== range.end
  ) {
    return { datetime, adjusted: false };
  }
  const oneDayMs = 24 * 60 * 60 * 1000;
  const paddedEnd = range.end + oneDayMs;
  const startIso = new Date(range.start).toISOString();
  const endIso = new Date(paddedEnd).toISOString();
  return { datetime: `${startIso}/${endIso}`, adjusted: true };
}

/**
 * Get temporal ranges from a STAC collection
 */
export function getCollectionTemporalRanges(details: STACCollectionDetail): TemporalRange[] {
  const intervals = details.extent?.temporal?.interval;
  if (!Array.isArray(intervals)) return [];
  const ranges: TemporalRange[] = [];
  for (const interval of intervals) {
    if (!Array.isArray(interval)) continue;
    const [rawStart, rawEnd] = interval;
    const startMs = rawStart ? Date.parse(rawStart) : Number.NEGATIVE_INFINITY;
    const endMs = rawEnd ? Date.parse(rawEnd) : Number.POSITIVE_INFINITY;
    if ((rawStart && Number.isNaN(startMs)) || (rawEnd && Number.isNaN(endMs))) {
      continue;
    }
    ranges.push({
      start: Math.min(startMs, endMs),
      end: Math.max(startMs, endMs),
    });
  }
  return ranges;
}

/**
 * Check if two temporal ranges overlap
 */
export function rangesOverlap(a: TemporalRange, b: TemporalRange): boolean {
  return a.start <= b.end && a.end >= b.start;
}

/**
 * Format a temporal range for display
 */
export function formatTemporalRange(range: TemporalRange): string {
  const startStr = Number.isFinite(range.start)
    ? new Date(range.start).toISOString().split("T")[0]
    : "beginning";
  const endStr = Number.isFinite(range.end)
    ? new Date(range.end).toISOString().split("T")[0]
    : "present";
  return `${startStr} to ${endStr}`;
}

/**
 * Get temporal extent mismatch message
 */
export function getTemporalExtentMismatchMessage(
  details: STACCollectionDetail,
  datetime?: string
): string | null {
  const userRange = parseDatetimeRangeString(datetime);
  if (!userRange) return null;
  const extentRanges = getCollectionTemporalRanges(details);
  if (!extentRanges.length) return null;
  const overlaps = extentRanges.some((interval) => rangesOverlap(userRange, interval));
  if (overlaps) return null;
  const extentDescription = extentRanges.map(formatTemporalRange).join(" or ");
  return `Requested datetime ${datetime} does not overlap with ${details.title || details.id}'s temporal extent (${extentDescription}).`;
}

/**
 * Classify a dimension name
 */
export function classifyDimension(dimName: string): "time" | "lat" | "lon" | null {
  const lower = dimName.toLowerCase();
  if (lower.includes("time") || lower === "day" || lower === "date") return "time";
  if (
    lower.includes("lat") ||
    lower === "y" ||
    lower === "yj" ||
    lower === "rows" ||
    lower.includes("latitude")
  ) {
    return "lat";
  }
  if (
    lower.includes("lon") ||
    lower === "x" ||
    lower === "xi" ||
    lower === "cols" ||
    lower.includes("longitude")
  ) {
    return "lon";
  }
  return null;
}
