# Console MCP Server 使用示例

这个文档展示了如何使用Console MCP Server的各种功能。

## 基本使用流程

### 1. 创建控制台
```
工具: create_console
参数: 
{
  "shell": "powershell", // Windows上使用PowerShell
  "workingDir": "C:\\Users\\Username\\Projects"
}
返回: "console-abc123"
```

### 2. 执行同步命令
```
工具: execute_sync  
参数:
{
  "consoleId": "console-abc123",
  "command": "dir",
  "timeout": 10
}
返回: 目录列表输出
```

### 3. 执行异步命令
```
工具: execute_async
参数:
{
  "consoleId": "console-abc123", 
  "command": "npm install express"
}
返回: "execution-def456"
```

### 4. 查询异步结果
```
工具: get_async_result
参数:
{
  "consoleId": "console-abc123",
  "executionId": "execution-def456"
}
返回: 安装进度或完成状态
```

### 5. 列出所有控制台
```
工具: list_consoles
返回: 所有活跃控制台的列表
```

### 6. 获取控制台状态
```
工具: get_console_status
参数:
{
  "consoleId": "console-abc123"
}
返回: 控制台详细状态信息
```

### 7. 关闭控制台
```
工具: close_console
参数:
{
  "consoleId": "console-abc123"
}
返回: 关闭确认信息
```

## 实际使用场景

### 场景1: 项目构建
1. 创建控制台，指定项目目录
2. 同步执行 "git status" 检查状态
3. 异步执行 "npm run build"
4. 定期查询构建进度
5. 构建完成后关闭控制台

### 场景2: 多任务并行处理  
1. 创建多个控制台会话
2. 在不同控制台中并行执行不同任务
3. 使用 list_consoles 监控所有会话
4. 根据需要查询各个任务的执行结果

### 场景3: 长时间运行的服务
1. 创建控制台启动服务器
2. 异步执行 "npm start" 或类似命令
3. 定期检查服务运行状态
4. 需要时可以关闭控制台停止服务

## 注意事项

- 控制台ID和执行ID都是UUID格式，需要妥善保存用于后续操作
- 异步命令适合长时间运行的任务，同步命令适合快速操作
- 不再需要的控制台应及时关闭以释放系统资源
- 命令执行权限受运行MCP服务器的用户权限限制
