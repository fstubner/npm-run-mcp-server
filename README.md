# npm-run-mcp-server

<div align="center">

*A Model Context Protocol (MCP) server that exposes your project's `package.json` scripts as tools for AI agents.*

[![Test](https://github.com/fstubner/npm-run-mcp-server/workflows/Test/badge.svg)](https://github.com/fstubner/npm-run-mcp-server/actions/workflows/test.yml)
[![Build & Publish](https://github.com/fstubner/npm-run-mcp-server/workflows/Build%20&%20Publish/badge.svg)](https://github.com/fstubner/npm-run-mcp-server/actions/workflows/build-and-publish.yml)
[![NPM Version](https://img.shields.io/npm/v/npm-run-mcp-server.svg)](https://www.npmjs.com/package/npm-run-mcp-server)
[![NPM Installs](https://img.shields.io/npm/dt/npm-run-mcp-server.svg)](https://www.npmjs.com/package/npm-run-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>



## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
  - [GitHub Copilot Chat (VS Code)](#github-copilot-chat-vs-code)
  - [Claude Code (VS Code extension)](#claude-code-vs-code-extension)
  - [Claude Code (terminal / standalone)](#claude-code-terminal--standalone)
  - [Cursor](#cursor)
  - [Install from source](#install-from-source)
- [Testing with MCP Inspector](#testing-with-mcp-inspector)
- [CLI Options](#cli-options)
- [Contributing](#contributing)
- [License](#license)

## Install

```bash
npm i -D npm-run-mcp-server
# or globally
npm i -g npm-run-mcp-server
# ad-hoc
npx npm-run-mcp-server
```

## Usage

### As an MCP Server

Add this server to your MCP host configuration. It uses stdio and automatically detects your project's `package.json` using workspace environment variables or by walking up from the current working directory.

**Key Features:**
- **Automatic Workspace Detection**: Works seamlessly across different projects without configuration changes
- **Smart Tool Names**: Script names with colons (like `install:discord`) are automatically converted to valid tool names (`install_discord`)
- **Rich Descriptions**: Each tool includes the actual script command in its description
- **Package Manager Detection**: Automatically detects npm, pnpm, yarn, or bun
- **Optional Arguments**: Each tool accepts an optional `args` string that is appended after `--` when running the script
- **Auto-Restart on Changes**: Automatically restarts when `package.json` scripts are modified, ensuring tools are always up-to-date

### As a CLI Tool

You can also use this package directly from the command line:

```bash
# List available scripts in current directory
npx npm-run-mcp-server --list-scripts

# Run with verbose output
npx npm-run-mcp-server --verbose

# Specify a different working directory
npx npm-run-mcp-server --cwd /path/to/project --list-scripts

# Override package manager detection
npx npm-run-mcp-server --pm yarn --list-scripts
```

## Configuration

### Install in GitHub Copilot Chat (VS Code)

Option A — per-workspace via `.vscode/mcp.json` (recommended for multi-project use):

```json
{
  "servers": {
    "npm-scripts": {
      "command": "npx",
      "args": ["-y", "npm-run-mcp-server"]
    }
  }
}
```

Option B — user settings (`settings.json`):

```json
{
  "mcp.servers": {
    "npm-scripts": {
      "command": "npx",
      "args": ["-y", "npm-run-mcp-server"]
    }
  }
}
```

**Note**: The server automatically detects the current project's `package.json` using workspace environment variables (like `WORKSPACE_FOLDER_PATHS`) or by walking up from the current working directory. No hardcoded paths are needed - it works seamlessly across all your projects.

Then open Copilot Chat, switch to Agent mode, and start the `npm-scripts` server from the tools panel.

### Multi-Project Workflow

The MCP server is designed to work seamlessly across multiple projects without configuration changes:

- **VS Code/Cursor**: The server automatically detects the current workspace using environment variables like `WORKSPACE_FOLDER_PATHS`
- **Claude Desktop**: The server uses the working directory where Claude is launched
- **No Hardcoded Paths**: All examples use `npx npm-run-mcp-server` without `--cwd` flags
- **Smart Detection**: The server first tries workspace environment variables, then falls back to walking up the directory tree to find the nearest `package.json`
- **Cross-Platform**: Handles Windows/WSL path conversions automatically

This means you can use the same MCP configuration across all your projects, and the server will automatically target the correct project based on your current workspace.

### Auto-Restart on Script Changes

The MCP server automatically monitors your `package.json` file for changes. When you add, remove, or modify scripts, the server will:

1. **Detect the change** and log it (with `--verbose` flag)
2. **Gracefully exit** to allow the MCP client to restart the server
3. **Reload with new tools** based on the updated scripts

This ensures your MCP tools are always synchronized with your current `package.json` scripts without manual intervention.

### Install in Claude Code (VS Code extension)

Add to VS Code user/workspace settings (`settings.json`):

```json
{
  "claude.mcpServers": {
    "npm-scripts": {
      "command": "npx",
      "args": ["-y", "npm-run-mcp-server"]
    }
  }
}
```

**Note**: Workspace settings (`.vscode/settings.json`) are recommended for multi-project use, as they automatically target the current project.

Restart the extension and confirm the server/tools appear.

### Install in Claude Code (terminal / standalone)

Add this server to Claude's global config file (paths vary by OS). Create the file if it doesn't exist.

- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Recommended approach** - Using npx (works across all projects):

```json
{
  "mcpServers": {
    "npm-scripts": {
      "command": "npx",
      "args": ["-y", "npm-run-mcp-server"]
    }
  }
}
```

**Alternative** - Using a local build (requires absolute path):

```json
{
  "mcpServers": {
    "npm-scripts": {
      "command": "node",
      "args": ["/absolute/path/to/npm-run-mcp-server/dist/index.js"]
    }
  }
}
```

**Note**: The npx approach is recommended as it automatically targets the current working directory where Claude is launched.

Optional: include environment variables

```json
{
  "mcpServers": {
    "npm-scripts": {
      "command": "npx",
      "args": ["-y", "npm-run-mcp-server"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Restart Claude after editing the config so it picks up the new server.

### Install in Cursor

- Open Settings → MCP Servers → Add MCP Server
- Type: NPX Package
- Command: `npx`
- Arguments: `-y npm-run-mcp-server`
- Save and start the server from the tools list

**Note**: This configuration automatically works across all your projects. The server will target the current project's `package.json` wherever Cursor is opened.

### Install from source (for testing in another project)

Clone, build, and link globally:

```bash
git clone https://github.com/your-org-or-user/npm-run-mcp-server.git
cd npm-run-mcp-server
npm install
npm run build
npm link
```

In your other project, either reference the global binary or the built file directly:

- Using the linked binary:

```json
{
  "servers": {
    "npm-scripts": {
      "command": "npm-run-mcp-server"
    }
  }
}
```

- Using an explicit Node command (no global link needed):

```json
{
  "servers": {
    "npm-scripts": {
      "command": "node",
      "args": ["/absolute/path/to/npm-run-mcp-server/dist/index.js"]
    }
  }
}
```

Optional CLI flags you can pass in `args`:
- `--cwd /path/to/project` to choose which project to read `package.json` from (rarely needed - server auto-detects by default)
- `--pm npm|pnpm|yarn|bun` to override package manager detection

## Testing with MCP Inspector

Test the server locally before integrating with AI agents:

```bash
# Start MCP Inspector
npx @modelcontextprotocol/inspector

# In the Inspector UI:
# 1. Transport Type: STDIO
# 2. Command: npx
# 3. Arguments: npm-run-mcp-server --cwd /path/to/your/project --verbose
# 4. Click "Connect"
```

You should see your package.json scripts listed as available tools. Try running one - it executes the script and returns the output.

## CLI Options

Available command-line flags:

- `--cwd <path>` - Specify working directory (defaults to current directory)
- `--pm <manager>` - Override package manager detection (npm|pnpm|yarn|bun)
- `--verbose` - Enable detailed logging to stderr
- `--list-scripts` - List available scripts and exit

## Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

- Use the [issue tracker](https://github.com/fstubner/npm-run-mcp-server/issues) to report bugs
- Include your Node.js version, package manager, and operating system
- Provide a minimal reproduction case when possible

### Submitting Changes

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Make** your changes and add tests if applicable
4. **Test** your changes: `npm run build && npm run test`
5. **Commit** your changes: `git commit -m 'Add amazing feature'`
6. **Push** to the branch: `git push origin feature/amazing-feature`
7. **Submit** a pull request

### Development Setup

```bash
git clone https://github.com/fstubner/npm-run-mcp-server.git
cd npm-run-mcp-server
npm install
npm run build
npm run test
```

The project uses a custom build script located in `scripts/build.cjs` that handles TypeScript compilation and shebang injection for the executable.

### Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Keep commits focused and descriptive

## License

MIT


