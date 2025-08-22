# npm-run-mcp-server

Expose your project's `package.json` scripts as MCP tools via a tiny TypeScript server.

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

## Install in GitHub Copilot Chat (VS Code)

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

## Install in Claude Code (VS Code extension)

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

## Install in Claude Code (terminal / standalone)

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

## Install in Cursor

- Open Settings → MCP Servers → Add MCP Server
- Type: NPX Package
- Command: `npx`
- Arguments: `-y npm-run-mcp-server`
- Save and start the server from the tools list

## Install from source (for testing in another project)

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

## Why

- Keep your automation in `package.json`
- Reuse existing scripts as powerful agent tools

## License

MIT


