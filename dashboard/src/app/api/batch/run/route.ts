import { NextResponse } from "next/server";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

// Reutiliza el Admin SDK ya inicializado (o lo inicializa) para obtener un token GCP.
function ensureAdmin() {
  if (admin.apps.length === 0) {
    let key: any = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try { key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch {}
    }
    if (!key) {
      const p = path.resolve(process.cwd(), "../scripts/config/serviceAccountKey.json");
      if (fs.existsSync(p)) key = JSON.parse(fs.readFileSync(p, "utf8"));
    }
    admin.initializeApp(key ? { credential: admin.credential.cert(key) } : undefined);
  }
}

const PROJECT = "ctt-dashboard";
const REGION = "europe-southwest1";
const JOB = "ctt-batch";

/**
 * POST → dispara el Cloud Run Job ctt-batch (ejecución inmediata).
 * Requiere que la service account tenga permiso run.jobs.run (roles/run.developer).
 */
export async function POST() {
  try {
    ensureAdmin();
    const tokenObj = await admin.app().options.credential!.getAccessToken();
    const token = tokenObj.access_token;

    const url = `https://${REGION}-run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/${JOB}:run`;
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ success: false, error: `Cloud Run ${res.status}: ${txt.slice(0, 300)}` }, { status: 502 });
    }
    return NextResponse.json({ success: true, message: "Batch lanzado en la nube. Resultados en unos minutos (ver logs)." });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 });
  }
}
