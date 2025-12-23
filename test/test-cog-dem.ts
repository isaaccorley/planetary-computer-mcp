#!/usr/bin/env bun
/**
 * Test DEM collections with multiple AOIs
 * Collections: cop-dem-glo-30, alos-dem
 */
import { spawn } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";
import * as readline from "readline";
import sharp from "sharp";

const OUTPUT_DIR = path.resolve(process.cwd(), "samples/aoi-tests");
const CLASSIFICATION_IMAGE_COLLECTIONS = new Set([
  "esa-worldcover",
  "io-lulc-annual-v02",
  "mtbs",
  "nrcan-landcover",
]);
const AOI_FALLBACKS: Record<string, string[]> = {
  tiny_sf: ["tiny_nyc"],
  tiny_nyc: ["tiny_sf"],
  small_seattle: ["small_denver"],
  small_denver: ["small_seattle"],
  medium_la: ["medium_chicago", "large_bay"],
  medium_chicago: ["medium_la", "large_bay"],
  large_bay: ["large_rockies"],
  large_rockies: ["xlarge_southwest"],
  xlarge_southwest: ["large_bay"],
  coastal_miami: ["small_denver", "medium_la"],
  alps: ["mountain_himalayas"],
  mountain_himalayas: ["alps"],
  rural_iowa: ["medium_chicago"],
  high_lat_alaska: ["high_lat_canada"],
  high_lat_canada: ["high_lat_alaska"],
  africa_lagos: ["asia_india"],
  asia_india: ["africa_lagos"],
};

interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: { content?: Array<{ text?: string }> };
  error?: { code: number; message: string };
}

// Different AOI sizes and locations
const AOIS = {
  // Tiny (~100m) - city block
  tiny_sf: {
    name: "tiny-sf",
    bbox: [-122.4195, 37.7749, -122.4185, 37.7759] as [number, number, number, number],
    desc: "San Francisco block",
  },
  tiny_nyc: {
    name: "tiny-nyc",
    bbox: [-74.006, 40.7128, -74.005, 40.7138] as [number, number, number, number],
    desc: "NYC block",
  },

  // Small (~1km) - neighborhood
  small_seattle: {
    name: "small-seattle",
    bbox: [-122.35, 47.6, -122.34, 47.61] as [number, number, number, number],
    desc: "Seattle downtown",
  },
  small_denver: {
    name: "small-denver",
    bbox: [-104.995, 39.74, -104.985, 39.75] as [number, number, number, number],
    desc: "Denver downtown",
  },

  // Medium (~5-10km) - district/city area
  medium_la: {
    name: "medium-la",
    bbox: [-118.3, 34.0, -118.2, 34.1] as [number, number, number, number],
    desc: "LA area",
  },
  medium_chicago: {
    name: "medium-chicago",
    bbox: [-87.7, 41.85, -87.6, 41.95] as [number, number, number, number],
    desc: "Chicago area",
  },

  // Large (~50km) - regional
  large_bay: {
    name: "large-bay",
    bbox: [-122.6, 37.4, -122.0, 37.9] as [number, number, number, number],
    desc: "SF Bay Area",
  },
  large_rockies: {
    name: "large-rockies",
    bbox: [-106.0, 39.5, -105.0, 40.5] as [number, number, number, number],
    desc: "Colorado Rockies",
  },

  // Very large (~100km+) - may exceed imagery bounds
  xlarge_southwest: {
    name: "xlarge-sw",
    bbox: [-112.5, 33.0, -111.0, 34.5] as [number, number, number, number],
    desc: "Arizona desert",
  },

  // Edge cases - coastal/water boundaries
  coastal_miami: {
    name: "coastal-miami",
    bbox: [-80.2, 25.75, -80.1, 25.85] as [number, number, number, number],
    desc: "Miami coast",
  },

  // High latitude
  high_lat_alaska: {
    name: "alaska",
    bbox: [-150.0, 61.1, -149.8, 61.3] as [number, number, number, number],
    desc: "Anchorage, AK",
  },
  high_lat_canada: {
    name: "canada-bc",
    bbox: [-123.2, 49.2, -123.0, 49.4] as [number, number, number, number],
    desc: "Vancouver, BC",
  },

  // Mountain terrain
  mountain_alps: {
    name: "alps",
    bbox: [7.5, 45.9, 7.7, 46.1] as [number, number, number, number],
    desc: "Swiss Alps",
  },
  mountain_himalayas: {
    name: "himalayas",
    bbox: [86.8, 27.9, 87.0, 28.1] as [number, number, number, number],
    desc: "Everest region",
  },

  // Agricultural/rural
  rural_iowa: {
    name: "rural-iowa",
    bbox: [-93.7, 41.9, -93.5, 42.1] as [number, number, number, number],
    desc: "Iowa farmland",
  },

  // Fire-affected (for MTBS)
  fire_ca: {
    name: "fire-ca",
    bbox: [-121.65, 39.72, -121.55, 39.82] as [number, number, number, number],
    desc: "Paradise, CA (Camp Fire)",
  },

  // Developing regions (for HREA - High Resolution Electricity Access)
  africa_lagos: {
    name: "lagos",
    bbox: [3.3, 6.4, 3.5, 6.6] as [number, number, number, number],
    desc: "Lagos, Nigeria",
  },
  asia_india: {
    name: "india",
    bbox: [77.1, 28.5, 77.3, 28.7] as [number, number, number, number],
    desc: "Delhi, India",
  },
};

// DEM collection test configurations
const COLLECTION_TESTS = [
  // DEMs - test terrain variations
  {
    collection: "cop-dem-glo-30",
    datetime: "2021-01-01/2024-12-31",
    aois: ["small_denver", "large_rockies", "mountain_alps", "mountain_himalayas", "coastal_miami"],
    max_cloud: 100,
  },
  {
    collection: "alos-dem",
    datetime: "2016-01-01/2016-12-31",
    aois: ["small_denver", "mountain_alps", "high_lat_canada"],
    max_cloud: 100,
  },
];

async function runSingleTest(
  collection: string,
  bbox: [number, number, number, number],
  datetime: string,
  outputName: string,
  maxCloudCover: number
): Promise<{ success: boolean; error?: string; message?: string }> {
  return new Promise((resolve) => {
    const proc = spawn("node", ["dist/src/index.js"], { stdio: ["pipe", "pipe", "pipe"] });
    const rl = readline.createInterface({ input: proc.stdout });

    const responses = new Map<number, MCPResponse>();
    const waiters = new Map<number, (resp: MCPResponse) => void>();

    rl.on("line", (line) => {
      try {
        const resp = JSON.parse(line) as MCPResponse;
        const waiter = waiters.get(resp.id);
        if (waiter) {
          waiters.delete(resp.id);
          waiter(resp);
        } else {
          responses.set(resp.id, resp);
        }
      } catch (error) {
        // Non-JSON line from the MCP server; ignore
        void error;
        return;
      }
    });

    proc.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    const receive = (id: number, timeout = 120000): Promise<MCPResponse> =>
      new Promise((res, rej) => {
        const existing = responses.get(id);
        if (existing) {
          responses.delete(id);
          res(existing);
          return;
        }
        const timer = setTimeout(() => {
          waiters.delete(id);
          rej(new Error("Timeout"));
        }, timeout);
        waiters.set(id, (resp) => {
          clearTimeout(timer);
          res(resp);
        });
      });

    const send = (req: any) => proc.stdin.write(JSON.stringify(req) + "\n");
    const cleanup = () => {
      try {
        proc.kill();
      } catch (error) {
        void error;
      }
    };

    (async () => {
      try {
        // Initialize
        send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-aoi", version: "1.0.0" },
          },
        });
        await receive(1);
        send({ jsonrpc: "2.0", id: 2, method: "notifications/initialized" });
        send({ jsonrpc: "2.0", id: 3, method: "tools/list" });
        await receive(3);

        // Download
        send({
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: {
            name: "download_visual",
            arguments: {
              collection,
              bbox,
              datetime,
              max_cloud_cover: maxCloudCover,
              output_filename: outputName,
              output_directory: OUTPUT_DIR,
              save_colormap: true,
            },
          },
        });

        const resp = await receive(10);
        cleanup();

        if (resp.error) {
          resolve({ success: false, error: resp.error.message });
        } else {
          const combinedText = (resp.result?.content ?? [])
            .map((entry) => {
              const anyEntry = entry as { text?: string; data?: string; json?: unknown };
              if (typeof anyEntry.text === "string") return anyEntry.text;
              if (typeof anyEntry.data === "string") return anyEntry.data;
              if (anyEntry.json) return JSON.stringify(anyEntry.json);
              return "";
            })
            .filter(Boolean)
            .join("\n");
          if (combinedText.includes("Error")) {
            resolve({ success: false, error: combinedText.split("\n")[0] });
          } else {
            resolve({ success: true, message: combinedText });
          }
        }
      } catch (e) {
        cleanup();
        resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
  });
}

function extractOutputPath(message?: string, fallbackPath?: string): string | null {
  if (message) {
    const jsonMatch = message.match(/JSON metadata:\s*({[\s\S]+})/);
    if (jsonMatch) {
      try {
        const meta = JSON.parse(jsonMatch[1]);
        if (meta?.output_path) {
          return meta.output_path;
        }
      } catch {
        // ignore parse errors
      }
    }
    const match = message.match(/to:\s*(.+)$/im);
    if (match) {
      return match[1].trim();
    }
  }
  return fallbackPath ?? null;
}

async function assertImageHasSignal(imagePath: string): Promise<void> {
  const stats = await sharp(imagePath).stats();
  const hasSignal = stats.channels.some((channel) => channel.max > 0);
  if (!hasSignal) {
    throw new Error(`Image at ${imagePath} appears empty (all zeros)`);
  }
}

async function main() {
  console.log("=== DEM Collection Testing ===\n");
  console.log("Testing DEM collections: cop-dem-glo-30, alos-dem\n");
  await mkdir(OUTPUT_DIR, { recursive: true });

  const allResults: {
    collection: string;
    requestedAoi: string;
    actualAoi: string;
    aoiDesc: string;
    bboxSize: string;
    success: boolean;
    error?: string;
    fallbackUsed?: boolean;
  }[] = [];

  for (const config of COLLECTION_TESTS) {
    console.log(`\n--- ${config.collection} ---`);

    for (const aoiKey of config.aois) {
      const aoi = AOIS[aoiKey as keyof typeof AOIS];
      if (!aoi) {
        console.log(`  WARN: Unknown AOI ${aoiKey}`);
        continue;
      }

      // Calculate approx bbox size
      const [w, s, e, n] = aoi.bbox;
      const widthKm = ((e - w) * 111 * Math.cos((((n + s) / 2) * Math.PI) / 180)).toFixed(1);
      const heightKm = ((n - s) * 111).toFixed(1);
      const bboxSize = `${widthKm}x${heightKm}km`;

      const outputBase = config.collection.replace(/-/g, "_");
      let activeAoi = aoi;
      let activeBboxSize = bboxSize;
      let outputName = `${outputBase}_${activeAoi.name}`;
      let fallbackUsed = false;
      const fallbackQueue = [...(AOI_FALLBACKS[aoiKey] ?? [])];

      console.log(`  [${aoi.name}] ${aoi.desc} (${bboxSize})...`);

      let result = await runSingleTest(
        config.collection,
        activeAoi.bbox,
        config.datetime,
        outputName,
        config.max_cloud
      );
      let success = result.success;
      let error = result.error;

      if (result.success) {
        while (success) {
          const expectedExt = CLASSIFICATION_IMAGE_COLLECTIONS.has(config.collection)
            ? ".png"
            : ".jpg";
          const fallbackPath = path.join(OUTPUT_DIR, `${outputName}${expectedExt}`);
          try {
            const imagePath = extractOutputPath(result.message, fallbackPath);
            if (!imagePath) {
              throw new Error("Unable to determine output path for verification");
            }
            await assertImageHasSignal(imagePath);
            break;
          } catch (verifyError) {
            const nextFallbackKey = fallbackQueue.shift();
            if (!nextFallbackKey) {
              success = false;
              error = verifyError instanceof Error ? verifyError.message : String(verifyError);
              break;
            }
            const fallbackAoi = AOIS[nextFallbackKey as keyof typeof AOIS];
            if (!fallbackAoi) {
              success = false;
              error = `Fallback AOI ${nextFallbackKey} is not defined`;
              break;
            }
            fallbackUsed = true;
            const previousAoiName = activeAoi.name;
            activeAoi = fallbackAoi;
            const [fw, fs, fe, fn] = fallbackAoi.bbox;
            const fallbackWidthKm = (
              (fe - fw) *
              111 *
              Math.cos((((fn + fs) / 2) * Math.PI) / 180)
            ).toFixed(1);
            const fallbackHeightKm = ((fn - fs) * 111).toFixed(1);
            activeBboxSize = `${fallbackWidthKm}x${fallbackHeightKm}km`;
            outputName = `${outputBase}_${fallbackAoi.name}`;
            console.log(
              `    Image empty for ${previousAoiName}, retrying with fallback AOI ${fallbackAoi.name} (${activeBboxSize})...`
            );
            result = await runSingleTest(
              config.collection,
              fallbackAoi.bbox,
              config.datetime,
              outputName,
              config.max_cloud
            );
            success = result.success;
            error = result.error;
            if (!result.success) {
              break;
            }
          }
        }
      }

      if (result.success && success) {
        console.log(fallbackUsed ? `    PASS (fallback: ${activeAoi.name})` : "    PASS");
      } else {
        console.log(`    FAIL: ${error}`);
      }

      allResults.push({
        collection: config.collection,
        requestedAoi: aoi.name,
        actualAoi: activeAoi.name,
        aoiDesc: activeAoi.desc,
        bboxSize: activeBboxSize,
        success: !!success && !!result.success,
        error,
        fallbackUsed,
      });
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const passed = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success).length;
  console.log(`\nTotal: ${passed} passed, ${failed} failed out of ${allResults.length}\n`);

  // Group by collection
  const byCollection = new Map<string, typeof allResults>();
  for (const r of allResults) {
    if (!byCollection.has(r.collection)) byCollection.set(r.collection, []);
    byCollection.get(r.collection)!.push(r);
  }

  for (const [collection, results] of byCollection) {
    const collPassed = results.filter((r) => r.success).length;
    const collFailed = results.filter((r) => !r.success).length;
    console.log(`\n${collection}: ${collPassed}/${results.length} passed (${collFailed} failed)`);

    for (const r of results) {
      const status = r.success ? "PASS" : "FAIL";
      const info = r.success ? "" : `: ${r.error}`;
      const locationLabel =
        r.requestedAoi === r.actualAoi ? r.actualAoi : `${r.requestedAoi}→${r.actualAoi}`;
      console.log(`  ${status} ${locationLabel} (${r.bboxSize})${info}`);
    }
  }

  // List all failures with details
  const failures = allResults.filter((r) => !r.success);
  if (failures.length > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("FAILURES DETAIL");
    console.log("=".repeat(60));
    for (const f of failures) {
      const locationLabel =
        f.requestedAoi === f.actualAoi ? f.actualAoi : `${f.requestedAoi}→${f.actualAoi}`;
      console.log(`\n${f.collection} @ ${locationLabel} (${f.aoiDesc}, ${f.bboxSize})`);
      console.log(`  Error: ${f.error}`);
    }
  }
}

main().catch(console.error);
