
import fs from "fs";

const TOKEN = process.env.FIREBASE_TOKEN || "PLACEHOLDER_TOKEN";

async function run() {
  const res = await fetch("https://firestore.googleapis.com/v1/projects/ctt-dashboard/databases/(default)/documents/ejecuciones?pageSize=300", {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const data = await res.json();
  if(!data.documents) {
    console.log(data); return;
  }
  const docs = data.documents.map(d => {
    const fields = d.fields;
    const obj = { id: d.name.split("/").pop() };
    for (const key in fields) {
      const val = fields[key];
      if ("stringValue" in val) obj[key] = val.stringValue;
      else if ("booleanValue" in val) obj[key] = val.booleanValue;
      else if ("integerValue" in val) obj[key] = parseInt(val.integerValue);
      else if ("doubleValue" in val) obj[key] = parseFloat(val.doubleValue);
      else if ("timestampValue" in val) obj[key] = val.timestampValue;
      else obj[key] = val;
    }
    return obj;
  });

  const anomalies = [];
  let validRecords = 0;

  for (const doc of docs) {
    validRecords++;
    const id = doc.id;
    
    if (!doc.numero_envio) anomalies.push({ id, type: "MISSING_ENVIO", detail: "numero_envio is missing" });
    if (!doc.estado) anomalies.push({ id, type: "MISSING_ESTADO", detail: "estado is missing" });

    if (doc.email_enviado === true && doc.tipo_email === "none") {
      anomalies.push({ id, type: "EMAIL_MISMATCH", detail: "email_enviado=true but tipo_email=none" });
    }
    if (doc.email_enviado === false && (doc.tipo_email === "standard" || doc.tipo_email === "internal")) {
      anomalies.push({ id, type: "EMAIL_MISMATCH", detail: `email_enviado=false but tipo_email=${doc.tipo_email}` });
    }

    if (doc.forzado_interno === true && doc.email_enviado === false) {
      anomalies.push({ id, type: "FORZADO_INTERNO_FAIL", detail: "forzado_interno=true but email_enviado=false" });
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

    if (typeof doc.email_enviado === "string") anomalies.push({ id, type: "TYPE_ERROR", detail: "email_enviado is string instead of boolean" });
    if (typeof doc.forzado_interno === "string") anomalies.push({ id, type: "TYPE_ERROR", detail: "forzado_interno is string instead of boolean" });
    if (typeof doc.dano === "string") anomalies.push({ id, type: "TYPE_ERROR", detail: "dano is string instead of boolean" });
  }

  const grouped = anomalies.reduce((acc, curr) => {
    acc[curr.type] = (acc[curr.type] || 0) + 1;
    return acc;
  }, {});

  console.log(`Analyzed ${validRecords} records.`);
  console.log("==== ANOMALY SUMMARY ====");
  console.table(grouped);

  console.log("\n==== FORZADO INTERNO FAILS ====");
  console.table(anomalies.filter(a => a.type === "FORZADO_INTERNO_FAIL").map(a => a.id));

  console.log("\n==== EMAIL MISMATCH ====");
  console.table(anomalies.filter(a => a.type === "EMAIL_MISMATCH"));

  console.log("\n==== MALFORMED JSON ====");
  console.table(anomalies.filter(a => a.type === "MALFORMED_JSON").map(a => a.id));
  
  console.log("\n==== TYPE ERRORS ====");
  console.table(anomalies.filter(a => a.type === "TYPE_ERROR"));
}
run();

