import admin from "firebase-admin";
import fs from "fs";

// Load service account
const serviceAccountPath = "./config/serviceAccountKey.json";
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.log("Error init: " + e.message);
}

const db = admin.firestore();

async function analyze() {
  console.log("Fetching ejecuciones...");
  let snap;
  try {
    snap = await db.collection("ejecuciones").get();
  } catch (e) {
    console.error("Auth error:", e.message);
    process.exit(1);
  }
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Loaded ${docs.length} records.`);

  const anomalies = [];

  for (const doc of docs) {
    const id = doc.id;
    
    if (!doc.numero_envio) anomalies.push({ id, type: "MISSING_ENVIO", detail: "numero_envio is missing" });
    if (!doc.estado) anomalies.push({ id, type: "MISSING_ESTADO", detail: "estado is missing" });

    // Logical logic for email_enviado vs target_type/tipo_email
    // Only anomaly if email_enviado=true and kind is none
    if (doc.email_enviado === true && doc.tipo_email === "none") {
      anomalies.push({ id, type: "EMAIL_MISMATCH", detail: "email_enviado=true but tipo_email=none" });
    }
    // Only anomaly if email_enviado=false but it was NOT none
    if (doc.email_enviado === false && (doc.tipo_email === "standard" || doc.tipo_email === "internal")) {
      anomalies.push({ id, type: "EMAIL_MISMATCH", detail: `email_enviado=false but tipo_email=${doc.tipo_email}` });
    }

    if (doc.forzado_interno === true && doc.email_enviado === false) {
      anomalies.push({ id, type: "FORZADO_INTERNO_FAIL", detail: "forzado_interno=true but email_enviado=false" });
    }

    // AI incident logic anomaly (if reasoning existed but we didnt send)
    if (doc.tipo_email === "none" && typeof doc.razon === "string" && doc.razon.length > 5 && doc.email_enviado === false && !doc.resultado_followup) {
      anomalies.push({ id, type: "AI_SILENCE", detail: "AI reasoned an anomaly but didn't send email" });
    }

    if (!doc.bultos_historial_json || doc.bultos_historial_json === "[]") {
      anomalies.push({ id, type: "MISSING_BULTOS_JSON", detail: "bultos_historial_json is empty or missing" });
    } else {
      try {
        JSON.parse(doc.bultos_historial_json);
      } catch (e) {
        anomalies.push({ id, type: "MALFORMED_JSON", detail: "bultos_historial_json is not valid JSON" });
      }
    }

    if (typeof doc.email_enviado === "string") anomalies.push({ id, type: "TYPE_ERROR_EMAIL_ENVIADO", detail: "email_enviado is string" });
    if (typeof doc.forzado_interno === "string") anomalies.push({ id, type: "TYPE_ERROR_FORZADO", detail: "forzado_interno is string" });
    if (typeof doc.dano === "string") anomalies.push({ id, type: "TYPE_ERROR_DANO", detail: "dano is string" });
  }

  const grouped = anomalies.reduce((acc, curr) => {
    acc[curr.type] = (acc[curr.type] || 0) + 1;
    return acc;
  }, {});

  console.log("==== ANOMALY SUMMARY ====");
  console.table(grouped);

  console.log("\n==== TYPE ERRORS ====");
  console.log(anomalies.filter(a => a.type.startsWith("TYPE_ERROR")).map(a => a.id));

  console.log("\n==== FORZADO INTERNO FAILS ====");
  console.log(anomalies.filter(a => a.type === "FORZADO_INTERNO_FAIL").map(a => a.id));

  console.log("\n==== AI REASONED BUT SILENCED ====");
  const silenced = anomalies.filter(a => a.type === "AI_SILENCE");
  for (let s of silenced) {
     const dd = docs.find(d => d.id === s.id);
     console.log(`- ${s.id}: ${dd?._docid || ""} | estado: ${dd?.estado} | razon: ${dd?.razon?.substring(0, 80)}...`);
  }

  console.log("\n==== MALFORMED OR MISSING JSON ====");
  console.log(anomalies.filter(a => a.type === "MISSING_BULTOS_JSON" || a.type === "MALFORMED_JSON").map(a => a.id));

  process.exit(0);
}

analyze().catch(err => {
  console.error(err);
  process.exit(1);
});

