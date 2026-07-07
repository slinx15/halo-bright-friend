declare module "@lovable.dev/mcp-js" {
  export interface ToolContext {
    getToken(): string;
    [key: string]: unknown;
  }

  export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
    name: string;
    description?: string;
    inputSchema?: unknown;
    handler: (input: TInput, ctx: ToolContext) => Promise<TOutput> | TOutput;
  }

  export function defineTool<TInput = unknown, TOutput = unknown>(
    def: ToolDefinition<TInput, TOutput>,
  ): ToolDefinition<TInput, TOutput>;

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
  };
}
