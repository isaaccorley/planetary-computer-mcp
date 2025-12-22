/**
 * Visualization and colormap utility functions
 */

/**
 * Terrain colormap: converts normalized elevation (0-1) to RGB
 * Uses a classic terrain palette: blue (water) -> green (lowland) -> brown (highland) -> white (snow/peaks)
 */
export function terrainColormap(t: number): [number, number, number] {
  // Clamp to 0-1
  t = Math.max(0, Math.min(1, t));

  // Define color stops
  const stops = [
    { pos: 0.0, r: 0, g: 97, b: 71 }, // Deep green (low elevation)
    { pos: 0.15, r: 16, g: 122, b: 47 }, // Forest green
    { pos: 0.3, r: 132, g: 181, b: 77 }, // Light green
    { pos: 0.45, r: 227, g: 217, b: 143 }, // Tan/beige
    { pos: 0.6, r: 185, g: 140, b: 95 }, // Brown
    { pos: 0.75, r: 139, g: 100, b: 75 }, // Dark brown
    { pos: 0.9, r: 200, g: 200, b: 200 }, // Light gray (high altitude)
    { pos: 1.0, r: 255, g: 255, b: 255 }, // White (peaks/snow)
  ];

  // Find the two stops to interpolate between
  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].pos && t <= stops[i + 1].pos) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  // Interpolate
  const range = upper.pos - lower.pos;
  const factor = range > 0 ? (t - lower.pos) / range : 0;

  return [
    Math.round(lower.r + (upper.r - lower.r) * factor),
    Math.round(lower.g + (upper.g - lower.g) * factor),
    Math.round(lower.b + (upper.b - lower.b) * factor),
  ];
}
