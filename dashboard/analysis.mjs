
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBPy3AHeXzaGBwlQSSRkBfwGkrFrZASoTo",
  authDomain: "ctt-dashboard.firebaseapp.com",
  projectId: "ctt-dashboard",
  storageBucket: "ctt-dashboard.firebasestorage.app",
  messagingSenderId: "420165079840",
  appId: "1:420165079840:web:247c90c2839c6b3133fd45",
  measurementId: "G-99RPYRV1FJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function analyze() {
  console.log("Fetching ejecuciones...");
  const snap = await getDocs(collection(db, "ejecuciones"));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Loaded ${docs.length} records.`);

  const anomalies = [];

  for (const doc of docs) {
    const id = doc.id;
    
    // 1. Missing basic fields
    if (!doc.numero_envio) anomalies.push({ id, type: "MISSING_ENVIO", detail: "numero_envio is missing" });
    if (!doc.estado) anomalies.push({ id, type: "MISSING_ESTADO", detail: "estado is missing" });

    // 2. Email mismatch logic
    if (doc.email_enviado === true && doc.tipo_email === "none") {
      anomalies.push({ id, type: "EMAIL_MISMATCH", detail: "email_enviado=true but tipo_email=none" });
    }
    if (doc.email_enviado === false && (doc.tipo_email === "standard" || doc.tipo_email === "internal")) {
      anomalies.push({ id, type: "EMAIL_MISMATCH", detail: `email_enviado=false but tipo_email=${doc.tipo_email}` });
    }

    // 3. Forzado interno failures
    if (doc.forzado_interno === true && doc.email_enviado === false) {
      anomalies.push({ id, type: "FORZADO_INTERNO_FAIL", detail: "forzado_interno=true but email_enviado=false" });
    }

    // 4. Missing JSON
    if (!doc.bultos_historial_json || doc.bultos_historial_json === "[]") {
      anomalies.push({ id, type: "MISSING_BULTOS_JSON", detail: "bultos_historial_json is empty or missing" });
    } else {
      try {
        JSON.parse(doc.bultos_historial_json);
      } catch (e) {
        anomalies.push({ id, type: "MALFORMED_JSON", detail: "bultos_historial_json is not valid JSON" });
      }
    }

    // 5. String boolean / number casting issues
    if (typeof doc.email_enviado === "string") anomalies.push({ id, type: "TYPE_ERROR", detail: "email_enviado is string instead of boolean" });
    if (typeof doc.forzado_interno === "string") anomalies.push({ id, type: "TYPE_ERROR", detail: "forzado_interno is string instead of boolean" });
  }

  // Summary
  const grouped = anomalies.reduce((acc, curr) => {
    acc[curr.type] = (acc[curr.type] || 0) + 1;
    return acc;
  }, {});

  console.log("==== ANOMALY SUMMARY ====");
  console.table(grouped);

  // Group by detail for top issues
  console.log("\n==== FORZADO INTERNO FAILS ====");
  console.table(anomalies.filter(a => a.type === "FORZADO_INTERNO_FAIL").map(a => a.id));

  console.log("\n==== EMAIL MISMATCH ====");
  console.table(anomalies.filter(a => a.type === "EMAIL_MISMATCH"));

  console.log("\n==== MALFORMED JSON ====");
  console.table(anomalies.filter(a => a.type === "MALFORMED_JSON"));

  process.exit(0);
}

analyze().catch(err => {
  console.error(err);
  process.exit(1);
});

