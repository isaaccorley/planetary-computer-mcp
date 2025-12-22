/**
 * STAC API result formatting utilities
 */

export interface STACItem {
  id: string;
  type: string;
  geometry: any;
  bbox?: [number, number, number, number];
  properties: any;
  assets: Record<string, any>;
  links: any[];
}

export interface STACSearchResponse {
  type: string;
  features: STACItem[];
  links: any[];
  context?: {
    matched: number;
    returned: number;
  };
}

import { STACCollectionDetail } from "./utils.js";

/**
 * Format STAC search results for display
 */
export function formatSTACResults(response: STACSearchResponse): string {
  const { features, context } = response;

  let output = `Found ${context?.returned || features.length} items`;
  if (context?.matched) {
    output += ` (${context.matched} total matches)`;
  }
  output += "\n\n";

  for (const item of features) {
    output += `## ${item.id}\n`;
    output += `- **Collection**: ${item.properties?.["proj:epsg"] ? `EPSG:${item.properties["proj:epsg"]}` : "N/A"}\n`;
    output += `- **DateTime**: ${item.properties?.datetime || "N/A"}\n`;
    output += `- **Cloud Cover**: ${item.properties?.["eo:cloud_cover"] !== undefined ? `${item.properties["eo:cloud_cover"]}%` : "N/A"}\n`;

    const assetKeys = Object.keys(item.assets || {});
    if (assetKeys.length > 0) {
      output += `- **Assets**: ${assetKeys.slice(0, 5).join(", ")}${assetKeys.length > 5 ? "..." : ""}\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Format collection details for display
 */
export function formatCollectionDetails(collection: STACCollectionDetail): string {
  const lines: string[] = [];

  lines.push(`# ${collection.title || collection.id}`);
  lines.push("");
  lines.push(`**ID**: ${collection.id}`);

  if (collection.description) {
    lines.push("");
    lines.push(
      `**Description**: ${collection.description.slice(0, 500)}${collection.description.length > 500 ? "..." : ""}`
    );
  }

  if (collection.keywords?.length) {
    lines.push("");
    lines.push(`**Keywords**: ${collection.keywords.join(", ")}`);
  }

  // Spatial extent
  if (collection.extent?.spatial?.bbox?.[0]) {
    const bbox = collection.extent.spatial.bbox[0];
    lines.push("");
    lines.push(`**Spatial Extent**: [${bbox.join(", ")}]`);
  }

  // Temporal extent
  if (collection.extent?.temporal?.interval?.[0]) {
    const interval = collection.extent.temporal.interval[0];
    lines.push(`**Temporal Extent**: ${interval[0] || "open"} to ${interval[1] || "present"}`);
  }

  // Available resolutions
  if (collection.summaries?.gsd?.length) {
    lines.push("");
    lines.push(`**Available Resolutions (GSD)**: ${collection.summaries.gsd.join("m, ")}m`);
  }

  // Band summary from summaries
  if (collection.summaries?.["eo:bands"]?.length) {
    lines.push("");
    lines.push("## Spectral Bands");
    lines.push("");
    for (const band of collection.summaries["eo:bands"]) {
      const parts = [`**${band.name}**`];
      if (band.commonName) parts.push(`(${band.commonName})`);
      if (band.gsd) parts.push(`- ${band.gsd}m`);
      if (band.centerWavelength) parts.push(`- ${band.centerWavelength}μm`);
      if (band.description) parts.push(`- ${band.description}`);
      lines.push(parts.join(" "));
    }
  }

  // Item assets (downloadable assets)
  if (collection.itemAssets) {
    lines.push("");
    lines.push("## Available Assets");
    lines.push("");

    // Group assets by type
    const visualAssets: string[] = [];
    const dataAssets: string[] = [];
    const metadataAssets: string[] = [];

    for (const [assetName, asset] of Object.entries(collection.itemAssets)) {
      const roles = asset.roles || [];
      const gsdStr = asset.gsd ? `${asset.gsd}m` : "N/A";
      const title = asset.title || assetName;

      let line = `- **${assetName}**: ${title}`;
      if (asset.gsd) line += ` (${gsdStr})`;

      // Check for visual/TCI assets
      const assetNameLower = assetName.toLowerCase();
      if (
        assetNameLower.includes("visual") ||
        assetNameLower.includes("tci") ||
        assetNameLower === "rgb"
      ) {
        line += " (visual/TCI asset)";
        visualAssets.push(line);
      } else if (roles.includes("data")) {
        dataAssets.push(line);
      } else if (roles.includes("metadata") || roles.includes("thumbnail")) {
        metadataAssets.push(line);
      } else {
        dataAssets.push(line);
      }
    }

    if (visualAssets.length > 0) {
      lines.push("### Visual/TCI Assets (recommended for LLM viewing)");
      lines.push(...visualAssets);
      lines.push("");
    }

    if (dataAssets.length > 0) {
      lines.push("### Data Assets");
      lines.push(...dataAssets);
      lines.push("");
    }

    if (metadataAssets.length > 0) {
      lines.push("### Metadata Assets");
      lines.push(...metadataAssets);
    }
  }

  return lines.join("\n");
}
