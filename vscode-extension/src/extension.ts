import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // Check if MCP API is available
  if (!vscode.lm?.registerMcpServerDefinitionProvider) {
    console.log("planetary-computer-mcp: MCP API not available in this VS Code version");
    return;
  }

  const didChangeEmitter = new vscode.EventEmitter<void>();
  context.subscriptions.push(didChangeEmitter);

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider("planetary-computer-mcp", {
      onDidChangeMcpServerDefinitions: didChangeEmitter.event,
      provideMcpServerDefinitions: async () => {
        const servers: vscode.McpServerDefinition[] = [];
        servers.push(
          new vscode.McpStdioServerDefinition("planetary-computer", "uvx", [
            "planetary-computer-mcp",
          ])
        );
        return servers;
      },
      resolveMcpServerDefinition: async (server: vscode.McpServerDefinition) => {
        return server;
      },
    })
  );

  console.log("planetary-computer-mcp: Extension activated");
}

export function deactivate() {
  // Cleanup handled by disposables in context.subscriptions
}
