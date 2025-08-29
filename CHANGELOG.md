# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-29

### Added
- Initial release of Console MCP Server
- TypeScript MCP server for console management
- Support for multiple persistent console sessions
- Synchronous and asynchronous command execution
- Output filtering with regex support
- Output buffering with timestamps
- Cross-platform shell support (PowerShell, CMD, Bash)
- HTTP and STDIO transport modes
- Session isolation to prevent command conflicts
- Real-time output monitoring
- Console session management (create, list, close, status)
- Curl command execution with fallback to Node.js HTTP client

### Features
- **Session Management**: Create named console sessions with custom environments
- **Command Execution**: Both sync and async execution with timeout support
- **Output Control**: Filter and buffer output with regex patterns
- **Multi-Platform**: Works on Windows, macOS, and Linux
- **Agent-Friendly**: Solves VS Code agent command conflict issues

### Security
- Proper process cleanup and resource management
- Session isolation for security
- Configurable timeouts and limits

### Documentation
- Comprehensive README with usage examples
- CLI documentation
- API examples and best practices
