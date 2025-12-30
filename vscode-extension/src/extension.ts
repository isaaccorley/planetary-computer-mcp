import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
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
}
