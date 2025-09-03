const fs = require('fs');
const { execSync } = require('child_process');

console.log('Building TypeScript...');
execSync('node ./node_modules/typescript/bin/tsc -p tsconfig.json', { stdio: 'inherit' });

console.log('Adding shebang...');
const content = fs.readFileSync('dist/index.js', 'utf8');
fs.writeFileSync('dist/index.js', '#!/usr/bin/env node\n' + content);

console.log('Build completed successfully!');

