/**
 * fix_firestore_types.mjs
 *
 * Convierte campos numéricos que deberían ser strings en Firestore:
 * - ejecuciones.estado: int64 → string "1000", "1600", etc.
 * - ejecuciones.centro: int64 → string
 * - incidencias.centro: int64 → string (si quedaron como int)
 *
 * Uso: node fix_firestore_types.mjs [--dry-run]
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

// Campos que deben ser STRING aunque Firestore los almacenó como int64
const STRING_FIELDS = {
  ejecuciones: ['estado', 'centro'],
  incidencias: ['estado', 'centro'],
};

function needsStringConversion(val) {
  return typeof val === 'number' && !isNaN(val);
}

function toStringValue(val) {
  // Pad códigos de estado a 4 dígitos si son numéricos puros
  const s = String(val);
  if (/^\d+$/.test(s) && s.length <= 4 && parseInt(s) < 10000) {
    return s.padStart(4, '0');
  }
  return s;
}

async function fixCollection(collectionName, fields) {
  console.log(`\n=== ${collectionName} ===`);
  const snap = await db.collection(collectionName).get();
  let fixed = 0, skipped = 0;

  let batch = db.batch();
  let batchCount = 0;
  const BATCH_SIZE = 400;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const updates = {};

    for (const field of fields) {
      const val = data[field];
      if (needsStringConversion(val)) {
        const converted = toStringValue(val);
        updates[field] = converted;
        if (fixed < 10 || isDryRun) {
          console.log(`  [${docSnap.id}] ${field}: ${val} (int64) → "${converted}" (string)`);
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      fixed++;
      if (!isDryRun) {
        batch.update(docSnap.ref, updates);
        batchCount++;
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    } else {
      skipped++;
    }
  }

  if (!isDryRun && batchCount > 0) await batch.commit();
  console.log(`  → ${fixed} corregidos, ${skipped} ya correctos`);
  return fixed;
}

async function main() {
  console.log(isDryRun ? '🔍 DRY RUN — no se escribirá nada' : '✏️  MODO ESCRITURA');

  let total = 0;
  for (const [col, fields] of Object.entries(STRING_FIELDS)) {
    total += await fixCollection(col, fields);
  }

  console.log(`\n✅ Total documentos corregidos: ${total}`);
}

main().catch(err => { console.error(err); process.exit(1); });
