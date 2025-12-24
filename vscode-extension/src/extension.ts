import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const didChangeEmitter = new vscode.EventEmitter<void>();

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider("planetary-computer-mcp", {
      onDidChangeMcpServerDefinitions: didChangeEmitter.event,
      provideMcpServerDefinitions: async () => {
        const servers: vscode.McpServerDefinition[] = [];
        servers.push(
          new vscode.McpStdioServerDefinition("planetary-computer", "npx", [
            "-y",
            "planetary-computer-mcp@latest",
          ])
        );
        return servers;
      },
      resolveMcpServerDefinition: async (server: vscode.McpServerDefinition) => {
        return server;
      },
    })
  );
}
