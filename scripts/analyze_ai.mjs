
import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./config/serviceAccountKey.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const snap = await db.collection("ejecuciones").get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log("Total ejecuciones:", docs.length);

  const suspicious = [];
  
  for (const d of docs) {
    if (!d.razon) continue;
    
    // Evaluate if AI silence was suspicious or if reasoning is weird
    const isStationary = d.estado === "1700" || d.estado === "1800" || d.estado === "\"1700\"" || d.estado === "\"1800\"";
    const isDelivery = d.estado === "1200" || d.estado === "1500" || d.estado === "\"1200\"" || d.estado === "\"1500\"";
    const isTransit = d.estado === "0900" || d.estado === "1000" || d.estado === "\"0900\"" || d.estado === "\"1000\"";
    
    const exceededSLA = 
      (isStationary && d.stationary_hours > 24) ||
      (isDelivery && d.delivery_hours > 24) ||
      (isTransit && d.transit_hours > 24);

    if (exceededSLA && d.email_enviado === false) {
      suspicious.push({
        id: d.id, 
        estado: d.estado,
        hours: isStationary ? d.stationary_hours : (isDelivery ? d.delivery_hours : d.transit_hours),
        razon: d.razon,
        issue: "AI exceeded SLA but did not send email"
      });
    }

    if (d.estado && d.estado.includes("2500") && d.email_enviado === false) {
      suspicious.push({
        id: d.id,
        estado: d.estado,
        razon: d.razon,
        issue: "Devolucion [2500] ignored by AI" 
      });
    }

    if (d.razon.toLowerCase().includes("no es un fallo crítico") && (d.estado.includes("1600") || d.estado.includes("2400"))) {
       suspicious.push({ id: d.id, estado: d.estado, razon: d.razon, issue: "AI dismissed explicit critical failure" });
    }
  }

  // Print highly unique reasonings
  const uniqueIssues = {};
  suspicious.forEach(s => {
    if (!uniqueIssues[s.issue]) uniqueIssues[s.issue] = [];
    uniqueIssues[s.issue].push(s);
  });

  for (let key in uniqueIssues) {
    console.log("\n--- " + key + " ---");
    // print up to 5 samples
    uniqueIssues[key].slice(0, 5).forEach(s => {
      console.log(`ID: ${s.id} | EST: ${s.estado} | Razon: ${s.razon}`);
    });
    console.log(`...and ${uniqueIssues[key].length - 5} more.`);
  }

  process.exit(0);
}
run();

