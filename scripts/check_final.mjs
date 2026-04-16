
import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./config/serviceAccountKey.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const targetIds = [
    "0002070002079700456607", "0002070002079700465104", "0020020082809700000643", "0080530041019819400503", 
    "0080530048159700000052", "0080530060039700000000", "0080530080539701089365", "0080530080539701098445", 
    "0080530080539701098504", "0080530080539701098931", "0080530080539701103673", "0080530080539701104227", 
    "0080530080539701105953", "0080530080539701106115", "0080530080539701106234", "0080530080539701106236", 
    "0080530080539701106246", "0080530080539701113565", "0080530080539701113836", "0080530080539701113886", 
    "0080530080539701113973", "0080530080539701121339", "0080530080539701121725", "0080530080539701121886", 
    "0080530080539701121989", "0080530080539701121992", "0080530080539701122082", "0080530080539701122094", 
    "0080530080539701122205", "0080530080539701122232", "0080530080539701130426", "0080530080539701130427", 
    "0080530080539701130515", "0080530082809700002751", "0080530082809700002761", "0080530082809700002782", 
    "0080530082809700002792", "0080530082809700012050"
  ];
  
  const chunks = [];
  for (let i = 0; i < targetIds.length; i += 10) {
      chunks.push(targetIds.slice(i, i + 10));
  }

  let results = [];
  for (const chunk of chunks) {
      const snap = await db.collection("ejecuciones").where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
      results = results.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  let okCount = 0;
  let failCount = 0;

  console.log("=== COMPROBATORIA FINAL DE LOS 38 ENVÍOS ===");
  results.forEach(r => {
    const isOk = r.email_enviado === true || r.email_enviado === "true";
    if (isOk) okCount++; else failCount++;
    console.log(`[${isOk ? "OK" : "NO"}] ID: ${r.id} | Email: ${r.email_enviado} | Tipo: ${r.tipo_email} | Razón IA (sobreescrita o no): ${r.razon?.substring(0, 50)}...`);
  });

  console.log(`\nResumen Final: ${okCount} desbloqueados y enviados a cca, ${failCount} atascados.`);
  process.exit(0);
}
run();

