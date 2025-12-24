#!/usr/bin/env bun
/**
 * Integration test for downloading Microsoft Building Footprints
 * over downtown San Antonio using the download_geometries tool.
 */
import { spawn } from "child_process";
import { access, mkdir, readFile, rm, stat } from "fs/promises";
import path from "path";

interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: { content?: Array<{ text?: string }> };
  error?: { code: number; message: string };
}

const OUTPUT_DIR = path.resolve(process.cwd(), "samples/vector-tests/ms-buildings");
const OUTPUT_FILENAME = "ms_buildings_san_antonio.geojson";
const OUTPUT_PATH = path.join(OUTPUT_DIR, OUTPUT_FILENAME);
const TEST_BBOX: [number, number, number, number] = [-98.508, 29.415, -98.48, 29.445];

async function runMsBuildingsDownload(): Promise<{ success: boolean; error?: string }> {
  return await new Promise((resolve) => {
    const proc = spawn("node", ["dist/src/index.js"], { stdio: ["pipe", "pipe", "pipe"] });
    const responses = new Map<number, MCPResponse>();
    const waiters = new Map<number, (resp: MCPResponse) => void>();

    proc.stdout.on("data", (chunk) => {
      const lines = chunk
        .toString()
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        try {
          const resp = JSON.parse(line) as MCPResponse;
          const waiter = waiters.get(resp.id);
          if (waiter) {
            waiters.delete(resp.id);
            waiter(resp);
          } else {
            responses.set(resp.id, resp);
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    proc.stderr.on("data", (data) => process.stderr.write(data));

    const receive = (id: number, timeout = 180000): Promise<MCPResponse> =>
      new Promise((res, rej) => {
        const existing = responses.get(id);
        if (existing) {
          responses.delete(id);
          res(existing);
          return;
        }
        const timer = setTimeout(() => {
          waiters.delete(id);
          rej(new Error(`Timeout waiting for response ${id}`));
        }, timeout);
        waiters.set(id, (resp) => {
          clearTimeout(timer);
          res(resp);
        });
      });

    const send = (payload: unknown) => proc.stdin.write(JSON.stringify(payload) + "\n");
    const cleanup = () => {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    };

    (async () => {
      try {
        let nextId = 0;
        const sendRequest = async (method: string, params?: Record<string, unknown>) => {
          const id = ++nextId;
          send({ jsonrpc: "2.0", id, method, params });
          return await receive(id);
        };

        await sendRequest("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-ms-buildings", version: "1.0.0" },
        });
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        await sendRequest("tools/list");

        const downloadResp = await sendRequest("tools/call", {
          name: "download_geometries",
          arguments: {
            collection: "ms-buildings",
            bbox: TEST_BBOX,
            output_format: "geojson",
            output_directory: OUTPUT_DIR,
            output_filename: OUTPUT_FILENAME,
          },
        });

        cleanup();

        if (downloadResp.error) {
          resolve({ success: false, error: downloadResp.error.message });
          return;
        }

        const payload = downloadResp.result as {
          isError?: boolean;
          content?: Array<{ text?: string }>;
        } | null;
        if (payload?.isError) {
          const errorText = (payload.content ?? [])
            .map((entry) => entry.text ?? "")
            .filter(Boolean)
            .join("\n");
          resolve({
            success: false,
            error: errorText || "download_geometries returned an error response",
          });
          return;
        }

        resolve({ success: true });
      } catch (error) {
        cleanup();
        resolve({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });
}

async function verifyGeojson(outputPath: string): Promise<number> {
  await access(outputPath);
  const stats = await stat(outputPath);
  if (stats.size === 0) {
    throw new Error(`Output file ${outputPath} is empty`);
  }

  const raw = await readFile(outputPath, "utf-8");
  const parsed = JSON.parse(raw);
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`File ${outputPath} is not a valid GeoJSON FeatureCollection`);
  }

  const featureCount = parsed.features.length as number;
  if (featureCount === 0) {
    throw new Error(`GeoJSON at ${outputPath} contains zero features`);
  }

  const geometriesWithCoords = parsed.features.filter(
    (feature: any) =>
      feature?.geometry &&
      Array.isArray(feature.geometry.coordinates) &&
      feature.geometry.coordinates.length > 0
  );
  if (geometriesWithCoords.length === 0) {
    throw new Error(`GeoJSON at ${outputPath} lacks coordinate data in geometries`);
  }

  return featureCount;
}

async function main() {
  console.log("=== MS Buildings Integration Test ===\n");

  await mkdir(OUTPUT_DIR, { recursive: true });
  await rm(OUTPUT_PATH, { force: true });

  console.log("Requesting Microsoft Building Footprints for downtown San Antonio...");
  const result = await runMsBuildingsDownload();
  if (!result.success) {
    console.error(`FAIL: ${result.error}`);
    process.exit(1);
  }

  try {
    const featureCount = await verifyGeojson(OUTPUT_PATH);
    console.log(`PASS: Downloaded ${featureCount} building footprints to ${OUTPUT_PATH}`);
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : "Unknown verification error"}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
