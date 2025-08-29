import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import * as path from 'path';

// 通知回调类型
export type NotificationCallback = (notification: {
  type: 'execution_completed' | 'execution_failed';
  consoleId: string;
  executionId: string;
  command: string;
  result?: SyncExecutionResult;
  error?: string;
}) => void;

// 控制台会话接口
export interface ConsoleSession {
  id: string;
  name?: string;
  shell: string;
  workingDir: string;
  process: ChildProcess;
  createdAt: Date;
  isActive: boolean;
  environment?: Record<string, string>;
  outputBuffer: string[];  // 最近的输出缓冲区
  maxBufferSize: number;   // 最大缓冲区大小
}

// 异步执行状态
export interface AsyncExecution {
  id: string;
  command: string;
  status: 'running' | 'completed' | 'failed';
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: string;
  startTime: Date;
  endTime?: Date;
}

// 同步执行结果
export interface SyncExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// 控制台状态信息
export interface ConsoleStatus {
  id: string;
  name?: string;
  shell: string;
  workingDir: string;
  createdAt: Date;
  isActive: boolean;
  runningExecutions: number;
}

// 创建控制台的返回信息
export interface ConsoleCreationResult {
  id: string;
  name?: string;
  shell: string;
  workingDir: string;
  createdAt: Date;
  isActive: boolean;
  environment?: Record<string, string>;
}

export class ConsoleManager {
  private consoles: Map<string, ConsoleSession> = new Map();
  private consolesByName: Map<string, string> = new Map(); // name -> id mapping
  private asyncExecutions: Map<string, Map<string, AsyncExecution>> = new Map();
  private notificationCallback?: NotificationCallback;

  constructor(notificationCallback?: NotificationCallback) {
    this.notificationCallback = notificationCallback;
  }

  /**
   * 创建新的控制台会话
   */
  async createConsole(
    shell?: string, 
    workingDir?: string, 
    environment?: Record<string, string>,
    name?: string
  ): Promise<ConsoleCreationResult> {
    const consoleId = uuidv4();
    
    // 检查name是否已经存在
    if (name && this.consolesByName.has(name)) {
      throw new Error(`Console with name "${name}" already exists`);
    }
    
    // 确定使用的shell
    const defaultShell = this.getDefaultShell();
    const selectedShell = shell || defaultShell;
    
    // 确定工作目录
    const selectedWorkingDir = workingDir || process.cwd();
    
    // 准备环境变量
    const env = { ...process.env, ...environment };
    
    try {
      // 创建子进程
      const childProcess = spawn(selectedShell, [], {
        cwd: selectedWorkingDir,
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // 检查进程是否成功启动
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Console process failed to start within timeout'));
        }, 5000);

        childProcess.on('spawn', () => {
          clearTimeout(timer);
          resolve();
        });

        childProcess.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });

      const session: ConsoleSession = {
        id: consoleId,
        name,
        shell: selectedShell,
        workingDir: selectedWorkingDir,
        process: childProcess,
        createdAt: new Date(),
        isActive: true,
        environment,
        outputBuffer: [],
        maxBufferSize: 1000  // 保持最近1000行输出
      };

      // 设置进程退出处理
      childProcess.on('exit', () => {
        session.isActive = false;
        // 从name映射中移除
        if (name) {
          this.consolesByName.delete(name);
        }
      });

      this.consoles.set(consoleId, session);
      // 添加name到id的映射
      if (name) {
        this.consolesByName.set(name, consoleId);
      }
      this.asyncExecutions.set(consoleId, new Map());

      return {
        id: consoleId,
        name,
        shell: selectedShell,
        workingDir: selectedWorkingDir,
        createdAt: session.createdAt,
        isActive: true,
        environment
      };
    } catch (error) {
      throw new Error(`Failed to create console: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 解析控制台ID（支持通过name或id查找）
   */
  private resolveConsoleId(consoleIdOrName: string): string {
    // 首先尝试直接作为ID查找
    if (this.consoles.has(consoleIdOrName)) {
      return consoleIdOrName;
    }
    
    // 然后尝试作为name查找
    const idFromName = this.consolesByName.get(consoleIdOrName);
    if (idFromName) {
      return idFromName;
    }
    
    throw new Error(`Console "${consoleIdOrName}" not found (searched by both ID and name)`);
  }

  /**
   * 获取控制台会话（支持通过name或id查找）
   */
  private getConsoleSession(consoleIdOrName: string): ConsoleSession {
    const consoleId = this.resolveConsoleId(consoleIdOrName);
    const session = this.consoles.get(consoleId);
    if (!session) {
      throw new Error(`Console ${consoleId} not found`);
    }
    return session;
  }

  /**
   * 同步执行命令
   */
  async executeSync(
    consoleIdOrName: string, 
    command: string, 
    timeout = 30000,
    outputFilter?: string
  ): Promise<SyncExecutionResult> {
    const session = this.getConsoleSession(consoleIdOrName);

    if (!session.isActive) {
      throw new Error(`Console ${consoleIdOrName} is not active`);
    }

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let completed = false;

      // 设置超时
      const timer = setTimeout(() => {
        if (!completed) {
          completed = true;
          reject(new Error(`Command execution timed out after ${timeout}ms`));
        }
      }, timeout);

      // 创建新的子进程来执行命令
      const shellArgs = this.getShellArgs(session.shell, command);
      const cmdProcess = spawn(session.shell, shellArgs, {
        cwd: session.workingDir,
        env: { ...process.env, ...session.environment },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      cmdProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        this.addToOutputBuffer(session, output, false);
      });

      cmdProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        this.addToOutputBuffer(session, output, true);
      });

      cmdProcess.on('close', (code) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          
          // 应用输出过滤器
          const filtered = this.applyOutputFilter(stdout, stderr, outputFilter);
          
          resolve({
            stdout: filtered.stdout,
            stderr: filtered.stderr, 
            exitCode: code ?? 0
          });
        }
      });

      cmdProcess.on('error', (error) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          reject(new Error(`Command execution failed: ${error.message}`));
        }
      });
    });
  }

  /**
   * 异步执行命令
   */
  async executeAsync(
    consoleIdOrName: string, 
    command: string, 
    outputFilter?: string
  ): Promise<string> {
    const session = this.getConsoleSession(consoleIdOrName);
    const consoleId = session.id;

    if (!session.isActive) {
      throw new Error(`Console ${consoleIdOrName} is not active`);
    }

    const executionId = uuidv4();
    const execution: AsyncExecution = {
      id: executionId,
      command,
      status: 'running',
      stdout: '',
      stderr: '',
      startTime: new Date()
    };

    const executions = this.asyncExecutions.get(consoleId)!;
    executions.set(executionId, execution);

    // 创建新的子进程来执行命令
    const shellArgs = this.getShellArgs(session.shell, command);
    const cmdProcess = spawn(session.shell, shellArgs, {
      cwd: session.workingDir,
      env: { ...process.env, ...session.environment },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    cmdProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      execution.stdout += output;
      this.addToOutputBuffer(session, output, false);
    });

    cmdProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      execution.stderr += output;
      this.addToOutputBuffer(session, output, true);
    });

    cmdProcess.on('close', (code) => {
      execution.status = 'completed';
      execution.exitCode = code ?? 0;
      execution.endTime = new Date();
      
      // 应用输出过滤器
      const filtered = this.applyOutputFilter(execution.stdout, execution.stderr, outputFilter);
      
      // 更新execution对象的输出
      execution.stdout = filtered.stdout;
      execution.stderr = filtered.stderr;
      
      // 发送通知
      if (this.notificationCallback) {
        this.notificationCallback({
          type: 'execution_completed',
          consoleId,
          executionId,
          command,
          result: {
            stdout: filtered.stdout,
            stderr: filtered.stderr,
            exitCode: code ?? 0
          }
        });
      }
    });

    cmdProcess.on('error', (error) => {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = new Date();
      
      // 发送错误通知
      if (this.notificationCallback) {
        this.notificationCallback({
          type: 'execution_failed',
          consoleId,
          executionId,
          command,
          error: error.message
        });
      }
    });

    return executionId;
  }

  /**
   * 获取异步执行结果
   */
  async getAsyncResult(
    consoleIdOrName: string, 
    executionId: string, 
    outputFilter?: string
  ): Promise<AsyncExecution> {
    const consoleId = this.resolveConsoleId(consoleIdOrName);
    const executions = this.asyncExecutions.get(consoleId);
    if (!executions) {
      throw new Error(`Console ${consoleIdOrName} not found`);
    }

    const execution = executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found in console ${consoleIdOrName}`);
    }

    // 创建副本
    const result = { ...execution };
    
    // 如果提供了后期过滤器，应用它
    if (outputFilter) {
      const filtered = this.applyOutputFilter(result.stdout, result.stderr, outputFilter);
      result.stdout = filtered.stdout;
      result.stderr = filtered.stderr;
    }

    return result;
  }

  /**
   * 列出所有控制台
   */
  listConsoles(): ConsoleStatus[] {
    return Array.from(this.consoles.values()).map(session => ({
      id: session.id,
      name: session.name,
      shell: session.shell,
      workingDir: session.workingDir,
      createdAt: session.createdAt,
      isActive: session.isActive,
      runningExecutions: this.getRunningExecutionsCount(session.id)
    }));
  }

  /**
   * 获取控制台状态
   */
  getConsoleStatus(consoleIdOrName: string): ConsoleStatus {
    const session = this.getConsoleSession(consoleIdOrName);

    return {
      id: session.id,
      name: session.name,
      shell: session.shell,
      workingDir: session.workingDir,
      createdAt: session.createdAt,
      isActive: session.isActive,
      runningExecutions: this.getRunningExecutionsCount(session.id)
    };
  }

  /**
   * 关闭控制台
   */
  async closeConsole(consoleIdOrName: string): Promise<void> {
    const session = this.getConsoleSession(consoleIdOrName);
    const consoleId = session.id;

    // 终止进程
    if (session.process && !session.process.killed) {
      session.process.kill('SIGTERM');
      
      // 等待一段时间，如果进程还没有退出，强制终止
      setTimeout(() => {
        if (!session.process.killed) {
          session.process.kill('SIGKILL');
        }
      }, 5000);
    }

    session.isActive = false;
    
    // 从name映射中移除
    if (session.name) {
      this.consolesByName.delete(session.name);
    }
    
    this.consoles.delete(consoleId);
    this.asyncExecutions.delete(consoleId);
  }

  /**
   * 清理所有资源
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.consoles.keys()).map(id => 
      this.closeConsole(id).catch(err => 
        console.error(`Error closing console ${id}:`, err)
      )
    );
    
    await Promise.all(promises);
  }

  /**
   * 获取默认shell
   */
  private getDefaultShell(): string {
    const platform = os.platform();
    
    if (platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    } else {
      return process.env.SHELL || '/bin/bash';
    }
  }

  /**
   * 获取shell执行命令的参数
   */
  private getShellArgs(shell: string, command: string): string[] {
    const shellLower = shell.toLowerCase();
    
    if (shellLower.includes('cmd.exe') || shellLower.includes('cmd')) {
      return ['/c', command];
    } else if (shellLower.includes('powershell') || shellLower.includes('pwsh')) {
      return ['-Command', command];
    } else {
      // Unix-like shells (bash, zsh, sh, etc.)
      return ['-c', command];
    }
  }

  /**
   * 添加输出到缓冲区
   */
  private addToOutputBuffer(session: ConsoleSession, output: string, isError: boolean = false): void {
    const timestamp = new Date().toISOString();
    const prefix = isError ? '[STDERR]' : '[STDOUT]';
    const lines = output.split('\n').filter(line => line.trim().length > 0);
    
    for (const line of lines) {
      session.outputBuffer.push(`${timestamp} ${prefix} ${line}`);
      
      // 保持缓冲区大小在限制内
      if (session.outputBuffer.length > session.maxBufferSize) {
        session.outputBuffer.shift();
      }
    }
  }

  /**
   * 获取控制台输出缓冲区
   */
  async getConsoleOutput(
    consoleIdOrName: string, 
    lines?: number, 
    outputFilter?: string
  ): Promise<{ output: string[]; totalLines: number }> {
    const session = this.getConsoleSession(consoleIdOrName);
    
    if (!session.isActive) {
      throw new Error(`Console ${consoleIdOrName} is not active`);
    }

    let output = [...session.outputBuffer]; // 创建副本
    
    // 应用行数限制
    if (lines && lines > 0) {
      output = output.slice(-lines);
    }
    
    // 应用过滤器
    if (outputFilter) {
      try {
        const regex = new RegExp(outputFilter, 'gm');
        output = output.filter(line => regex.test(line));
      } catch (error) {
        output.push(`[Warning: Invalid regex filter: ${outputFilter}]`);
      }
    }

    return {
      output,
      totalLines: session.outputBuffer.length
    };
  }

  /**
   * 清空控制台输出缓冲区
   */
  async clearConsoleOutput(consoleIdOrName: string): Promise<void> {
    const session = this.getConsoleSession(consoleIdOrName);
    session.outputBuffer = [];
  }
  private applyOutputFilter(stdout: string, stderr: string, outputFilter?: string): { stdout: string; stderr: string } {
    if (!outputFilter) {
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    }

    try {
      const regex = new RegExp(outputFilter, 'gm');
      const stdoutMatches = stdout.match(regex) || [];
      const stderrMatches = stderr.match(regex) || [];
      
      return {
        stdout: stdoutMatches.join('\n'),
        stderr: stderrMatches.join('\n')
      };
    } catch (error) {
      // 如果regex无效，返回原始输出并添加警告
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim() + `\n[Warning: Invalid regex filter: ${outputFilter}]`
      };
    }
  }

  /**
   * 获取正在运行的执行数量
   */
  private getRunningExecutionsCount(consoleId: string): number {
    const executions = this.asyncExecutions.get(consoleId);
    if (!executions) {
      return 0;
    }

    return Array.from(executions.values()).filter(exec => exec.status === 'running').length;
  }
}
