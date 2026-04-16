
import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./config/serviceAccountKey.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const today = "16-04-2026";
  const snap = await db.collection("ejecuciones").get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const todayDocs = docs.filter(d => d.fecha_procesado && d.fecha_procesado.startsWith(today));

  const toReexecute = [];

  for (const d of todayDocs) {
    if (d.email_enviado === true || d.email_enviado === "true") continue;

    // Simulate our new strict logic
    const isManifest = d.estado === "0000" || d.estado === "0030" || d.estado === "\"0000\"" || d.estado === "\"0030\"";
    const isTransit = d.estado === "0900" || d.estado === "1000" || d.estado === "\"0900\"" || d.estado === "\"1000\"";
    const isDelivery = d.estado === "1200" || d.estado === "1500" || d.estado === "\"1200\"" || d.estado === "\"1500\"";
    const isStationary = d.estado === "1700" || d.estado === "1800" || d.estado === "\"1700\"" || d.estado === "\"1800\"";
    
    // Alertas sin umbral logic:
    const isTerminal = d.estado && d.estado.includes("2500");
    const isCritical = d.estado && (d.estado.includes("1600") || d.estado.includes("2400") || d.estado.includes("2600") || d.estado.includes("2700") || d.estado.includes("0600") || d.estado.includes("2310") || d.estado.includes("2900") || d.estado.includes("1012") || d.estado.includes("1006") || d.estado.includes("1008"));

    const breachedSLA = 
      d.forzado_interno === true || d.forzado_interno === "true" ||
      isTerminal ||
      isCritical ||
      (isManifest && (parseFloat(d.manifest_hours) || 0) > 24) ||
      (isTransit && (parseFloat(d.transit_hours) || 0) > 24) ||
      (isDelivery && (parseFloat(d.delivery_hours) || 0) > 24) ||
      (isStationary && (parseFloat(d.stationary_hours) || 0) > 24);

    if (breachedSLA) {
      toReexecute.push({ id: d.id, estado: d.estado, reason: d.razon, forzado: d.forzado_interno, horas: Math.max(d.manifest_hours||0, d.transit_hours||0, d.delivery_hours||0, d.stationary_hours||0) });
    }
  }

  console.log("=== ENVIOS SILENCIADOS ERRONEAMENTE HOY (A RE-EJECUTAR) ===");
  console.log(`Encontrados: ${toReexecute.length}`);
  toReexecute.forEach(r => {
    console.log(`- ID: ${r.id} | ESTADO: ${r.estado} | HORAS: ${r.horas.toFixed(1)} | FORZADO_INTERNO: ${r.forzado}`);
  });
  
  // Imprime formato array plano para copypaste
  console.log("\nLista de IDs para n8n:");
  console.log(toReexecute.map(r => r.id).join(", "));
  
  process.exit(0);
}
run();

