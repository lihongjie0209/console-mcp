import { ConsoleManager } from "./console-manager.js";
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    handler: (params: any) => Promise<any>;
}
export declare function createTools(consoleManager: ConsoleManager): ToolDefinition[];
