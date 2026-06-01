import admin from "firebase-admin";
import fs from "fs";
import { DateTime } from "luxon";

const keyPath = process.argv[2] || "./config/serviceAccountKey.json";
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const nowMad = DateTime.now().setZone("Europe/Madrid");
const target = (nowMad.weekday === 1 ? nowMad.minus({ days: 3 }) : nowMad.minus({ days: 1 })).toFormat("yyyy-MM-dd");

function normFecha(v) {
  if (!v) return "";
  if (typeof v === "object" && typeof v.seconds === "number") {
    return DateTime.fromSeconds(v.seconds).setZone("Europe/Madrid").toFormat("yyyy-MM-dd");
  }
  const s = String(v);
  if (s.length >= 10 && s[2] === "-" && s[5] === "-") return s.substring(0, 10).split("-").reverse().join("-");
  return s.substring(0, 10);
}

const snap = await db.collection("incidencias").get();
let total = 0, kept = 0, rejEmail = 0, rejFollowup = 0, rejFecha = 0;
const fechaCounts = new Map();
const keptIds = [];

for (const d of snap.docs) {
  total++;
  const j = d.data();
  const f = normFecha(j.fecha_procesado);
  fechaCounts.set(f, (fechaCounts.get(f) || 0) + 1);
  if (j.email_enviado === false) { rejEmail++; continue; }
  const fu = j.resultado_followup;
  if (fu !== undefined && fu !== null && String(fu).trim() !== "") { rejFollowup++; continue; }
  if (f !== target) { rejFecha++; continue; }
  kept++;
  keptIds.push(d.id);
}

console.log(JSON.stringify({ target, total, kept, rejEmail, rejFollowup, rejFecha }, null, 2));
console.log("top fechas:", [...fechaCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
console.log("first 5 kept ids:", keptIds.slice(0, 5));
process.exit(0);
