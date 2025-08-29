import { ChildProcess } from 'child_process';
export type NotificationCallback = (notification: {
    type: 'execution_completed' | 'execution_failed';
    consoleId: string;
    executionId: string;
    command: string;
    result?: SyncExecutionResult;
    error?: string;
}) => void;
export interface ConsoleSession {
    id: string;
    name?: string;
    shell: string;
    workingDir: string;
    process: ChildProcess;
    createdAt: Date;
    isActive: boolean;
    environment?: Record<string, string>;
    outputBuffer: string[];
    maxBufferSize: number;
}
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
export interface SyncExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface ConsoleStatus {
    id: string;
    name?: string;
    shell: string;
    workingDir: string;
    createdAt: Date;
    isActive: boolean;
    runningExecutions: number;
}
export interface ConsoleCreationResult {
    id: string;
    name?: string;
    shell: string;
    workingDir: string;
    createdAt: Date;
    isActive: boolean;
    environment?: Record<string, string>;
    encoding?: string;
}
export declare class ConsoleManager {
    private consoles;
    private consolesByName;
    private asyncExecutions;
    private notificationCallback?;
    constructor(notificationCallback?: NotificationCallback);
    /**
     * 创建新的控制台会话
     */
    createConsole(shell?: string, workingDir?: string, environment?: Record<string, string>, name?: string, encoding?: string): Promise<ConsoleCreationResult>;
    /**
     * 解析控制台ID（支持通过name或id查找）
     */
    private resolveConsoleId;
    /**
     * 获取控制台会话（支持通过name或id查找）
     */
    private getConsoleSession;
    /**
     * 同步执行命令
     */
    executeSync(consoleIdOrName: string, command: string, timeout?: number, outputFilter?: string): Promise<SyncExecutionResult>;
    /**
     * 异步执行命令
     */
    executeAsync(consoleIdOrName: string, command: string, outputFilter?: string): Promise<string>;
    /**
     * 获取异步执行结果
     */
    getAsyncResult(consoleIdOrName: string, executionId: string, outputFilter?: string): Promise<AsyncExecution>;
    /**
     * 列出所有控制台
     */
    listConsoles(): ConsoleStatus[];
    /**
     * 获取控制台状态
     */
    getConsoleStatus(consoleIdOrName: string): ConsoleStatus;
    /**
     * 关闭控制台
     */
    closeConsole(consoleIdOrName: string): Promise<void>;
    /**
     * 清理所有资源
     */
    cleanup(): Promise<void>;
    /**
     * 获取默认shell
     */
    private getDefaultShell;
    /**
     * 获取shell执行命令的参数
     */
    private getShellArgs;
    /**
     * 获取shell初始化参数（包含编码设置）
     */
    private getShellInitArgs;
    /**
     * 添加输出到缓冲区
     */
    private addToOutputBuffer;
    /**
     * 获取控制台输出缓冲区
     */
    getConsoleOutput(consoleIdOrName: string, lines?: number, outputFilter?: string): Promise<{
        output: string[];
        totalLines: number;
    }>;
    /**
     * 清空控制台输出缓冲区
     */
    clearConsoleOutput(consoleIdOrName: string): Promise<void>;
    private applyOutputFilter;
    /**
     * 获取正在运行的执行数量
     */
    private getRunningExecutionsCount;
}
