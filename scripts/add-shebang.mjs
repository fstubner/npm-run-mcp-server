import { readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(process.cwd(), 'dist', 'index.js');
if (!existsSync(target)) {
  console.error(`[postbuild] File not found: ${target}`);
  process.exit(0);
}

const content = readFileSync(target, 'utf8');
if (!content.startsWith('#!/usr/bin/env node')) {
  writeFileSync(target, '#!/usr/bin/env node\n' + content, 'utf8');
  try { chmodSync(target, 0o755); } catch {}
  console.log('[postbuild] Shebang added to dist/index.js');
} else {
  try { chmodSync(target, 0o755); } catch {}
  console.log('[postbuild] Shebang already present');
}



