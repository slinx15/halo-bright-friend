declare module "@lovable.dev/mcp-js" {
  export interface ToolContext {
    getToken(): string;
    [key: string]: unknown;
  }

  export type ToolDefinition = Record<string, unknown>;

  export function defineTool(def: Record<string, unknown>): ToolDefinition;

  export interface McpDefinition {
    name: string;
    title?: string;
    version: string;
    instructions?: string;
    auth?: unknown;
    tools: ToolDefinition[];
  }

  export function defineMcp(def: McpDefinition): McpDefinition;

  export const auth: {
    oauth: {
      issuer(config: { issuer: string; acceptedAudiences?: string | string[] }): unknown;
    };
    [key: string]: unknown;
  };
}
  }

  export function defineMcp(def: McpDefinition): McpDefinition;

  export const auth: {
    oauth: {
      issuer(config: { issuer: string; acceptedAudiences?: string | string[] }): unknown;
    };
  };
}
