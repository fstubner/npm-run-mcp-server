# npm-run-mcp-server

<div align="center">

*A Model Context Protocol (MCP) server that exposes your project's `package.json` scripts as tools for AI agents.*

[![Test](https://github.com/fstubner/npm-run-mcp-server/workflows/Test/badge.svg)](https://github.com/fstubner/npm-run-mcp-server/actions/workflows/test.yml)
[![Build & Publish](https://github.com/fstubner/npm-run-mcp-server/workflows/Publish%20to%20NPM/badge.svg)](https://github.com/fstubner/npm-run-mcp-server/actions/workflows/build-and-publish.yml)
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

Add this server to your MCP host configuration. It uses stdio and dynamically exposes each script from the closest `package.json` (walking up from `process.cwd()`).

The tool names match your script names. Each tool accepts an optional `args` string that is appended after `--` when running the script. The server detects your package manager (npm, pnpm, yarn, bun).

## Configuration

### Install in GitHub Copilot Chat (VS Code)

Option A — per-workspace via `.vscode/mcp.json`:

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

Then open Copilot Chat, switch to Agent mode, and start the `npm-scripts` server from the tools panel.

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

Restart the extension and confirm the server/tools appear.

### Install in Claude Code (terminal / standalone)

Add this server to Claude's global config file (paths vary by OS). Create the file if it doesn't exist.

- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Using npx:

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

Using a local build (no global install):

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
- `--cwd /path/to/project` to choose which project to read `package.json` from
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

### Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Keep commits focused and descriptive

## License

MIT


