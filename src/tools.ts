import { z } from "zod";
import { spawn } from "child_process";
import { ConsoleManager } from "./console-manager.js";
import { URL } from "url";
import https from "https";
import http from "http";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (params: any) => Promise<any>;
}

// HTTP请求执行函数（作为curl的替代）
async function executeHttpRequest(curlCommand: string, timeout: number = 30000): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}> {
  try {
    // 解析curl命令
    const parsedCurl = parseCurlCommand(curlCommand);
    
    return new Promise((resolve) => {
      const url = new URL(parsedCurl.url);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: parsedCurl.method,
        headers: parsedCurl.headers,
        timeout: timeout
      };

      const req = httpModule.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const responseHeaders = Object.entries(res.headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
          
          const output = `HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}\n${responseHeaders}\n\n${data}`;
          
          resolve({
            stdout: output,
            stderr: '',
            exitCode: res.statusCode && res.statusCode >= 400 ? 1 : 0
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          stdout: '',
          stderr: error.message,
          exitCode: 1,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          stdout: '',
          stderr: 'Request timeout',
          exitCode: 1,
          error: `Request timed out after ${timeout}ms`
        });
      });

      // 发送请求体（如果有）
      if (parsedCurl.data) {
        req.write(parsedCurl.data);
      }
      
      req.end();
    });
  } catch (error) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// 解析curl命令 - 改进版本，更好地处理引号和转义
function parseCurlCommand(curlCommand: string): {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: string;
} {
  // 更智能的参数分割，处理引号
  const args = parseCommandLineArgs(curlCommand);
  let url = '';
  let method = 'GET';
  const headers: Record<string, string> = {};
  let data: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-X' || arg === '--request') {
      method = args[++i]?.toUpperCase() || 'GET';
    } else if (arg === '-H' || arg === '--header') {
      const header = args[++i];
      if (header) {
        const colonIndex = header.indexOf(':');
        if (colonIndex > 0) {
          const key = header.substring(0, colonIndex).trim();
          const value = header.substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      }
    } else if (arg === '-d' || arg === '--data' || arg === '--data-raw') {
      data = args[++i];
      if (method === 'GET') method = 'POST'; // 自动设置为POST
    } else if (!arg.startsWith('-') && !url) {
      url = arg;
    }
  }

  if (!url) {
    throw new Error('No URL found in curl command');
  }

  // 添加默认headers
  if (data && !headers['Content-Type']) {
    // 检查data是否是JSON格式
    if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
      headers['Content-Type'] = 'application/json';
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }
  
  if (!headers['User-Agent']) {
    headers['User-Agent'] = 'console-mcp-server/1.0.0';
  }

  return { url, method, headers, data };
}

// 解析命令行参数，正确处理引号
function parseCommandLineArgs(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let i = 0;
  
  while (i < command.length) {
    const char = command[i];
    
    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
    } else if (inQuotes && char === quoteChar) {
      // 检查是否是转义的引号
      if (i > 0 && command[i - 1] === '\\') {
        current += char;
      } else {
        inQuotes = false;
        quoteChar = '';
      }
    } else if (!inQuotes && char === ' ') {
      if (current.trim()) {
        args.push(current.trim());
        current = '';
      }
    } else {
      current += char;
    }
    
    i++;
  }
  
  if (current.trim()) {
    args.push(current.trim());
  }
  
  return args;
}

// Curl执行函数（尝试使用系统curl，失败时回退到HTTP模块）
async function executeCurl(curlCommand: string, timeout: number = 30000): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}> {
  // 首先尝试使用系统curl
  try {
    const args = parseCommandLineArgs(curlCommand).slice(1); // 移除"curl"部分
    
    return await new Promise((resolve) => {
      const process = spawn('curl', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | null = null;

      // 设置超时
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          process.kill('SIGTERM');
          resolve({
            stdout,
            stderr: stderr + '\n[Process terminated due to timeout]',
            exitCode: -1,
            error: `Command timed out after ${timeout}ms`
          });
        }, timeout);
      }

      // 收集输出
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // 处理进程结束
      process.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      process.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        // 如果curl不存在，抛出错误以回退到HTTP模块
        throw error;
      });
    });
  } catch (error) {
    // 回退到使用Node.js HTTP模块
    console.error('curl command not available, using built-in HTTP client:', error instanceof Error ? error.message : String(error));
    return await executeHttpRequest(curlCommand, timeout);
  }
}

export function createTools(consoleManager: ConsoleManager): ToolDefinition[] {
  return [
    // 1. 创建控制台 - 返回唯一ID
    {
      name: "create_console",
      description: "Create a new console session and return its unique ID",
      inputSchema: {
        shell: z.string().optional().describe("Shell to use (default: system default)"),
        workingDir: z.string().optional().describe("Working directory for the console"),
        environment: z.record(z.string()).optional().describe("Environment variables"),
        name: z.string().optional().describe("Optional name for the console (for easier reference)")
      },
      handler: async ({ shell, workingDir, environment, name }) => {
        try {
          const consoleResult = await consoleManager.createConsole(shell, workingDir, environment, name);
          
          let resultText = `Console created successfully:\n`;
          resultText += `ID: ${consoleResult.id}\n`;
          if (consoleResult.name) {
            resultText += `Name: ${consoleResult.name}\n`;
          }
          resultText += `Shell: ${consoleResult.shell}\n`;
          resultText += `Working Directory: ${consoleResult.workingDir}\n`;
          resultText += `Created: ${consoleResult.createdAt.toISOString()}\n`;
          resultText += `Status: ${consoleResult.isActive ? 'Active' : 'Inactive'}`;
          
          if (consoleResult.environment && Object.keys(consoleResult.environment).length > 0) {
            resultText += `\nEnvironment Variables: ${Object.keys(consoleResult.environment).length} set`;
          }
          
          return {
            content: [{
              type: "text",
              text: resultText
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text", 
              text: `Failed to create console: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    },

    // 2. 执行同步命令
    {
      name: "execute_sync",
      description: "Execute a command synchronously and return the result immediately",
      inputSchema: {
        console: z.string().describe("Console ID or name"),
        command: z.string().describe("Command to execute"),
        timeout: z.number().optional().default(30).describe("Timeout in seconds (default: 30)"),
        outputFilter: z.string().optional().describe("Regex pattern to filter output (reduces context size)")
      },
      handler: async ({ console: consoleIdOrName, command, timeout, outputFilter }) => {
        try {
          const result = await consoleManager.executeSync(consoleIdOrName, command, timeout * 1000, outputFilter);
          return {
            content: [{
              type: "text",
              text: `Command executed successfully:\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}\n\nExit Code: ${result.exitCode}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    },

    // 3. 执行异步命令
    {
      name: "execute_async",
      description: "Execute a command asynchronously and return an execution ID for later result retrieval",
      inputSchema: {
        console: z.string().describe("Console ID or name"),
        command: z.string().describe("Command to execute asynchronously"),
        outputFilter: z.string().optional().describe("Regex pattern to filter output (reduces context size)")
      },
      handler: async ({ console: consoleIdOrName, command, outputFilter }) => {
        try {
          const executionId = await consoleManager.executeAsync(consoleIdOrName, command, outputFilter);
          return {
            content: [{
              type: "text",
              text: `Command started asynchronously with execution ID: ${executionId}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to start async command: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    },

    // 4. 查询异步命令结果
    {
      name: "get_async_result",
      description: "Get the result of an asynchronously executed command",
      inputSchema: {
        console: z.string().describe("Console ID or name"),
        executionId: z.string().describe("Execution ID returned from execute_async"),
        outputFilter: z.string().optional().describe("Regex pattern to filter output (post-processing filter)")
      },
      handler: async ({ console: consoleIdOrName, executionId, outputFilter }) => {
        try {
          const result = await consoleManager.getAsyncResult(consoleIdOrName, executionId, outputFilter);
          return {
            content: [{
              type: "text",
              text: `Execution ${executionId} status: ${result.status}\n\nCommand: ${result.command}\nStarted: ${result.startTime.toISOString()}\n${result.endTime ? `Ended: ${result.endTime.toISOString()}` : 'Still running'}\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}\n\n${result.exitCode !== undefined ? `Exit Code: ${result.exitCode}` : ''}${result.error ? `Error: ${result.error}` : ''}${outputFilter ? `\n[Filtered with regex: ${outputFilter}]` : ''}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to get async result: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    },

    // 5. 列出所有控制台
    {
      name: "list_consoles",
      description: "List all active console sessions",
      inputSchema: {},
      handler: async () => {
        try {
          const consoles = consoleManager.listConsoles();
          const consoleList = consoles.map((c: any) => {
            let info = `ID: ${c.id}`;
            if (c.name) {
              info += `\nName: ${c.name}`;
            }
            info += `\nShell: ${c.shell}\nWorking Dir: ${c.workingDir}\nCreated: ${c.createdAt.toISOString()}\nActive: ${c.isActive ? 'Yes' : 'No'}`;
            return info;
          }).join('\n\n');
          
          return {
            content: [{
              type: "text",
              text: consoles.length > 0 ? `Active consoles:\n\n${consoleList}` : "No active consoles"
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to list consoles: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    },

    // 6. 关闭控制台
    {
      name: "close_console",
      description: "Close a console session and clean up resources",
      inputSchema: {
        console: z.string().describe("Console ID or name to close")
      },
      handler: async ({ console: consoleIdOrName }) => {
        try {
          await consoleManager.closeConsole(consoleIdOrName);
          return {
            content: [{
              type: "text",
              text: `Console ${consoleIdOrName} closed successfully`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to close console: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    },

    // 7. 获取控制台状态
    {
      name: "get_console_status",
      description: "Get detailed status information about a console session",
      inputSchema: {
        console: z.string().describe("Console ID or name to check")
      },
      handler: async ({ console: consoleIdOrName }) => {
        try {
          const status = consoleManager.getConsoleStatus(consoleIdOrName);
          let statusText = `Console Status:\nID: ${status.id}`;
          if (status.name) {
            statusText += `\nName: ${status.name}`;
          }
          statusText += `\nShell: ${status.shell}\nWorking Dir: ${status.workingDir}\nCreated: ${status.createdAt.toISOString()}\nActive: ${status.isActive ? 'Yes' : 'No'}\nRunning Executions: ${status.runningExecutions}`;
          
          return {
            content: [{
              type: "text",
              text: statusText
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to get console status: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    },

    // 9. 获取控制台输出缓冲区
    {
      name: "get_console_output",
      description: "Get recent output from a console session's buffer",
      inputSchema: {
        console: z.string().describe("Console ID or name"),
        lines: z.number().optional().describe("Number of recent lines to retrieve (default: all)"),
        outputFilter: z.string().optional().describe("Regex pattern to filter output lines")
      },
      handler: async ({ console: consoleIdOrName, lines, outputFilter }) => {
        try {
          const result = await consoleManager.getConsoleOutput(consoleIdOrName, lines, outputFilter);
          
          let responseText = `Console output for ${consoleIdOrName}:\n`;
          responseText += `Total lines in buffer: ${result.totalLines}\n`;
          if (lines) {
            responseText += `Showing last ${Math.min(lines, result.output.length)} lines\n`;
          }
          if (outputFilter) {
            responseText += `Filtered with regex: ${outputFilter}\n`;
          }
          responseText += `\n--- Output ---\n`;
          
          if (result.output.length === 0) {
            responseText += "No output available";
          } else {
            responseText += result.output.join('\n');
          }

          return {
            content: [{
              type: "text",
              text: responseText
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to get console output: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    },

    // 10. 清空控制台输出缓冲区
    {
      name: "clear_console_output",
      description: "Clear the output buffer of a console session",
      inputSchema: {
        console: z.string().describe("Console ID or name to clear")
      },
      handler: async ({ console: consoleIdOrName }) => {
        try {
          await consoleManager.clearConsoleOutput(consoleIdOrName);
          return {
            content: [{
              type: "text",
              text: `Console output buffer cleared for ${consoleIdOrName}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to clear console output: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    },

    // 11. Curl命令执行
    {
      name: "curl",
      description: "Execute HTTP requests using curl syntax. Automatically falls back to built-in HTTP client if curl is not available on the system (e.g., Windows without curl installed)",
      inputSchema: {
        command: z.string().describe("Complete curl command (e.g., 'curl -X GET https://api.example.com/data -H \"Content-Type: application/json\"')"),
        timeout: z.number().optional().default(30).describe("Timeout in seconds (default: 30)")
      },
      handler: async ({ command, timeout }) => {
        try {
          // 验证命令是否以curl开头
          if (!command.trim().toLowerCase().startsWith('curl')) {
            return {
              content: [{
                type: "text",
                text: "Error: Command must start with 'curl'"
              }],
              isError: true
            };
          }

          const result = await executeCurl(command, timeout * 1000);
          
          let responseText = `Curl command executed:\n${command}\n\n`;
          
          if (result.error) {
            responseText += `Error: ${result.error}\n\n`;
          }
          
          responseText += `Exit Code: ${result.exitCode}\n\n`;
          
          if (result.stdout) {
            responseText += `Response:\n${result.stdout}\n\n`;
          }
          
          if (result.stderr) {
            responseText += `Stderr:\n${result.stderr}`;
          }

          return {
            content: [{
              type: "text",
              text: responseText
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to execute curl command: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    }
  ];
}
