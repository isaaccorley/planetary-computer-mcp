import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import * as vscode from "vscode";

let serverProcess: ChildProcess | null = null;

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel("Planetary Computer MCP");

  const startCmd = vscode.commands.registerCommand("planetary-computer.start", async () => {
    if (serverProcess) {
      vscode.window.showInformationMessage("MCP server is already running");
      return;
    }

    // Resolve the dist entry relative to extension (assumes repo root compiled)
    const extensionRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const serverPath = path.join(extensionRoot, "dist", "src", "index.js");

    out.appendLine(`Starting MCP server: node ${serverPath}`);

    serverProcess = spawn(process.execPath, [serverPath], {
      cwd: extensionRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stdout?.on("data", (data) => out.appendLine(String(data)));
    serverProcess.stderr?.on("data", (data) => out.appendLine(String(data)));
    serverProcess.on("exit", (code) => {
      out.appendLine(`MCP server exited with code ${code}`);
      serverProcess = null;
    });

    out.show(true);
    vscode.window.showInformationMessage("Started Planetary Computer MCP server");
  });

  const stopCmd = vscode.commands.registerCommand("planetary-computer.stop", async () => {
    if (!serverProcess) {
      vscode.window.showInformationMessage("MCP server is not running");
      return;
    }
    serverProcess.kill();
    serverProcess = null;
    vscode.window.showInformationMessage("Stopped Planetary Computer MCP server");
  });

  context.subscriptions.push(startCmd, stopCmd, out);
}

export function deactivate() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}
