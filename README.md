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
  - [As an MCP Server](#as-an-mcp-server)
  - [As a CLI Tool](#as-a-cli-tool)
- [Configuration](#configuration)
  - [GitHub Copilot (VS Code)](#github-copilot-vs-code)
  - [Cursor](#cursor)
  - [Claude Code](#claude-code)
  - [Multi-Project Workflow](#multi-project-workflow)
  - [Auto-Restart on Script Changes](#auto-restart-on-script-changes)
  - [Script Exposure Config](#script-exposure-config)
  - [Install from source](#install-from-source)
- [Testing with MCP Inspector](#testing-with-mcp-inspector)
- [CLI Options](#cli-options)
- [Contributing](#contributing)
  - [Reporting Issues](#reporting-issues)
  - [Submitting Changes](#submitting-changes)
  - [Development Setup](#development-setup)
- [License](#license)

## Install

Installation options.

```bash
npm i -D npm-run-mcp-server
# or globally
npm i -g npm-run-mcp-server
# ad-hoc
npx npm-run-mcp-server
```

**Current version**: 0.2.10

## Usage

MCP server and CLI tool usage.

### As an MCP Server

Add this server to your MCP host configuration. It uses stdio and automatically detects your project's `package.json` using workspace environment variables or by walking up from the current working directory.

**Key Features:**
- **Automatic Workspace Detection**: Works seamlessly across different projects without configuration changes
- **Smart Tool Names**: Script names with colons (like `install:discord`) are automatically converted to valid tool names (`install_discord`)
- **Rich Descriptions**: Each tool includes the actual script command in its description
- **Package Manager Detection**: Automatically detects npm, pnpm, yarn, or bun
- **Optional Arguments**: Each tool accepts optional `args` (`string` or `string[]`) appended after `--` when running the script
- **Auto-Restart on Changes**: Automatically restarts when `package.json` scripts are modified, ensuring tools are always up-to-date

Note: scripts run inside the target project. If they rely on local dependencies (eslint, vitest, tsc), install them first (for example, `npm install`).

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

Setup instructions for AI agents.

### GitHub Copilot (VS Code)

#### Via UI
1. Open VS Code settings
2. Search for "MCP"
3. Add server configuration in settings.json

#### Via Config File
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

Then open Copilot Chat, switch to Agent mode, and start the `npm-scripts` server from the tools panel.

### Cursor

#### Via UI
1. Open Settings -> MCP Servers -> Add MCP Server
2. Type: NPX Package
3. Command: `npx`
4. Arguments: `-y npm-run-mcp-server`
5. Save and start the server from the tools list

#### Via Config File
Add to Cursor's MCP configuration:

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

### Claude Code

#### Via Terminal
```bash
claude mcp add npm-scripts npx -y npm-run-mcp-server
```

#### Via Config File
Add to Claude Code's config file:
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

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

Restart Claude Code after editing the config.

### Multi-Project Workflow

The MCP server automatically detects your project's `package.json` using workspace environment variables or by walking up from the current working directory. No hardcoded paths needed - it works seamlessly across all your projects.

### Auto-Restart on Script Changes

The server automatically monitors your `package.json` file for changes. When you modify scripts, the server gracefully exits to allow the MCP client to restart with updated tools.

### Script Exposure Config

You can make the tool surface more deterministic by explicitly choosing which scripts are exposed and by defining per-script tool metadata. Add an `mcp` section to your project's `package.json`:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "build:dev": "tsc -p tsconfig.json --watch",
    "lint": "eslint ."
  },
  "mcp": {
    "include": ["build", "build:dev"],
    "exclude": ["lint"],
    "scripts": {
      "build:dev": {
        "toolName": "build_dev",
        "description": "Build in watch mode",
        "inputSchema": {
          "type": "object",
          "properties": {
            "watch": { "type": "boolean" }
          }
        }
      }
    }
  }
}
```

Notes:
- `include` and `exclude` are exact script names.
- `toolName` lets you resolve naming collisions after sanitization.
- `inputSchema` replaces the default `{ args: string | string[] }` input model for that tool.
- Tool input fields (other than `args`) are converted to CLI flags, e.g. `{ "watch": true }` becomes `--watch` and `{ "port": 3000 }` becomes `--port 3000`.
- If filters result in zero tools, the server logs a warning so misconfigurations are easy to spot.

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

Test the server locally.

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

Command-line flags.

- `--cwd <path>` - Specify working directory (defaults to current directory)
- `--pm <manager>` - Override package manager detection (npm|pnpm|yarn|bun)
- `--verbose` - Enable detailed logging to stderr
- `--list-scripts` - List available scripts and exit

## Contributing

Contributions welcome! How to help with development, reporting issues, and submitting changes.

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


## License

MIT License.
