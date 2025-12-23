import * as vscode from "vscode";

const SERVER_NAME = "planetary-computer";
const MCP_SETTINGS_KEY = "github.copilot.chat.mcp.servers";

interface McpServerConfig {
  command: string;
  args: string[];
}

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel("Planetary Computer MCP");

  const addCmd = vscode.commands.registerCommand("planetary-computer.add", async () => {
    const config = vscode.workspace.getConfiguration();
    const servers = config.get<Record<string, McpServerConfig>>(MCP_SETTINGS_KEY) || {};

    if (servers[SERVER_NAME]) {
      vscode.window.showInformationMessage("Planetary Computer MCP server is already configured");
      return;
    }

    const updatedServers = {
      ...servers,
      [SERVER_NAME]: {
        command: "npx",
        args: ["-y", "planetary-computer-mcp"],
      },
    };

    await config.update(MCP_SETTINGS_KEY, updatedServers, vscode.ConfigurationTarget.Global);
    out.appendLine("Added Planetary Computer MCP server to VS Code settings");
    vscode.window.showInformationMessage(
      "Planetary Computer MCP server added! Reload VS Code to activate."
    );
  });

  const removeCmd = vscode.commands.registerCommand("planetary-computer.remove", async () => {
    const config = vscode.workspace.getConfiguration();
    const servers = config.get<Record<string, McpServerConfig>>(MCP_SETTINGS_KEY) || {};

    if (!servers[SERVER_NAME]) {
      vscode.window.showInformationMessage("Planetary Computer MCP server is not configured");
      return;
    }

    const { [SERVER_NAME]: _removed, ...remainingServers } = servers;
    void _removed; // Intentionally unused - we're removing this key

    await config.update(MCP_SETTINGS_KEY, remainingServers, vscode.ConfigurationTarget.Global);
    out.appendLine("Removed Planetary Computer MCP server from VS Code settings");
    vscode.window.showInformationMessage("Planetary Computer MCP server removed");
  });

  const statusCmd = vscode.commands.registerCommand("planetary-computer.status", async () => {
    const config = vscode.workspace.getConfiguration();
    const servers = config.get<Record<string, McpServerConfig>>(MCP_SETTINGS_KEY) || {};

    if (servers[SERVER_NAME]) {
      vscode.window.showInformationMessage("Planetary Computer MCP server is configured ✓");
    } else {
      const action = await vscode.window.showInformationMessage(
        "Planetary Computer MCP server is not configured",
        "Add Now"
      );
      if (action === "Add Now") {
        vscode.commands.executeCommand("planetary-computer.add");
      }
    }
  });

  context.subscriptions.push(addCmd, removeCmd, statusCmd, out);

  // Show welcome message on first install
  const hasShownWelcome = context.globalState.get<boolean>("hasShownWelcome");
  if (!hasShownWelcome) {
    context.globalState.update("hasShownWelcome", true);
    vscode.window
      .showInformationMessage(
        "Planetary Computer MCP extension installed! Add the MCP server to your VS Code settings?",
        "Add MCP Server",
        "Later"
      )
      .then((selection) => {
        if (selection === "Add MCP Server") {
          vscode.commands.executeCommand("planetary-computer.add");
        }
      });
  }
}

export function deactivate() {}
