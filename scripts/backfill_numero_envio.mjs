/**
 * backfill_numero_envio.mjs
 *
 * Rellena el campo numero_envio en documentos de ejecuciones que no lo tienen.
 * El doc ID en la colección ejecuciones ES el tracking number.
 *
 * Uso: node backfill_numero_envio.mjs [--dry-run]
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

async function main() {
  console.log(isDryRun ? '🔍 DRY RUN' : '✏️  MODO ESCRITURA');

  const snap = await db.collection('ejecuciones').get();
  let fixed = 0, skipped = 0;

  let batch = db.batch();
  let count = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const envio = data.numero_envio;
    // Skip if already has a clean tracking number
    if (envio && String(envio).trim() && !String(envio).includes('"')) {
      skipped++;
      continue;
    }

    // The doc ID is the tracking number
    const cleanId = d.id.replace(/^"+|"+$/g, '');
    if (!cleanId) { skipped++; continue; }

    fixed++;
    if (fixed <= 10) console.log(`  [${d.id}] numero_envio: ${JSON.stringify(envio)} → "${cleanId}"`);

    if (!isDryRun) {
      batch.update(d.ref, { numero_envio: cleanId });
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
  }

  if (!isDryRun && count > 0) await batch.commit();

  console.log(`\n✅ numero_envio backfilled: ${fixed} docs | ya correctos: ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
