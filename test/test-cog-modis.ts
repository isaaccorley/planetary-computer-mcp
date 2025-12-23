#!/usr/bin/env bun
/**
 * Test MODIS collections with multiple AOIs
 * Collections: modis-09A1-061, and other MODIS datasets
 */
import { spawn } from "child_process";
import path from "path";
import * as readline from "readline";

const OUTPUT_DIR = path.resolve(process.cwd(), "samples/aoi-tests");
const _AOI_FALLBACKS: Record<string, string[]> = {
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
    bbox: [-122.42, 37.78, -122.41, 37.79] as [number, number, number, number],
    desc: "San Francisco block",
  },
  tiny_nyc: {
    name: "tiny-nyc",
    bbox: [-74.01, 40.75, -74.0, 40.76] as [number, number, number, number],
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
    bbox: [-87.7, 41.8, -87.6, 41.9] as [number, number, number, number],
    desc: "Chicago area",
  },

  // Large (~20-60km) - regional
  large_bay: {
    name: "large-bay",
    bbox: [-122.6, 37.4, -122.0, 37.9] as [number, number, number, number],
    desc: "SF Bay Area",
  },
  large_rockies: {
    name: "large-rockies",
    bbox: [-105.5, 39.5, -104.5, 40.5] as [number, number, number, number],
    desc: "Rocky Mountains",
  },

  // Extra large (~100km+) - continental
  xlarge_southwest: {
    name: "xlarge-southwest",
    bbox: [-112.5, 33.0, -111.0, 34.5] as [number, number, number, number],
    desc: "Arizona desert",
  },

  // Coastal/terrain variety
  coastal_miami: {
    name: "coastal-miami",
    bbox: [-80.3, 25.7, -80.1, 25.9] as [number, number, number, number],
    desc: "Miami coast",
  },

  // Mountain/alpine
  mountain_alps: {
    name: "mountain-alps",
    bbox: [6.8, 45.8, 7.2, 46.2] as [number, number, number, number],
    desc: "Alps",
  },
  mountain_himalayas: {
    name: "mountain-himalayas",
    bbox: [86.8, 27.9, 87.2, 28.3] as [number, number, number, number],
    desc: "Himalayas",
  },

  // Rural/agricultural
  rural_iowa: {
    name: "rural-iowa",
    bbox: [-93.7, 41.9, -93.5, 42.1] as [number, number, number, number],
    desc: "Iowa farmland",
  },

  // High latitude
  high_lat_alaska: {
    name: "high-lat-alaska",
    bbox: [-150.0, 61.0, -149.0, 62.0] as [number, number, number, number],
    desc: "Alaska",
  },
  high_lat_canada: {
    name: "high-lat-canada",
    bbox: [-120.0, 60.0, -119.0, 61.0] as [number, number, number, number],
    desc: "Canada Arctic",
  },

  // International
  africa_lagos: {
    name: "africa-lagos",
    bbox: [3.3, 6.4, 3.5, 6.6] as [number, number, number, number],
    desc: "Lagos, Nigeria",
  },
  asia_india: {
    name: "asia-india",
    bbox: [77.1, 28.5, 77.3, 28.7] as [number, number, number, number],
    desc: "Delhi, India",
  },
};

// MODIS collection test configurations
const COLLECTION_TESTS = [
  // MODIS Surface Reflectance - larger AOIs work better for low-resolution data
  {
    collection: "modis-09A1-061",
    datetime: "2024-06-01/2024-06-30",
    aois: ["large_bay", "large_rockies", "xlarge_southwest"], // Larger AOIs for 500m resolution
    max_cloud: 50,
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
    let initialized = false;

    const send = (msg: any) => {
      proc.stdin.write(JSON.stringify(msg) + "\n");
    };

    const receive = (id: number): Promise<MCPResponse> => {
      return new Promise((resolve, _reject) => {
        const check = () => {
          if (responses.has(id)) {
            resolve(responses.get(id)!);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    };

    rl.on("line", (line) => {
      try {
        const resp = JSON.parse(line) as MCPResponse;
        responses.set(resp.id, resp);
      } catch {
        // Ignore non-JSON lines
      }
    });

    proc.stderr.on("data", (data) => {
      const output = data.toString();
      if (output.includes("Planetary Computer MCP Server running on stdio")) {
        initialized = true;
      }
    });

    const cleanup = () => {
      proc.kill();
      rl.close();
    };

    const checkInitialized = () => {
      if (initialized) {
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
        receive(1).then(() => {
          send({ jsonrpc: "2.0", id: 2, method: "notifications/initialized" });
          receive(2).then(() => {
            send({ jsonrpc: "2.0", id: 3, method: "tools/list" });
            receive(3).then(() => {
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

              receive(10).then((resp) => {
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
                    .join("");

                  if (combinedText.includes("Successfully downloaded visual")) {
                    resolve({ success: true, message: combinedText });
                  } else {
                    resolve({ success: false, error: `Unexpected response: ${combinedText}` });
                  }
                }
              });
            });
          });
        });
      } else {
        setTimeout(checkInitialized, 100);
      }
    };

    checkInitialized();
  });
}

async function runCollectionTests() {
  console.log("=== MODIS Collection Testing ===\n");

  const collections = [...new Set(COLLECTION_TESTS.map((t) => t.collection))];
  console.log(`Testing MODIS collections: ${collections.join(", ")}\n`);

  const results: Array<{
    collection: string;
    aoi: string;
    success: boolean;
    error?: string;
    message?: string;
  }> = [];

  for (const test of COLLECTION_TESTS) {
    console.log(`--- ${test.collection} ---`);

    for (const aoiName of test.aois) {
      const aoi = AOIS[aoiName as keyof typeof AOIS];
      if (!aoi) {
        console.log(`  [${aoiName}] AOI not found, skipping...`);
        continue;
      }

      const outputName = `${test.collection}_${aoi.name}`;
      const lat = (aoi.bbox[1] + aoi.bbox[3]) / 2;
      const lonDiff = aoi.bbox[2] - aoi.bbox[0];
      const latDiff = aoi.bbox[3] - aoi.bbox[1];
      const widthKm = lonDiff * 111 * Math.cos((lat * Math.PI) / 180);
      const heightKm = latDiff * 111;
      console.log(
        `  [${aoi.name}] ${aoi.desc} (${Math.round(widthKm)}x${Math.round(heightKm)}km)...`
      );

      const result = await runSingleTest(
        test.collection,
        aoi.bbox,
        test.datetime,
        outputName,
        test.max_cloud
      );

      results.push({
        collection: test.collection,
        aoi: aoi.name,
        ...result,
      });

      if (result.success) {
        console.log("    PASS");
      } else {
        console.log(`    FAIL: ${result.error}`);
      }
    }

    console.log("");
  }

  // Summary
  console.log("============================================================");
  console.log("SUMMARY");
  console.log("============================================================");
  console.log("");

  const collectionStats = new Map<string, { total: number; passed: number; failed: number }>();

  for (const result of results) {
    const stats = collectionStats.get(result.collection) || { total: 0, passed: 0, failed: 0 };
    stats.total++;
    if (result.success) {
      stats.passed++;
    } else {
      stats.failed++;
    }
    collectionStats.set(result.collection, stats);
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const [collection, stats] of collectionStats) {
    const passedTests = results.filter((r) => r.collection === collection && r.success);
    const failedTests = results.filter((r) => r.collection === collection && !r.success);

    console.log(`${collection}: ${stats.passed}/${stats.total} passed (${stats.failed} failed)`);

    for (const test of passedTests) {
      const aoi = Object.values(AOIS).find((a) => a.name === test.aoi);
      console.log(`  PASS ${test.aoi} (${aoi?.desc})`);
    }

    for (const test of failedTests) {
      const aoi = Object.values(AOIS).find((a) => a.name === test.aoi);
      console.log(`  FAIL ${test.aoi} (${aoi?.desc}): ${test.error}`);
    }

    totalPassed += stats.passed;
    totalFailed += stats.failed;
  }

  console.log("");
  console.log(`Total: ${totalPassed} passed, ${totalFailed} failed out of ${results.length}`);

  if (totalFailed > 0) {
    console.log("");
    console.log("============================================================");
    console.log("FAILURES DETAIL");
    console.log("============================================================");
    console.log("");

    for (const result of results.filter((r) => !r.success)) {
      const aoi = Object.values(AOIS).find((a) => a.name === result.aoi);
      console.log(`${result.collection} @ ${result.aoi} (${aoi?.desc})`);
      console.log(`  Error: ${result.error}`);
      console.log("");
    }
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

// Run the tests
if (import.meta.main) {
  runCollectionTests().catch((error) => {
    console.error("Test runner failed:", error);
    process.exit(1);
  });
}
