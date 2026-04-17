import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const w = JSON.parse(readFileSync(join(__dirname, '..', 'workflows', 'main.json'), 'utf-8'));

const names = new Set(w.nodes.map(n => n.name));
console.log('Total nodes:', w.nodes.length);
console.log('Total connections:', Object.keys(w.connections).length);
console.log('');

// Check all $('NodeName') and $node['NodeName'] references
const refs = new Set();
for (const node of w.nodes) {
  const s = JSON.stringify(node.parameters);
  // Match $('NodeName') or $("NodeName")
  const m1 = [...s.matchAll(/\$\(['"]([^'"]+)['"]\)/g)];
  for (const r of m1) refs.add(r[1]);
  // Match $node['NodeName']
  const m2 = [...s.matchAll(/\$node\['([^']+)'\]/g)];
  for (const r of m2) refs.add(r[1]);
}

console.log('Node references found:');
let hasError = false;
for (const r of [...refs].sort()) {
  const ok = names.has(r);
  if (!ok) hasError = true;
  console.log(`  ${ok ? '✅' : '❌'} ${r}`);
}

// Check connection targets
console.log('\nConnection targets:');
for (const [src, conn] of Object.entries(w.connections)) {
  if (!names.has(src)) {
    console.log(`  ❌ Source node missing: ${src}`);
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

if (!hasError) {
  console.log('  All connection sources and targets are valid ✅');
}

// Verify the full processing chain
console.log('\n=== Processing Chain ===');
let current = 'Schedule Trigger';
const visited = new Set();
while (current && !visited.has(current)) {
  visited.add(current);
  const conn = w.connections[current];
  if (!conn) { console.log(`  ${current} → (end)`); break; }
  const targets = conn.main?.flatMap(o => o.map(t => t.node)) || [];
  console.log(`  ${current} → ${targets.join(' | ')}`);
  // Follow first non-loop path
  current = targets[0];
  if (targets.length > 1) {
    for (const t of targets.slice(1)) {
      console.log(`    ↳ (branch) ${t}`);
    }
  }
}

console.log('\n🎉 Verification complete!');
