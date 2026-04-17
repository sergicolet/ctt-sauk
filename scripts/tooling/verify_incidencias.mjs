import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const w = JSON.parse(readFileSync(join(__dirname, '..', 'workflows', 'incidencias.json'), 'utf-8'));

const names = new Set(w.nodes.map(n => n.name));
console.log('Total nodes:', w.nodes.length);
console.log('Total connections:', Object.keys(w.connections).length);

// Check connections
console.log('\nValidating connections:');
let hasError = false;
for (const [src, conn] of Object.entries(w.connections)) {
  if (!names.has(src)) {
    console.log(`  ❌ Source missing: ${src}`);
    hasError = true;
  }
  for (const output of (conn.main || [])) {
    for (const target of output) {
      if (!names.has(target.node)) {
        console.log(`  ❌ Target missing: ${src} → ${target.node}`);
        hasError = true;
      }
    }
  }
}

if (!hasError) console.log('  ✅ All connections are valid');

// Check Gmail subjects
const followGmail = ['FW Gmail H', 'FW Gmail M', 'FW Gmail K', 'FW Gmail S'];
console.log('\nChecking Gmail Subjects:');
w.nodes.filter(n => followGmail.includes(n.name) || n.name.startsWith('Gmail 0000')).forEach(n => {
  console.log(`  - ${n.name}: ${n.parameters.subject}`);
});

console.log('\n🎉 Verification complete!');
if (hasError) process.exit(1);
