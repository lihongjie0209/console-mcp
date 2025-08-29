# Console MCP Server

一个基于TypeScript的控制台管理MCP服务器，提供完整的控制台会话管理功能，支持同步和异步命令执行。

## 功能特性

- **控制台会话管理**: 创建、列出、关闭控制台会话
- **同步命令执行**: 立即执行命令并返回结果
- **异步命令执行**: 后台执行长时间运行的命令
- **结果查询**: 通过执行ID查询异步命令的运行状态和结果
- **异步任务通知**: 异步任务完成时主动通知agent
- **输出过滤**: 支持regex过滤输出，减少上下文占用
- **多种传输模式**: 支持stdio和HTTP(SSE)两种传输模式
- **跨平台支持**: 支持Windows、macOS和Linux
- **资源管理**: 自动清理和优雅关闭

## 解决的核心问题

### Agent执行命令时的死循环问题

在VS Code等IDE环境中，AI Agent执行命令时经常遇到一个关键问题：**当需要执行新命令时，系统会自动终止当前正在运行的命令**，这导致了以下问题：

#### 🚫 传统方式的问题

```bash
# Agent启动服务器
> npm run dev
服务器启动中...
服务器已启动在端口3000

# Agent想要查看日志，但系统会终止上一个命令
> tail -f server.log
# ❌ npm run dev 被自动终止，服务器关闭
# ❌ 形成死循环：启动→终止→重启→终止...
```

#### ✅ Console MCP Server的解决方案

**持久化控制台会话**：每个控制台会话都是独立的进程，不会相互影响

```bash
# 1. 创建专用的服务器控制台
Agent: create_console(name="server-console", workingDir="/project")

# 2. 在服务器控制台中启动服务（异步执行）
Agent: execute_async(console="server-console", command="npm run dev")
# ✅ 服务器在独立会话中持续运行

# 3. 创建另一个控制台进行其他操作
Agent: create_console(name="dev-console", workingDir="/project") 

# 4. 在开发控制台中执行其他命令
Agent: execute_sync(console="dev-console", command="tail -f server.log")
# ✅ 服务器继续运行，不受影响

# 5. 同时监控服务器状态
Agent: get_async_result(console="server-console", executionId="...")
# ✅ 查看服务器运行状态
```

#### 🎯 关键优势

1. **会话隔离**: 每个控制台都是独立的进程空间
2. **异步执行**: 长时间运行的任务不会阻塞其他操作
3. **状态持久**: 服务器、数据库等可以持续运行
4. **并行操作**: 可以同时运行多个独立的任务
5. **智能管理**: Agent可以创建专用会话来管理不同类型的任务

#### 📋 实际应用场景

- **Web开发**: 在一个会话中运行开发服务器，在另一个会话中执行构建、测试等任务
- **数据库操作**: 在专用会话中启动数据库服务，在其他会话中执行查询和维护
- **服务监控**: 长期运行监控脚本，同时执行其他运维任务
- **多项目管理**: 为每个项目创建专用控制台会话

这种设计彻底解决了Agent在自动化任务中遇到的命令冲突和进程终止问题，实现了真正的多任务并行处理。

## 安装

```bash
# 克隆项目
git clone <repository-url>
cd console-mcp

# 安装依赖
npm install

# 构建项目
npm run build
```

## 使用方法

### 命令行界面

项目提供了统一的命令行入口，支持多种运行模式：

```bash
# 查看帮助
node build/cli.js --help

# 查看版本
node build/cli.js --version
```

#### STDIO模式（默认）
```bash
# 使用默认STDIO模式
node build/cli.js

# 或者显式指定STDIO模式
node build/cli.js stdio

# 启用调试模式
node build/cli.js stdio --debug
```

#### HTTP模式
```bash
# 使用默认设置（localhost:3000）
node build/cli.js http

# 指定端口
node build/cli.js http --port 8080

# 指定主机和端口
node build/cli.js http --host 0.0.0.0 --port 3000

# 启用调试模式
node build/cli.js http --debug
```

### NPM脚本

```bash
# 构建项目
npm run build

# 启动STDIO模式
npm run start:stdio

# 启动HTTP模式
npm run start:http

# 启动调试模式
npm run start:debug

# 启动HTTP调试模式
npm run start:http-debug
```

HTTP模式运行后，服务器将提供以下端点：
- 健康检查: `http://localhost:3000/health`
- 服务器信息: `http://localhost:3000/info`
- SSE端点: `http://localhost:3000/sse`
- 消息端点: `http://localhost:3000/messages`

### 在Claude Desktop中配置

#### STDIO模式配置
在Claude Desktop的配置文件中添加以下配置：

**macOS/Linux** (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "console-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/console-mcp/build/cli.js", "stdio"]
    }
  }
}
```

**Windows** (`%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "console-mcp": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\console-mcp\\build\\cli.js", "stdio"]
    }
  }
}
```

## 可用工具

### 1. create_console
创建一个新的控制台会话并返回唯一ID。

**参数**:
- `shell` (可选): 要使用的shell (默认: 系统默认shell)
- `workingDir` (可选): 控制台的工作目录
- `environment` (可选): 环境变量键值对
- `name` (可选): 控制台的名称，便于后续引用

**返回**: 控制台ID (如果提供了name，也会返回name)

### 2. execute_sync
同步执行命令并立即返回结果。

**参数**:
- `console`: 控制台ID或名称
- `command`: 要执行的命令
- `timeout` (可选): 超时时间(秒，默认30秒)
- `outputFilter` (可选): 用于过滤输出的正则表达式模式

**返回**: 命令输出、错误输出和退出码

### 3. execute_async
异步执行命令并返回执行ID以供后续查询。

**参数**:
- `console`: 控制台ID或名称
- `command`: 要执行的命令
- `outputFilter` (可选): 用于过滤输出的正则表达式模式

**返回**: 执行ID

### 4. get_async_result
获取异步执行命令的结果。

**参数**:
- `console`: 控制台ID或名称
- `executionId`: 执行ID

**返回**: 命令状态、输出和结果

### 5. list_consoles
列出所有活动的控制台会话。

**返回**: 控制台列表及其状态信息（包括ID、名称、shell等）

### 6. close_console
关闭控制台会话并清理资源。

**参数**:
- `console`: 要关闭的控制台ID或名称

### 7. get_console_status
获取控制台的详细状态信息。

**参数**:
- `console`: 控制台ID或名称

**返回**: 控制台详细状态

## 使用示例

### 核心场景：避免命令冲突的服务器管理

这是Console MCP Server解决的核心问题的完整示例：

```bash
# 场景：Agent需要启动开发服务器并同时进行其他开发任务

# 1. 创建专用的服务器控制台
Agent: create_console(name="web-server", workingDir="/my-project")
返回: 控制台创建成功，ID: abc123, Name: "web-server"

# 2. 在服务器控制台中异步启动开发服务器
Agent: execute_async(console="web-server", command="npm run dev")
返回: 执行ID: exec-456
# ✅ 服务器开始运行在独立会话中

# 3. 创建开发工作控制台
Agent: create_console(name="dev-work", workingDir="/my-project")
返回: 控制台创建成功，ID: def789, Name: "dev-work"

# 4. 在开发控制台中执行其他任务（服务器不受影响）
Agent: execute_sync(console="dev-work", command="npm test")
返回: 测试结果...
# ✅ 服务器继续运行

# 5. 检查服务器状态
Agent: get_async_result(console="web-server", executionId="exec-456")
返回: 状态: running, 输出: "服务器运行在 http://localhost:3000"

# 6. 在开发控制台中进行代码分析
Agent: execute_sync(console="dev-work", command="eslint src/")
返回: 代码检查结果...
# ✅ 服务器依然正常运行

# 7. 创建第三个控制台进行构建任务
Agent: create_console(name="build-tasks", workingDir="/my-project")
Agent: execute_async(console="build-tasks", command="npm run build:watch")
# ✅ 现在有三个独立的任务在并行运行

# 8. 列出所有活动控制台
Agent: list_consoles()
返回: 
- web-server (运行开发服务器)
- dev-work (开发任务控制台)  
- build-tasks (构建监控)
```

### 基本工作流程

1. **创建有名称的控制台**:
   ```
   Agent: 使用 create_console 工具
   参数: name="dev-env", workingDir="/workspace"
   返回: console-id-12345 和 name: "dev-env"
   ```

2. **使用名称执行同步命令**:
   ```
   Agent: 使用 execute_sync 工具
   参数: console="dev-env", command="ls -la"
   返回: 目录列表
   ```

3. **使用输出过滤的异步命令**:
   ```
   Agent: 使用 execute_async 工具
   参数: console="dev-env", command="npm install", outputFilter="error|warn"
   返回: execution-id-67890 (只输出错误和警告信息)
   ```

4. **查询异步结果**:
   ```
   Agent: 使用 get_async_result 工具
   参数: console="dev-env", executionId="execution-id-67890" 
   返回: 安装进度或完成状态
   ```

5. **列出所有控制台**:
   ```
   Agent: 使用 list_consoles 工具
   返回: 包含ID、名称、状态等信息的控制台列表
   ```

6. **关闭控制台**:
   ```
   Agent: 使用 close_console 工具
   参数: console="dev-env"
   ```

### 高级功能

- **异步任务通知**: 当异步任务完成时，服务器会主动发送通知
- **输出过滤**: 使用正则表达式过滤命令输出，减少上下文占用
- **名称引用**: 可以通过友好的名称而不是UUID来引用控制台
- **多传输模式**: 支持stdio和HTTP(SSE)两种传输模式

## 安全注意事项

- 该服务器可以执行任意系统命令，请在受信任的环境中使用
- 建议在生产环境中添加适当的权限控制和命令白名单
- 异步执行的命令可能会长时间运行，请注意资源管理
- **控制台会话管理**: 由于支持多个持久化会话，请定期检查和清理不需要的控制台会话
- **进程监控**: 长时间运行的异步任务（如服务器）需要适当的监控和管理机制

## 开发

### 项目结构

```
src/
├── index.ts              # 主服务器文件
├── console-manager.ts    # 控制台管理器
└── types.ts             # 类型定义 (如需要)
```

### 开发命令

```bash
# 开发模式 (监听文件变化)
npm run dev

# 构建项目
npm run build

# 清理构建文件
npm run clean
```

## 故障排除

### 常见问题

1. **控制台创建失败**
   - 检查shell路径是否正确
   - 确保有足够的系统权限
   - 验证工作目录是否存在且可访问

2. **命令执行超时**
   - 增加timeout参数值
   - 对于长时间运行的命令使用异步执行

3. **权限错误**
   - 确保运行用户有执行相应命令的权限
   - 检查文件和目录的访问权限

4. **Agent命令冲突问题**
   - **问题**: Agent执行新命令时自动终止之前的命令
   - **解决**: 为不同类型的任务创建专用的控制台会话
   - **最佳实践**: 
     - 服务器类任务使用专用会话（如 `server-console`）
     - 开发任务使用专用会话（如 `dev-console`）
     - 构建任务使用专用会话（如 `build-console`）

5. **会话管理问题**
   - **清理僵尸会话**: 使用 `list_consoles()` 查看活动会话，用 `close_console()` 清理
   - **资源占用**: 定期检查长时间运行的异步任务状态
   - **会话命名**: 使用有意义的名称便于管理（如 `web-server`, `database`, `test-runner`）

## 许可证

MIT

## 贡献

欢迎提交问题和拉取请求来改进这个项目。
