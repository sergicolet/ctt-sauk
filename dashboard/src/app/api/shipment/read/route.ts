import { NextResponse } from "next/server";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { readShipment } from "@/lib/ctt-core";

// Firebase Admin (para leer numero_avisos previos de incidencias).
function db() {
  if (admin.apps.length === 0) {
    let key: any = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try { key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch {}
    }
    if (!key) {
      const p = path.resolve(process.cwd(), "../scripts/config/serviceAccountKey.json");
      if (fs.existsSync(p)) key = JSON.parse(fs.readFileSync(p, "utf8"));
    }
    if (key) admin.initializeApp({ credential: admin.credential.cert(key) });
    else admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * POST { shipping_code, client_code? }
 * Lectura READ-ONLY de un envío: todos los bultos con su estado real, SLA, IA y decisión.
 * NO escribe en Firestore ni envía emails.
 */
export async function POST(req: Request) {
  try {
    const { shipping_code, client_code } = await req.json();
    if (!shipping_code) return NextResponse.json({ success: false, error: "Falta shipping_code" }, { status: 400 });

    const code = String(shipping_code).replace(/"/g, "").trim();

    // Buscar incidencia previa (numero_avisos) — best effort.
    let prev: any = null;
    try {
      const snap = await db().collection("incidencias").doc(code).get();
      if (snap.exists) prev = snap.data();
    } catch {}

    const result = await readShipment(code, { client_code, prev });
    return NextResponse.json({ success: true, result });
  } catch (e: any) {
    console.error("[shipment/read]", e);
    return NextResponse.json({ success: false, error: e.message || "Error leyendo envío" }, { status: 500 });
  }
}
