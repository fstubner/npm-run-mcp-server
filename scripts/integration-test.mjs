import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixtureDir = path.join(repoRoot, 'fixtures', 'mcp-project');
const serverPath = path.join(repoRoot, 'dist', 'index.js');

async function run(configArg, expectedToolName, expectedOutputFragment) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath, '--cwd', fixtureDir, '--config', configArg],
    stderr: 'inherit',
  });

  const client = new Client({ name: 'mcp-integration-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const tool = tools.tools.find((item) => item.name === expectedToolName);

    if (!tool) {
      console.error(`Expected tool "${expectedToolName}" not found.`);
      process.exit(1);
    }

    const result = await client.callTool({ name: expectedToolName, arguments: {} });
    const text = result.content?.[0]?.text ?? '';
    if (!text.includes(expectedOutputFragment)) {
      console.error('Unexpected tool output:');
      console.error(text);
      process.exit(1);
    }
  } finally {
    await transport.close();
  }
}

// JSON config file
await run('npm-run-mcp.config.json', 'say_hello', 'mcp fixture hello');

// JSONC config file (comments + trailing commas)
await run('custom.config.jsonc', 'say_goodbye', 'mcp fixture goodbye');
