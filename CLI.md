# Console MCP Server CLI

Console MCP Server 提供了统一的命令行入口，支持多种运行模式和配置选项。

## 安装

```bash
npm install
npm run build
```

## 使用方法

### 基本语法

```bash
node build/cli.js [command] [options]
```

### 可用命令

#### 1. STDIO 模式（默认）

```bash
# 使用默认STDIO模式
node build/cli.js

# 或者显式指定STDIO模式
node build/cli.js stdio

# 启用调试模式
node build/cli.js stdio --debug
```

STDIO模式适用于：
- MCP客户端直接连接
- 进程间通信
- 标准输入输出交互

#### 2. HTTP 模式

```bash
# 使用默认设置（localhost:3000）
node build/cli.js http

# 指定端口
node build/cli.js http --port 8080

# 指定主机和端口
node build/cli.js http --host 0.0.0.0 --port 3000

# 启用调试模式
node build/cli.js http --debug --port 3000
```

HTTP模式适用于：
- Web应用集成
- 远程访问
- 多客户端连接

### 选项说明

#### 全局选项

- `--debug`: 启用调试模式，输出详细日志信息
- `--help`: 显示帮助信息
- `--version`: 显示版本信息

#### HTTP模式选项

- `-p, --port <number>`: 指定监听端口（默认：3000）
- `--host <string>`: 指定绑定主机（默认：localhost）

### 示例

#### 开发环境

```bash
# 开发模式，启用调试
node build/cli.js stdio --debug
```

#### 生产环境

```bash
# HTTP模式，绑定到所有接口
node build/cli.js http --host 0.0.0.0 --port 80
```

#### 本地测试

```bash
# HTTP模式，自定义端口
node build/cli.js http --port 8080 --debug
```

### HTTP端点

当使用HTTP模式时，服务器会提供以下端点：

- `GET /health`: 健康检查
- `GET /info`: 服务器信息和可用工具列表
- `GET /sse`: SSE连接端点（用于MCP通信）
- `POST /messages`: 消息处理端点（用于MCP通信）

### 环境变量

支持以下环境变量：

- `PORT`: 默认HTTP端口（被--port参数覆盖）
- `HOST`: 默认绑定主机（被--host参数覆盖）

### NPM脚本

在package.json中，您可以添加便捷脚本：

```json
{
  "scripts": {
    "start:stdio": "node build/cli.js stdio",
    "start:http": "node build/cli.js http",
    "start:debug": "node build/cli.js stdio --debug",
    "start:http-debug": "node build/cli.js http --debug"
  }
}
```

### 日志输出

- **STDIO模式**: 日志输出到stderr，避免干扰MCP通信
- **HTTP模式**: 日志输出到stderr，包含HTTP相关信息
- **调试模式**: 输出详细的调试信息，包括连接状态和工具调用

### 故障排除

#### 端口被占用

```bash
# 检查端口使用情况
netstat -ano | findstr :3000

# 使用不同端口
node build/cli.js http --port 3001
```

#### 权限问题

```bash
# Windows上可能需要管理员权限运行低端口
# 或者使用高端口号（>1024）
node build/cli.js http --port 8080
```

#### 连接问题

```bash
# 启用调试模式查看详细信息
node build/cli.js http --debug
```
