
import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./config/serviceAccountKey.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const doc = await db.collection("ejecuciones").doc("0002070002079700436855").get();
  console.log("Ejecucion 436855:", doc.data());
  process.exit(0);
}
run();

