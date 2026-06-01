import admin from "firebase-admin";
import fs from "fs";

const key = JSON.parse(fs.readFileSync("../scripts/config/serviceAccountKey.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

async function verify() {
  const todayStr = "2026-06-01";
  console.log(`Buscando ejecuciones procesadas hoy (${todayStr})...`);

  // Query database
  const snap = await db.collection("ejecuciones").get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const todayDocs = docs.filter(d => {
    return d.fecha_procesado && String(d.fecha_procesado).startsWith(todayStr);
  });

  console.log(`Total de documentos guardados hoy en la colección 'ejecuciones': ${todayDocs.length}`);
  if (todayDocs.length > 0) {
    console.log("Muestra de envíos procesados:");
    todayDocs.slice(0, 5).forEach(d => {
      console.log(`- Código: ${d.id} | Cliente: ${d.tienda} | Estado: ${d.estado} | Notificar: ${d.should_notify}`);
    });
  }

  // Also query incidencias
  const snapInc = await db.collection("incidencias").get();
  const docsInc = snapInc.docs.map(d => ({ id: d.id, ...d.data() }));
  const todayInc = docsInc.filter(d => {
    return d.fecha_procesado && String(d.fecha_procesado).startsWith(todayStr);
  });
  console.log(`Total de documentos guardados hoy en la colección 'incidencias': ${todayInc.length}`);
  if (todayInc.length > 0) {
    console.log("Muestra de incidencias creadas hoy:");
    todayInc.slice(0, 5).forEach(d => {
      console.log(`- Código: ${d.id} | Tipo: ${d.incidencia} | Notificado a: ${d.destinatario}`);
    });
  }

  process.exit(0);
}

verify().catch(e => {
  console.error("Error verifying:", e);
  process.exit(1);
});
