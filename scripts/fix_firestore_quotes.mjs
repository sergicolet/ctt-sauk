/**
 * fix_firestore_quotes.mjs
 *
 * Limpia comillas extra en campos de Firestore causadas por .toJsonString() en n8n.
 * Afecta colecciones: incidencias, ejecuciones
 * Campos corregidos: numero_envio, numero_pedido, centro, bulto_afectado, shipping_code, estado
 *
 * Uso: node fix_firestore_quotes.mjs [--dry-run]
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDryRun = process.argv.includes('--dry-run');

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, 'config/serviceAccountKey.json'), 'utf8')
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const QUOTED_FIELDS = {
  incidencias: ['numero_envio', 'numero_pedido', 'centro', 'bulto_afectado', 'shipping_code'],
  ejecuciones: ['numero_envio', 'numero_pedido', 'centro', 'estado'],
};

function stripQuotes(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/^"+|"+$/g, '').replace(/\\"/g, '');
}

function hasQuotedValue(doc, fields) {
  return fields.some(f => typeof doc[f] === 'string' && doc[f].includes('"'));
}

async function fixCollection(collectionName, fields) {
  console.log(`\n=== ${collectionName} ===`);
  const snap = await db.collection(collectionName).get();
  let fixed = 0, skipped = 0;

  const batch_size = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!hasQuotedValue(data, fields)) { skipped++; continue; }

    const updates = {};
    for (const field of fields) {
      const original = data[field];
      const cleaned = stripQuotes(original);
      if (cleaned !== original) {
        updates[field] = cleaned;
        if (!isDryRun || fixed < 5) {
          console.log(`  [${docSnap.id}] ${field}: ${JSON.stringify(original)} → ${JSON.stringify(cleaned)}`);
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      fixed++;
      if (!isDryRun) {
        batch.update(docSnap.ref, updates);
        batchCount++;
        if (batchCount >= batch_size) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }
  }

  if (!isDryRun && batchCount > 0) await batch.commit();

  console.log(`  → ${fixed} documentos corregidos, ${skipped} sin cambios`);
  return fixed;
}

async function main() {
  console.log(isDryRun ? '🔍 DRY RUN — no se escribirá nada' : '✏️  MODO ESCRITURA');

  let total = 0;
  for (const [col, fields] of Object.entries(QUOTED_FIELDS)) {
    total += await fixCollection(col, fields);
  }

  console.log(`\n✅ Total documentos corregidos: ${total}`);
}

main().catch(err => { console.error(err); process.exit(1); });
