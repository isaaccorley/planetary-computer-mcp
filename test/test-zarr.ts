/**
 * Exercise download_zarr for representative AOIs and confirm the resulting Zarr stores
 * contain non-empty data. Skips automatically when the Planetary Computer endpoint
 * is unreachable from the current environment.
 */
import { spawn } from "child_process";
import { access, stat } from "fs/promises";
import path from "path";
import FileSystemStore from "@zarrita/storage/fs";
import * as zarr from "zarrita";

const OUTPUT_DIR = path.resolve(process.cwd(), "samples/zarr-tests");

interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: { content?: Array<{ text?: string }> };
  error?: { code: number; message: string };
}

interface ZarrAssetConfig {
  name: string;
  datasetPath?: string;
}

interface ZarrTestConfig {
  slug: string;
  label: string;
  collection: string;
  bbox: [number, number, number, number];
  datetime: string;
  assets: ZarrAssetConfig[];
  expectedShape: [number, number, number];
}

const ZARR_TESTS: ZarrTestConfig[] = [
  {
    slug: "era5_surface_pressure_global",
    label: "ERA5 surface pressure global (June 2020)",
    collection: "era5-pds",
    bbox: [-180, -90, 180, 90],
    datetime: "2020-06-01/2020-06-02",
    assets: [{ name: "surface_air_pressure" }],
    expectedShape: [25, 721, 721], // 25 hours = 24 hours + 1 (inclusive)
  },
  {
    slug: "daymet_monthly_pr",
    label: "Daymet Puerto Rico monthly temps (July 2018)",
    collection: "daymet-monthly-pr",
    bbox: [-66.4, 18.2, -65.9, 18.6],
    datetime: "2018-07-01/2018-07-31",
    assets: [{ name: "tmax" }],
    expectedShape: [1, 64, 32],
  },
  {
    slug: "terraclimate_pet_2021",
    label: "TerraClimate PET Europe/Africa/Asia (2021-06)",
    collection: "terraclimate",
    bbox: [-10, -35, 180, 75],
    datetime: "2021-06-01/2021-06-30",
    assets: [{ name: "pet" }],
    expectedShape: [1, 2640, 4560], // 1 month of monthly data
  },
];

const tests: Array<{ name: string; fn: () => Promise<void> }> = [];

function register(name: string, fn: () => Promise<void>, _options?: { timeout?: number }) {
  tests.push({ name, fn });
}

async function assertZarrArrayHasSignal(
  storePath: string,
  datasetPath?: string,
  expectedShape?: [number, number, number]
): Promise<void> {
  // Ensure store exists
  await access(storePath);

  const store = new FileSystemStore(storePath);
  const normalized =
    datasetPath && datasetPath !== "/"
      ? datasetPath.startsWith("/")
        ? datasetPath
        : `/${datasetPath}`
      : "/";
  const location = zarr.root(store).resolve(normalized);
  const array = (await zarr.open(location, { kind: "array" })) as zarr.Array<any, FileSystemStore>;

  if (!(array instanceof zarr.Array)) {
    throw new Error(`No array found at ${datasetPath ?? "/"} in ${storePath}`);
  }

  if (array.shape.some((dim) => dim === 0)) {
    throw new Error(`Dataset at ${storePath} is empty (zero-sized dimension)`);
  }

  // Validate shape if expected shape is provided
  if (expectedShape) {
    if (array.shape.length !== expectedShape.length) {
      throw new Error(
        `Shape mismatch at ${storePath}: expected ${expectedShape.length} dimensions, got ${array.shape.length}`
      );
    }
    for (let i = 0; i < expectedShape.length; i++) {
      if (array.shape[i] !== expectedShape[i]) {
        throw new Error(
          `Shape mismatch at ${storePath}: expected [${expectedShape.join(",")}], got [${array.shape.join(",")}]`
        );
      }
    }
  }

  const chunkCoords = array.shape.map(() => 0);
  const chunk = await array.getChunk(chunkCoords);
  const typed = chunk.data as ArrayLike<number>;
  const hasSignal = Array.from(typed).some((value) => Number.isFinite(value) && value !== 0);

  if (!hasSignal) {
    throw new Error(`Data chunk at ${storePath} appears empty (all zeros)`);
  }
}

function extractMetadataFromContent(
  content?: Array<{ text?: string }>
): Record<string, unknown> | null {
  if (!content) return null;
  for (const entry of content) {
    if (typeof entry.text !== "string") continue;
    const idx = entry.text.indexOf("{");
    if (entry.text.startsWith("JSON metadata:") && idx >= 0) {
      try {
        return JSON.parse(entry.text.slice(idx));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function runSingleZarrTest(config: ZarrTestConfig): Promise<{
  success: boolean;
  error?: string;
}> {
  return await new Promise((resolve) => {
    const proc = spawn("node", ["dist/src/index.js"], { stdio: ["pipe", "pipe", "pipe"] });
    const responses = new Map<number, MCPResponse>();
    const waiters = new Map<number, (resp: MCPResponse) => void>();

    const rl = proc.stdout;
    rl.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
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
          // ignore
        }
      }
    });

    proc.stderr.on("data", (data) => process.stderr.write(data));

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
          rej(new Error(`Timeout waiting for response ${id}`));
        }, timeout);
        waiters.set(id, (resp) => {
          clearTimeout(timer);
          res(resp);
        });
      });

    const send = (data: unknown) => proc.stdin.write(JSON.stringify(data) + "\n");
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
          clientInfo: { name: "test-zarr", version: "1.0.0" },
        });
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        await sendRequest("tools/list");

        const downloadResp = await sendRequest("tools/call", {
          name: "download_zarr",
          arguments: {
            collection: config.collection,
            bbox: config.bbox,
            datetime: config.datetime,
            assets: config.assets.map((a) => a.name),
            output_directory: OUTPUT_DIR,
            output_filename: config.slug,
          },
        });

        if (downloadResp.error) {
          cleanup();
          resolve({ success: false, error: downloadResp.error.message });
          return;
        }

        const downloadPayload = downloadResp.result as {
          isError?: boolean;
          content?: Array<{ text?: string }>;
        } | null;

        if (downloadPayload?.isError) {
          const errorText = (downloadPayload.content ?? [])
            .map((entry) => entry.text ?? "")
            .filter(Boolean)
            .join("\n");
          cleanup();
          resolve({
            success: false,
            error:
              errorText || "download_zarr returned an error response without additional details",
          });
          return;
        }

        const downloadMetadata = extractMetadataFromContent(
          downloadPayload?.content as Array<{ text?: string }> | undefined
        );
        if (!downloadMetadata?.output_path) {
          cleanup();
          resolve({ success: false, error: "download_zarr did not provide output path metadata" });
          return;
        }
        const outputPath = downloadMetadata.output_path as string;

        for (const asset of config.assets) {
          const storePath = path.join(outputPath, asset.name);
          await assertZarrArrayHasSignal(storePath, asset.datasetPath, config.expectedShape);

          const previewResp = await sendRequest("tools/call", {
            name: "render_zarr_preview",
            arguments: {
              zarr_path: storePath,
              time_index: 0,
              output_basename: `${asset.name}_preview`,
            },
          });

          if (previewResp.error) {
            cleanup();
            resolve({ success: false, error: previewResp.error.message });
            return;
          }

          const previewPayload = previewResp.result as {
            isError?: boolean;
            content?: Array<{ text?: string }>;
          } | null;
          if (previewPayload?.isError) {
            const errorText = (previewPayload.content ?? [])
              .map((entry) => entry.text ?? "")
              .filter(Boolean)
              .join("\n");
            cleanup();
            resolve({
              success: false,
              error:
                errorText ||
                `render_zarr_preview failed for ${asset.name} without additional details`,
            });
            return;
          }

          const previewMetadata = extractMetadataFromContent(
            previewPayload?.content as Array<{ text?: string }> | undefined
          );

          const pngPath =
            typeof previewMetadata?.png_path === "string" ? previewMetadata.png_path : null;
          if (!pngPath) {
            cleanup();
            resolve({
              success: false,
              error: `render_zarr_preview did not return a png_path for ${asset.name}`,
            });
            return;
          }
          await access(pngPath);
          const pngStats = await stat(pngPath);
          if (!pngStats.isFile() || pngStats.size === 0) {
            cleanup();
            resolve({
              success: false,
              error: `Preview image ${pngPath} is missing or empty for ${asset.name}`,
            });
            return;
          }
        }

        cleanup();
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

for (const config of ZARR_TESTS) {
  register(config.label, async () => {
    const outcome = await runSingleZarrTest(config);
    if (!outcome.success) {
      throw new Error(outcome.error || "download_zarr returned an unknown failure");
    }
  });
}

async function main() {
  console.log(`Running ${tests.length} tests...\n`);
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`Running: ${test.name}`);
      await test.fn();
      console.log(`✓ PASSED: ${test.name}\n`);
      passed++;
    } catch (error) {
      console.error(`✗ FAILED: ${test.name}`);
      console.error(`  Error: ${error instanceof Error ? error.message : String(error)}\n`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} total`);
  console.log(`${"=".repeat(60)}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
