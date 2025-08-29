#!/usr/bin/env node

import { Command } from 'commander';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { ConsoleManager } from "./console-manager.js";
import { createTools } from "./tools.js";

// 创建命令行程序
const program = new Command();

program
  .name('console-mcp-server')
  .description('TypeScript MCP server for console management with process execution and async operations')
  .version('1.0.0');

// 定义选项类型
interface StdioOptions {
  debug?: boolean;
}

interface HttpOptions {
  port?: string;
  host?: string;
  debug?: boolean;
}

// STDIO模式命令
program
  .command('stdio')
  .description('Run server in STDIO transport mode (default)')
  .option('--debug', 'Enable debug mode', false)
  .action(async (options: StdioOptions) => {
    await runStdioMode(options);
  });

// HTTP模式命令
program
  .command('http')
  .description('Run server in HTTP/SSE transport mode')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .option('--host <string>', 'Host to bind to', 'localhost')
  .option('--debug', 'Enable debug mode', false)
  .action(async (options: HttpOptions) => {
    await runHttpMode(options);
  });

// 默认命令（STDIO模式）
program
  .option('--debug', 'Enable debug mode', false)
  .action(async (options: StdioOptions) => {
    await runStdioMode(options);
  });

// STDIO模式实现
async function runStdioMode(options: StdioOptions) {
  if (options.debug) {
    console.error('[DEBUG] Starting in STDIO mode');
  }

  // 创建MCP服务器实例
  const server = new McpServer({
    name: "console-mcp-server",
    version: "1.0.0"
  });

  // 创建控制台管理器实例并设置通知回调
  const consoleManager = new ConsoleManager((notification: any) => {
    const logLevel = options.debug ? 'DEBUG' : 'INFO';
    console.error(`[${logLevel}] ${notification.type}: Console ${notification.consoleId}, Execution ${notification.executionId}, Command: ${notification.command}`);
    if (notification.result) {
      console.error(`[${logLevel}] Exit Code: ${notification.result.exitCode}, STDOUT length: ${notification.result.stdout.length}, STDERR length: ${notification.result.stderr.length}`);
    }
    if (notification.error) {
      console.error(`[${logLevel}] Error: ${notification.error}`);
    }
  });

  // 注册所有工具
  const tools = createTools(consoleManager);
  tools.forEach(tool => {
    server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
  });

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Console MCP Server running on stdio");
  } catch (error) {
    console.error("Failed to start STDIO server:", error);
    process.exit(1);
  }
}

// HTTP模式实现
async function runHttpMode(options: HttpOptions) {
  const port = parseInt(options.port || '3000');
  const host = options.host || 'localhost';

  if (options.debug) {
    console.error(`[DEBUG] Starting in HTTP mode on ${host}:${port}`);
  }

  // 创建Express应用
  const app = express();
  app.use(express.json());

  // 创建MCP服务器实例
  const server = new McpServer({
    name: "console-mcp-server",
    version: "1.0.0"
  });

  // 存储SSE传输
  const transports: Record<string, SSEServerTransport> = {};

  // 创建控制台管理器实例并设置通知回调
  const consoleManager = new ConsoleManager((notification: any) => {
    const logLevel = options.debug ? 'DEBUG' : 'INFO';
    console.error(`[HTTP ${logLevel}] ${notification.type}: Console ${notification.consoleId}, Execution ${notification.executionId}, Command: ${notification.command}`);
    if (notification.result) {
      console.error(`[HTTP ${logLevel}] Exit Code: ${notification.result.exitCode}, STDOUT length: ${notification.result.stdout.length}, STDERR length: ${notification.result.stderr.length}`);
    }
    if (notification.error) {
      console.error(`[HTTP ${logLevel}] Error: ${notification.error}`);
    }
  });

  // 注册所有工具
  const tools = createTools(consoleManager);
  tools.forEach(tool => {
    server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
  });

  // 设置CORS
  app.use((req: any, res: any, next: any) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // 健康检查端点
  app.get('/health', (req: any, res: any) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      mode: 'http',
      version: '1.0.0'
    });
  });

  // 信息端点
  app.get('/info', (req: any, res: any) => {
    res.json({
      name: 'console-mcp-server',
      version: '1.0.0',
      mode: 'http',
      endpoints: {
        health: '/health',
        info: '/info',
        sse: '/sse',
        messages: '/messages'
      },
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description
      }))
    });
  });

  // SSE端点 - 用于建立SSE连接
  app.get('/sse', async (req: any, res: any) => {
    try {
      // 创建SSE传输
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId || `session-${Date.now()}`;
      transports[sessionId] = transport;
      
      if (options.debug) {
        console.error(`[DEBUG] New SSE connection: ${sessionId}`);
      }
      
      res.on("close", () => {
        delete transports[sessionId];
        if (options.debug) {
          console.error(`[DEBUG] SSE connection closed: ${sessionId}`);
        }
      });
      
      await server.connect(transport);
    } catch (error) {
      console.error('SSE connection error:', error);
      res.status(500).send('SSE connection failed');
    }
  });

  // 消息端点 - 用于处理客户端消息
  app.post('/messages', async (req: any, res: any) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (transport) {
      try {
        await transport.handlePostMessage(req, res, req.body);
      } catch (error) {
        console.error('Message handling error:', error);
        res.status(500).send('Message handling failed');
      }
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  });

  try {
    app.listen(port, host, () => {
      console.error(`Console MCP Server running on HTTP ${host}:${port}`);
      console.error(`Health check: http://${host}:${port}/health`);
      console.error(`Server info: http://${host}:${port}/info`);
      console.error(`SSE endpoint: http://${host}:${port}/sse`);
      console.error(`Messages endpoint: http://${host}:${port}/messages`);
    });
  } catch (error) {
    console.error("Failed to start HTTP server:", error);
    process.exit(1);
  }
}

// 解析命令行参数
program.parse();
