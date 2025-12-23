/**
 * Dedicated debug script for Daymet NA zarr downloads (annual, monthly, daily)
 */
import { spawn } from "child_process";
import path from "path";

const OUTPUT_DIR = path.resolve(process.cwd(), "samples/zarr-tests");

interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: { content?: Array<{ text?: string }> };
  error?: { code: number; message: string };
}

function callMCP(method: string, params: Record<string, unknown>): Promise<MCPResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["dist/src/index.js"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
      // Print debug output in real-time
      process.stderr.write(data);
    });

    child.on("error", reject);

    child.on("close", (_code) => {
      // Parse last JSON line from stdout
      const lines = stdout.trim().split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed.jsonrpc === "2.0") {
            return resolve(parsed);
          }
        } catch {
          // continue
        }
      }
      reject(new Error(`No valid JSON-RPC response. stderr: ${stderr}`));
    });

    // Send initialize
    const initReq = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-daymet", version: "1.0.0" },
      },
    });

    // Send the actual request
    const toolReq = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method,
      params,
    });

    child.stdin.write(initReq + "\n");
    child.stdin.write(toolReq + "\n");
    child.stdin.end();
  });
}

interface TestConfig {
  name: string;
  collection: string;
  bbox: [number, number, number, number];
  datetime: string;
  expectedTimeSteps: number;
  expectedShape: [number, number, number];
}

const TESTS: TestConfig[] = [
  // Annual tests
  {
    name: "Annual NA (3 years)",
    collection: "daymet-annual-na",
    bbox: [-98, 40, -97.5, 40.5],
    datetime: "2018-01-01/2020-12-31",
    expectedTimeSteps: 3,
    expectedShape: [3, 54, 39],
  },
  // Monthly tests
  {
    name: "Monthly NA (3 months)",
    collection: "daymet-monthly-na",
    bbox: [-98, 40, -97.5, 40.5],
    datetime: "2019-01-01/2019-03-31",
    expectedTimeSteps: 3,
    expectedShape: [3, 54, 39],
  },
  {
    name: "Monthly NA (6 months)",
    collection: "daymet-monthly-na",
    bbox: [-98, 40, -97, 41],
    datetime: "2019-01-01/2019-06-30",
    expectedTimeSteps: 6,
    expectedShape: [6, 108, 78],
  },
  // Daily tests
  {
    name: "Daily NA (7 days)",
    collection: "daymet-daily-na",
    bbox: [-98, 40, -97.5, 40.5],
    datetime: "2019-06-01/2019-06-07",
    expectedTimeSteps: 7,
    expectedShape: [7, 54, 39],
  },
  {
    name: "Daily NA (30 days)",
    collection: "daymet-daily-na",
    bbox: [-98, 40, -97.5, 40.5],
    datetime: "2019-06-01/2019-06-30",
    expectedTimeSteps: 30,
    expectedShape: [30, 54, 39],
  },
];

async function runTest(config: TestConfig): Promise<{
  success: boolean;
  error?: string;
  elapsed: number;
  actualTimeSteps?: number;
  actualShape?: [number, number, number];
}> {
  const slug = `${config.collection.replace(/-/g, "_")}_${config.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  const startTime = Date.now();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Test: ${config.name}`);
  console.log(`Collection: ${config.collection}`);
  console.log(`bbox: [${config.bbox.join(", ")}]`);
  console.log(`datetime: ${config.datetime}`);
  console.log(`Expected time steps: ${config.expectedTimeSteps}`);
  console.log(`${"=".repeat(60)}`);

  try {
    const response = await callMCP("tools/call", {
      name: "download_zarr",
      arguments: {
        collection: config.collection,
        bbox: config.bbox,
        datetime: config.datetime,
        assets: ["tmax"],
        output_directory: OUTPUT_DIR,
        output_filename: slug,
      },
    });

    const elapsed = Date.now() - startTime;

    if (response.error) {
      console.log(`✗ FAILED (${elapsed}ms): ${response.error.message}`);
      return { success: false, error: response.error.message, elapsed };
    }

    const text = response.result?.content?.[0]?.text || "";

    // Extract shape from response
    const shapeMatch = text.match(/shape=(\d+)x(\d+)x(\d+)/);
    const actualShape: [number, number, number] | null = shapeMatch
      ? [parseInt(shapeMatch[1]), parseInt(shapeMatch[2]), parseInt(shapeMatch[3])]
      : null;
    const actualTimeSteps = actualShape ? actualShape[0] : -1;

    const _timeCorrect = actualTimeSteps === config.expectedTimeSteps;
    const shapeCorrect = actualShape
      ? actualShape[0] === config.expectedShape[0] &&
        actualShape[1] === config.expectedShape[1] &&
        actualShape[2] === config.expectedShape[2]
      : false;

    if (shapeCorrect) {
      console.log(`✓ PASSED (${elapsed}ms) - shape=${actualShape?.join("x")} ✓`);
    } else {
      const expectedStr = config.expectedShape.join("x");
      const actualStr = actualShape ? actualShape.join("x") : "unknown";
      console.log(`✗ SHAPE MISMATCH (${elapsed}ms) - expected=${expectedStr}, actual=${actualStr}`);
    }
    console.log(`Response: ${text.slice(0, 150)}...`);

    return {
      success: shapeCorrect,
      elapsed,
      actualTimeSteps,
      actualShape: actualShape ?? undefined,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`✗ FAILED (${elapsed}ms): ${msg}`);
    return { success: false, error: msg, elapsed };
  }
}

async function main() {
  console.log("Daymet NA Collection Tests (Annual, Monthly, Daily)");
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  const results: Array<{
    name: string;
    collection: string;
    success: boolean;
    elapsed: number;
    actualTimeSteps?: number;
    actualShape?: [number, number, number];
    expected: number;
    expectedShape: [number, number, number];
  }> = [];

  for (const test of TESTS) {
    const result = await runTest(test);
    results.push({
      name: test.name,
      collection: test.collection,
      expected: test.expectedTimeSteps,
      expectedShape: test.expectedShape,
      ...result,
    });
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Summary");
  console.log(`${"=".repeat(60)}`);
  for (const r of results) {
    const status = r.success ? "✓" : "✗";
    const shapeInfo = r.actualShape ? `${r.actualShape.join("x")}` : "unknown";
    const expectedShapeStr = r.expectedShape.join("x");
    console.log(
      `${status} ${r.name.padEnd(25)} ${r.collection.padEnd(20)} ${shapeInfo}/${expectedShapeStr} ${r.elapsed}ms`
    );
  }

  const passed = results.filter((r) => r.success).length;
  console.log(`\nPassed: ${passed}/${results.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
