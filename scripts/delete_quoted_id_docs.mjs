/**
 * delete_quoted_id_docs.mjs
 *
 * Elimina documentos cuyo ID contiene comillas (e.g. "\"0002070...\"")
 * generados por el bug de .toJsonString() en el campo _docid de n8n.
 * Estos docs son duplicados de los docs con ID limpio.
 *
 * Uso: node delete_quoted_id_docs.mjs [--dry-run]
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

const COLLECTIONS = ['ejecuciones', 'incidencias'];

async function deleteQuotedIdDocs(collectionName) {
  console.log(`\n=== ${collectionName} ===`);
  const snap = await db.collection(collectionName).get();

  const toDelete = snap.docs.filter(d => d.id.includes('"'));
  console.log(`  Docs con comillas en ID: ${toDelete.length} / ${snap.size} total`);

  for (const d of toDelete) {
    const cleanId = d.id.replace(/^"+|"+$/g, '');
    console.log(`  [BORRAR] "${d.id}" → equivalente limpio: "${cleanId}"`);
    if (!isDryRun) {
      await d.ref.delete();
    }
  }

  console.log(`  → ${isDryRun ? '(dry-run)' : 'Eliminados'}: ${toDelete.length} docs`);
  return toDelete.length;
}

async function main() {
  console.log(isDryRun ? '🔍 DRY RUN — no se borrará nada' : '🗑️  MODO BORRADO REAL');

  let total = 0;
  for (const col of COLLECTIONS) {
    total += await deleteQuotedIdDocs(col);
  }

  console.log(`\n✅ Total eliminados: ${total}`);
}

main().catch(err => { console.error(err); process.exit(1); });
