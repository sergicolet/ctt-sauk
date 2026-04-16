
import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./config/serviceAccountKey.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
admin.firestore().collection("ejecuciones").doc("0080530080539701098445").get().then(doc => console.log(doc.data())).then(() => process.exit(0));

