import { readFileSync, existsSync, watch } from 'fs';
import { promises as fsp } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import spawn from 'cross-spawn';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

type PackageJson = {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  packageManager?: string;
  mcp?: unknown;
};

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

type McpScriptConfig = {
  toolName?: string;
  description?: string;
  inputSchema?: unknown;
  argsDescription?: string;
};

type McpConfig = {
  include?: string[];
  exclude?: string[];
  scripts?: Record<string, McpScriptConfig>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readMcpConfig(pkg: PackageJson): McpConfig {
  if (!isPlainObject(pkg.mcp)) return {};
  const raw = pkg.mcp;
  const include = Array.isArray(raw.include) ? raw.include.filter((v): v is string => typeof v === 'string') : undefined;
  const exclude = Array.isArray(raw.exclude) ? raw.exclude.filter((v): v is string => typeof v === 'string') : undefined;
  let scripts: Record<string, McpScriptConfig> | undefined;
  if (isPlainObject(raw.scripts)) {
    scripts = {};
    for (const [name, value] of Object.entries(raw.scripts)) {
      if (!isPlainObject(value)) continue;
      scripts[name] = {
        toolName: typeof value.toolName === 'string' ? value.toolName : undefined,
        description: typeof value.description === 'string' ? value.description : undefined,
        inputSchema: isPlainObject(value.inputSchema) ? value.inputSchema : undefined,
        argsDescription: typeof value.argsDescription === 'string' ? value.argsDescription : undefined,
      };
    }
  }
  return { include, exclude, scripts };
}

function normalizeToolName(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return normalized.length > 0 ? normalized : 'script';
}

function jsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  if (!isPlainObject(schema)) return z.any();

  if (Array.isArray(schema.enum) && schema.enum.every((v) => typeof v === 'string')) {
    const values = schema.enum as string[];
    const [first, ...rest] = values;
    let base: z.ZodTypeAny = first ? z.literal(first) : z.string();
    for (const v of rest) base = z.union([base, z.literal(v)]);
    return typeof schema.description === 'string' ? base.describe(schema.description) : base;
  }

  const type = schema.type;
  let zod: z.ZodTypeAny;
  switch (type) {
    case 'string':
      zod = z.string();
      break;
    case 'boolean':
      zod = z.boolean();
      break;
    case 'number':
      zod = z.number();
      break;
    case 'integer':
      zod = z.number().int();
      break;
    case 'array': {
      const items = schema.items;
      if (isPlainObject(items) && items.type === 'string') zod = z.array(z.string());
      else zod = z.array(z.any());
      break;
    }
    case 'object': {
      const properties = isPlainObject(schema.properties) ? schema.properties : {};
      const requiredSet = new Set(
        Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === 'string') : []
      );

      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, value] of Object.entries(properties)) {
        let prop = jsonSchemaToZod(value);
        if (!requiredSet.has(key)) prop = prop.optional();
        shape[key] = prop;
      }

      const obj = z.object(shape);
      zod = schema.additionalProperties === false ? obj.strict() : obj.passthrough();
      break;
    }
    default:
      zod = z.any();
      break;
  }

  if (typeof schema.description === 'string') zod = zod.describe(schema.description);
  return zod;
}

function buildToolInputSchema(configForScript: McpScriptConfig | undefined): z.ZodTypeAny {
  const base = z
    .object({
      _: z.array(z.string()).optional(),
      args: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(configForScript?.argsDescription ?? 'Optional arguments appended after -- to the script'),
    })
    .passthrough();

  if (!configForScript?.inputSchema) return base;

  const converted = jsonSchemaToZod(configForScript.inputSchema);
  if (converted instanceof z.ZodObject) {
    const merged = converted.extend({
      _: base.shape._,
      args: base.shape.args,
    });
    return configForScript.inputSchema && isPlainObject(configForScript.inputSchema) && configForScript.inputSchema.additionalProperties === false
      ? merged.strict()
      : merged.passthrough();
  }

  return base;
}

function filterScriptNames(scriptNames: string[], config: McpConfig): string[] {
  const include = config.include && config.include.length > 0 ? new Set(config.include) : null;
  const exclude = config.exclude && config.exclude.length > 0 ? new Set(config.exclude) : null;
  const filtered = scriptNames.filter((name) => {
    if (include && !include.has(name)) return false;
    if (exclude && exclude.has(name)) return false;
    return true;
  });
  return filtered.sort();
}

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

function buildRunCommand(
  pm: PackageManager,
  scriptName: string,
  extraArgs: string[]
): { command: string; args: string[] } {
  const command = pm;
  const baseArgs = ['run', scriptName];
  const args = extraArgs.length > 0 ? [...baseArgs, '--', ...extraArgs] : baseArgs;
  return { command, args };
}

function parseArgString(input: string): string[] {
  const result: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaping = false;
  let tokenActive = false;

  const pushCurrent = () => {
    if (!tokenActive) return;
    result.push(current);
    current = '';
    tokenActive = false;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (escaping) {
      current += ch;
      escaping = false;
      tokenActive = true;
      continue;
    }

    if (!inSingle && ch === '\\') {
      escaping = true;
      tokenActive = true;
      continue;
    }

    if (!inDouble && ch === "'" && !escaping) {
      inSingle = !inSingle;
      tokenActive = true;
      continue;
    }

    if (!inSingle && ch === '"' && !escaping) {
      inDouble = !inDouble;
      tokenActive = true;
      continue;
    }

    if (!inSingle && !inDouble && /\s/.test(ch)) {
      pushCurrent();
      continue;
    }

    current += ch;
    tokenActive = true;
  }

  if (escaping) {
    current += '\\';
    tokenActive = true;
  }

  pushCurrent();
  return result;
}

function toolInputToExtraArgs(input: unknown): string[] {
  if (!isPlainObject(input)) return [];

  const rawArgsValue = input.args;
  let rawArgs: string[] = [];
  if (typeof rawArgsValue === 'string') {
    rawArgs = parseArgString(rawArgsValue);
  } else if (Array.isArray(rawArgsValue)) {
    rawArgs = rawArgsValue.map((v) => String(v));
  }

  const positionalValue = input._;
  const positional: string[] = Array.isArray(positionalValue) ? positionalValue.map((v) => String(v)) : [];

  const keys = Object.keys(input)
    .filter((k) => k !== 'args' && k !== '_' && input[k] !== undefined)
    .sort();

  const flags: string[] = [];
  for (const key of keys) {
    const value = input[key];
    const flag = key.startsWith('-') ? key : `--${key}`;

    if (value === null || value === undefined) continue;
    if (typeof value === 'boolean') {
      if (value) flags.push(flag);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === null || item === undefined) continue;
        if (typeof item === 'boolean') {
          if (item) flags.push(flag);
        } else {
          flags.push(flag, String(item));
        }
      }
      continue;
    }

    if (typeof value === 'object') {
      flags.push(flag, JSON.stringify(value));
      continue;
    }

    flags.push(flag, String(value));
  }

  return [...flags, ...positional, ...rawArgs];
}

function trimOutput(out: string, limit = 12000, totalLength?: number): { text: string; truncated: boolean } {
  const total = typeof totalLength === 'number' ? totalLength : out.length;
  if (total <= limit) return { text: out, truncated: false };
  return { text: out.slice(0, limit) + `\n...[truncated ${total - limit} chars]`, truncated: true };
}

async function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null; totalLength: number }> {
  const outputCaptureLimit = 120000;
  let stdout = '';
  let stderr = '';
  let stdoutTotal = 0;
  let stderrTotal = 0;

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const capture = (kind: 'stdout' | 'stderr', chunk: Buffer) => {
    const text = chunk.toString('utf8');
    if (kind === 'stdout') {
      stdoutTotal += text.length;
      if (stdout.length < outputCaptureLimit) stdout += text.slice(0, outputCaptureLimit - stdout.length);
    } else {
      stderrTotal += text.length;
      if (stderr.length < outputCaptureLimit) stderr += text.slice(0, outputCaptureLimit - stderr.length);
    }
  };

  child.stdout?.on('data', (chunk: Buffer) => capture('stdout', chunk));
  child.stderr?.on('data', (chunk: Buffer) => capture('stderr', chunk));

  const exit = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolvePromise, rejectPromise) => {
    child.on('error', (err: Error) => rejectPromise(err));
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => resolvePromise({ exitCode: code, signal }));
  });

  const totalLength = stdoutTotal + stderrTotal + (stdoutTotal > 0 && stderrTotal > 0 ? 1 : 0);
  return { stdout, stderr, exitCode: exit.exitCode, signal: exit.signal, totalLength };
}

async function main() {
  const args = parseCliArgs(process.argv);

  // Try to detect workspace directory from environment variables
  let startCwd: string = process.cwd(); // Initialize with fallback

  if (args.cwd) {
    startCwd = resolve(String(args.cwd));
  } else if (process.env.WORKSPACE_FOLDER_PATHS) {
    // Cursor sets this as a semicolon-separated list, take the first one
    const workspacePaths = process.env.WORKSPACE_FOLDER_PATHS.split(';');
    let workspacePath = workspacePaths[0];

    // Convert Windows path to WSL path if running in WSL
    if (process.platform === 'linux' && workspacePath.match(/^[A-Za-z]:\\/)) {
      // Convert H:\path\to\project to /mnt/h/path/to/project
      const drive = workspacePath[0].toLowerCase();
      const path = workspacePath.slice(3).replace(/\\/g, '/');
      workspacePath = `/mnt/${drive}${path}`;
    }

    startCwd = workspacePath;
  } else if (process.env.VSCODE_WORKSPACE_FOLDER) {
    startCwd = process.env.VSCODE_WORKSPACE_FOLDER;
  } else if (process.env.CURSOR_WORKSPACE_FOLDER) {
    startCwd = process.env.CURSOR_WORKSPACE_FOLDER;
  } else {
    // Fallback: try to find a workspace by looking for common patterns
    const currentDir = process.cwd();

    // If we're in the MCP server directory, try to find a parent directory with package.json
    if (currentDir.includes('npm-run-mcp-server')) {
      // Try going up directories to find a workspace
      let testDir = dirname(currentDir);
      let foundWorkspace = false;
      for (let i = 0; i < 5; i++) {
        const testPkgJson = resolve(testDir, 'package.json');
        if (existsSync(testPkgJson)) {
          startCwd = testDir;
          foundWorkspace = true;
          break;
        }
        testDir = dirname(testDir);
      }
      if (!foundWorkspace) {
        startCwd = currentDir;
      }
    } else {
      startCwd = currentDir;
    }
  }
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
    console.error(`[mcp] detected workspace: ${process.env.VSCODE_WORKSPACE_FOLDER || process.env.CURSOR_WORKSPACE_FOLDER || 'none'}`);
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
      if (verbose) {
        console.error(`[mcp] loaded server info: ${serverName}@${serverVersion}`);
      }
    } else {
      if (verbose) {
        console.error(`[mcp] package.json not found at: ${selfPkgPath}`);
      }
    }
  } catch (error) {
    if (verbose) {
      console.error(`[mcp] error reading package.json:`, error);
    }
  }

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

  const mcpConfig = readMcpConfig(projectPkg);
  const filteredScriptNames = filterScriptNames(scriptNames, mcpConfig);

  if (filteredScriptNames.length === 0) {
    const hint = mcpConfig.include?.length
      ? 'Check your "mcp.include"/"mcp.exclude" settings.'
      : 'Check your package.json "scripts" section.';
    console.error(`npm-run-mcp-server: No scripts selected for exposure. ${hint}`);
  }

  if (verbose && mcpConfig.include?.length) {
    const missing = mcpConfig.include.filter((name) => !scripts[name]);
    if (missing.length > 0) {
      console.error(`[mcp] include list references missing scripts: ${missing.join(', ')}`);
    }
  }

  const toolNameToScripts = new Map<string, string[]>();
  for (const scriptName of filteredScriptNames) {
    const overrideName = mcpConfig.scripts?.[scriptName]?.toolName;
    const toolName = normalizeToolName(overrideName ?? scriptName);
    const existing = toolNameToScripts.get(toolName) ?? [];
    existing.push(scriptName);
    toolNameToScripts.set(toolName, existing);
  }
  const collisions = Array.from(toolNameToScripts.entries()).filter(([, names]) => names.length > 1);
  if (collisions.length > 0) {
    console.error('npm-run-mcp-server: Tool name collisions detected. Set "mcp.scripts.<name>.toolName" to disambiguate.');
    for (const [toolName, names] of collisions) {
      console.error(`  ${toolName}: ${names.join(', ')}`);
    }
    process.exit(1);
  }

  if ((args as any)['list-scripts']) {
    for (const name of filteredScriptNames) {
      console.error(`${name}: ${scripts[name]}`);
    }
    process.exit(0);
  }

  // Register a tool per script
  for (const scriptName of filteredScriptNames) {
    // Sanitize tool name - MCP tools can only contain [a-z0-9_-]
    const configForScript = mcpConfig.scripts?.[scriptName];
    const toolName = normalizeToolName(configForScript?.toolName ?? scriptName);

    // Create a more descriptive description
    const scriptCommand = scripts[scriptName];
    const description = configForScript?.description ?? `Run npm script "${scriptName}": ${scriptCommand}`;

    server.registerTool(
      toolName,
      {
        description,
        inputSchema: buildToolInputSchema(configForScript),
      },
      async (input: Record<string, unknown>) => {
        const extraArgs = toolInputToExtraArgs(input);
        const { command, args: runArgs } = buildRunCommand(pm, scriptName, extraArgs);
        try {
          const { stdout, stderr, exitCode, signal, totalLength } = await runProcess(command, runArgs, {
            cwd: projectDir,
            env: process.env,
          });
          const combined = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr || '';
          const succeeded = exitCode === 0;
          const failurePrefix = succeeded
            ? ''
            : `Command failed (exit=${exitCode}${signal ? `, signal=${signal}` : ''}): ${command} ${runArgs.join(' ')}`;
          const combinedWithStatus = failurePrefix ? [failurePrefix, combined].filter(Boolean).join('\n') : combined;
          const totalLengthWithStatus = failurePrefix ? totalLength + failurePrefix.length + (combined ? 1 : 0) : totalLength;
          const { text } = trimOutput(combinedWithStatus, 12000, totalLengthWithStatus);
          return {
            content: [
              {
                type: 'text',
                text,
              },
            ],
          };
        } catch (error: any) {
          const message = error?.message ? String(error.message) : 'Script failed';
          const { text } = trimOutput(message);
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
    console.error(`[mcp] registered ${filteredScriptNames.length} tools; awaiting stdio client...`);
  }
  await server.connect(transport);
  if (verbose) {
    console.error(`[mcp] stdio transport connected (waiting for initialize)`);
  }

  // Set up file watcher for package.json changes
  if (pkgJsonPath) {
    if (verbose) {
      console.error(`[mcp] setting up file watcher for: ${pkgJsonPath}`);
    }

    const watcher = watch(pkgJsonPath, (eventType) => {
      if (eventType === 'change') {
        if (verbose) {
          console.error(`[mcp] package.json changed, restarting server...`);
        }
        // Gracefully exit to allow the MCP client to restart the server
        process.exit(0);
      }
    });

    // Handle cleanup on process exit
    process.on('SIGINT', () => {
      watcher.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      watcher.close();
      process.exit(0);
    });
  }
}

// Run
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
