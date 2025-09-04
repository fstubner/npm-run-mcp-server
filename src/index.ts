import { readFileSync, existsSync } from 'fs';
import { promises as fsp } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { exec as nodeExec } from 'child_process';
import { promisify } from 'util';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const exec = promisify(nodeExec);

type PackageJson = {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  packageManager?: string;
};

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

function parseCliArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args as { cwd?: string; pm?: PackageManager; verbose?: boolean; ['list-scripts']?: boolean };
}

async function findNearestPackageJson(startDir: string): Promise<string | null> {
  let current = resolve(startDir);
  while (true) {
    const candidate = resolve(current, 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

async function readPackageJson(pathToPackageJson: string): Promise<PackageJson> {
  const raw = await fsp.readFile(pathToPackageJson, 'utf8');
  return JSON.parse(raw) as PackageJson;
}

function detectPackageManager(projectDir: string, pkg: PackageJson, override?: PackageManager): PackageManager {
  if (override) return override;
  // Prefer explicit packageManager field if present
  if (pkg.packageManager) {
    const pm = pkg.packageManager.split('@')[0] as PackageManager;
    if (pm === 'npm' || pm === 'pnpm' || pm === 'yarn' || pm === 'bun') return pm;
  }
  // Lockfile heuristic
  if (existsSync(resolve(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(projectDir, 'yarn.lock'))) return 'yarn';
  if (existsSync(resolve(projectDir, 'bun.lockb')) || existsSync(resolve(projectDir, 'bun.lock'))) return 'bun';
  return 'npm';
}

function buildRunCommand(pm: PackageManager, scriptName: string, extraArgs?: string): string {
  const quoted = scriptName.replace(/"/g, '\\"');
  const suffix = extraArgs && extraArgs.trim().length > 0 ? ` -- ${extraArgs}` : '';
  switch (pm) {
    case 'pnpm':
      return `pnpm run "${quoted}"${suffix}`;
    case 'yarn':
      return `yarn run "${quoted}"${suffix}`;
    case 'bun':
      return `bun run "${quoted}"${suffix}`;
    case 'npm':
    default:
      return `npm run "${quoted}"${suffix}`;
  }
}

function trimOutput(out: string, limit = 12000): { text: string; truncated: boolean } {
  if (out.length <= limit) return { text: out, truncated: false };
  return { text: out.slice(0, limit) + `\n...[truncated ${out.length - limit} chars]`, truncated: true };
}

async function main() {
  const args = parseCliArgs(process.argv);
  const startCwd = args.cwd ? resolve(String(args.cwd)) : process.cwd();
  const pkgJsonPath = await findNearestPackageJson(startCwd);
  
  let projectDir: string | null = null;
  let projectPkg: PackageJson | null = null;
  
  if (!pkgJsonPath) {
    console.error(`npm-run-mcp-server: No package.json found starting from ${startCwd}`);
    // Don't exit - start server with no tools instead
  } else {
    projectDir = dirname(pkgJsonPath);
    projectPkg = await readPackageJson(pkgJsonPath);
  }
  const verbose = Boolean(
    (args as any).verbose ||
      process.env.MCP_VERBOSE ||
      (process.env.DEBUG && process.env.DEBUG.toLowerCase().includes('mcp'))
  );
  if (verbose) {
    console.error(`[mcp] server starting: cwd=${startCwd}`);
    if (pkgJsonPath) {
      console.error(`[mcp] using package.json: ${pkgJsonPath}`);
    } else {
      console.error(`[mcp] no package.json found - starting with no tools`);
    }
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const selfPkgPath = resolve(__dirname, '..', 'package.json');
  let serverName = 'npm-run-mcp-server';
  let serverVersion = '0.0.0';
  try {
    if (existsSync(selfPkgPath)) {
      const selfPkg = JSON.parse(readFileSync(selfPkgPath, 'utf8')) as PackageJson;
      if (selfPkg.name) serverName = selfPkg.name;
      if (selfPkg.version) serverVersion = selfPkg.version;
    }
  } catch {}

  const server = new McpServer({ name: serverName, version: serverVersion });

  // Handle case where no package.json was found
  if (!projectDir || !projectPkg) {
    if ((args as any)['list-scripts']) {
      console.error('No package.json found - no scripts available');
      process.exit(0);
    }
    
    const transport = new StdioServerTransport();
    if (verbose) {
      console.error(`[mcp] no tools registered; awaiting stdio client...`);
    }
    await server.connect(transport);
    if (verbose) {
      console.error(`[mcp] stdio transport connected (waiting for initialize)`);
    }
    return;
  }

  const pm = detectPackageManager(projectDir, projectPkg, args.pm as PackageManager | undefined);
  if (verbose) {
    console.error(`[mcp] detected package manager: ${pm}`);
  }

  const scripts = projectPkg.scripts ?? {};
  const scriptNames = Object.keys(scripts);

  if (scriptNames.length === 0) {
    console.error(`npm-run-mcp-server: No scripts found in ${pkgJsonPath}`);
  }

  if ((args as any)['list-scripts']) {
    for (const name of scriptNames) {
      console.error(`${name}: ${scripts[name]}`);
    }
    process.exit(0);
  }

  // Register a tool per script
  for (const scriptName of scriptNames) {
    server.tool(
      scriptName,
      {
        description: `Run package script '${scriptName}' via ${pm} in ${projectDir}`,
        inputSchema: {
          type: 'object',
          properties: {
            args: {
              type: 'string',
              description: 'Optional arguments appended after -- to the script'
            }
          }
        },
      },
      async ({ args: extraArgs }: { args?: string }) => {
        const command = buildRunCommand(pm, scriptName, extraArgs);
        try {
          const { stdout, stderr } = await exec(command, {
            cwd: projectDir,
            env: process.env,
            maxBuffer: 16 * 1024 * 1024, // 16MB
            windowsHide: true,
          });
          const combined = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr || '';
          const { text } = trimOutput(combined);
          return {
            content: [
              {
                type: 'text',
                text,
              },
            ],
          };
        } catch (error: any) {
          const stdout = error?.stdout ?? '';
          const stderr = error?.stderr ?? '';
          const message = error?.message ? String(error.message) : 'Script failed';
          const combined = [message, stdout, stderr].filter(Boolean).join('\n');
          const { text } = trimOutput(combined);
          return {
            content: [
              {
                type: 'text',
                text,
              },
            ],
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  if (verbose) {
    console.error(`[mcp] registered ${scriptNames.length} tools; awaiting stdio client...`);
  }
  await server.connect(transport);
  if (verbose) {
    console.error(`[mcp] stdio transport connected (waiting for initialize)`);
  }
}

// Run
main().catch((err) => {
  console.error(err);
  process.exit(1);
});


