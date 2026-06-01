/**
 * Acceso a Firestore: init admin, búsqueda de incidencia previa, preparación de
 * contexto (skip / force_internal / numero_avisos) y escrituras en batch.
 * Porta "Firestore: Buscar Incidencia Previa", "Code: Preparar Contexto" y los
 * nodos de log/registro (Fase 3).
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: admin.firestore.Firestore;

export function initFirestore(): admin.firestore.Firestore {
  if (admin.apps.length === 0) {
    let key: any = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (e) {
        log.error("FIREBASE_SERVICE_ACCOUNT inválido", { razon: String(e) });
      }
    }
    if (!key) {
      // Fallback local: misma ruta que usa el dashboard.
      const p = path.resolve(__dirname, "../../../scripts/config/serviceAccountKey.json");
      if (fs.existsSync(p)) key = JSON.parse(fs.readFileSync(p, "utf8"));
    }
    if (key) {
      admin.initializeApp({ credential: admin.credential.cert(key) });
    } else {
      // Cloud Run: usa ADC de la service account asignada.
      admin.initializeApp();
    }
  }
  db = admin.firestore();
  return db;
}

export interface PrevContext {
  exists: boolean;
  skip: boolean;
  force_internal: boolean;
  numero_avisos: number;
  _docid: string;
  client_references: string[];
}

function normalizeFecha(f: any): string {
  if (!f) return "";
  const s = String(f).replace(/"/g, "").substring(0, 10);
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split("-");
    return `${y}-${m}-${d}`;
  }
  return s;
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Busca el doc previo en `incidencias` y calcula skip/force_internal/numero_avisos.
 * Espejo de "Firestore: Buscar Incidencia Previa" + "Code: Preparar Contexto".
 */
export async function prepareContext(
  shippingCode: string,
  estadoActual: string,
  fallbackReferences: string[],
): Promise<PrevContext> {
  const now = new Date();
  const hoy = ymd(now);
  const ayer = ymd(new Date(now.getTime() - 86400000));
  const is2500 = String(estadoActual) === "2500";

  let docData: any = null;
  try {
    const snap = await db.collection("incidencias").doc(shippingCode).get();
    if (snap.exists) docData = snap.data();
  } catch (e) {
    log.warn("Lectura incidencia previa falló", { shipping_code: shippingCode, razon: String(e) });
  }

  const docValido = docData?.numero_envio || docData?.shipping_code;
  const doc = docValido ? docData : null;

  // Saneamiento numero_avisos (evita el bug histórico de concatenación).
  let rawAvisos = String(doc?.numero_avisos ?? 0).replace(/"/g, "");
  let numero_avisos = parseInt(rawAvisos) || 0;
  if (numero_avisos > 100) numero_avisos = rawAvisos.length;

  let skip = false;
  let force_internal = false;
  if (doc) {
    const fecha = normalizeFecha(doc.fecha_procesado);
    const estadoAnterior = String(doc.estado || "");
    skip = !is2500 && fecha === hoy && String(estadoActual) === estadoAnterior;
    force_internal = !skip && (fecha === ayer || is2500);
  } else {
    force_internal = is2500;
  }

  const client_references =
    doc?.client_references || (doc?.numero_pedido ? [String(doc.numero_pedido)] : fallbackReferences);

  return {
    exists: !!doc,
    skip,
    force_internal,
    numero_avisos,
    _docid: String(doc?._docid || shippingCode).replace(/"/g, ""),
    client_references: client_references.length ? client_references : ["sin-ref"],
  };
}

export function getDb(): admin.firestore.Firestore {
  return db;
}

/**
 * Persiste los resultados en batch (máx 500 ops por batch de Firestore).
 * Respeta DRY_RUN (no escribe) y BATCH_COLLECTION_SUFFIX (p.ej. "_batch_test").
 *
 * Por cada envío:
 *  - ejecuciones{sufijo}/{docid}        → set (siempre)
 *  - incidencias{sufijo}/{docid}        → set si incidencia, delete si no
 *  - trazabilidad_ejecuciones{sufijo}/  → set (doc id = docid)
 */
export interface PersistInput {
  docid: string;
  ejecucion: Record<string, unknown>;
  incidencia: Record<string, unknown> | null;
  trazabilidad: Record<string, unknown>;
}

export async function persistAll(records: PersistInput[]): Promise<void> {
  const dryRun = process.env.DRY_RUN !== "false"; // por defecto DRY_RUN activo
  const suffix = process.env.BATCH_COLLECTION_SUFFIX ?? "_batch_test";
  const colEjec = `ejecuciones${suffix}`;
  const colInc = `incidencias${suffix}`;
  const colTraza = `trazabilidad_ejecuciones${suffix}`;

  if (dryRun) {
    log.info("DRY_RUN activo: no se escribe en Firestore", {
      escrituras_simuladas: records.length,
      colecciones: `${colEjec}, ${colInc}, ${colTraza}`,
    } as any);
    return;
  }

  // 3 ops por envío en el peor caso → trocear en lotes de ~150 envíos (450 ops).
  const CHUNK = 150;
  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const r of slice) {
      batch.set(db.collection(colEjec).doc(r.docid), r.ejecucion, { merge: true });
      if (r.incidencia) {
        batch.set(db.collection(colInc).doc(r.docid), r.incidencia, { merge: true });
      } else {
        batch.delete(db.collection(colInc).doc(r.docid));
      }
      batch.set(db.collection(colTraza).doc(r.docid), r.trazabilidad, { merge: true });
    }
    await batch.commit();
    log.info("Lote Firestore escrito", { lote: i / CHUNK + 1, envios: slice.length } as any);
  }
}
