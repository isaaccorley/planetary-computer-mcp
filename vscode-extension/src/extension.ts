import { ChildProcess, spawn } from "child_process";
import * as vscode from "vscode";

let serverProcess: ChildProcess | null = null;

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel("Planetary Computer MCP");

  const startCmd = vscode.commands.registerCommand("planetary-computer.start", async () => {
    if (serverProcess) {
      vscode.window.showInformationMessage("MCP server is already running");
      return;
    }

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    out.appendLine("Starting MCP server: npx planetary-computer-mcp");

    serverProcess = spawn("npx", ["-y", "planetary-computer-mcp"], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
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
