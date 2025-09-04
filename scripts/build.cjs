const fs = require('fs');
const { execSync } = require('child_process');

console.log('Building TypeScript...');
execSync('node ./node_modules/typescript/bin/tsc -p tsconfig.json', { stdio: 'inherit' });

console.log('Adding shebang...');
const filePath = 'dist/index.js';
let content = fs.readFileSync(filePath, 'utf8');
if (!content.startsWith('#!')) {
    content = '#!/usr/bin/env node\n' + content;
    fs.writeFileSync(filePath, content);
}

console.log('Copying package.json...');
fs.copyFileSync('package.json', 'dist/package.json');

console.log('Build completed successfully!');

