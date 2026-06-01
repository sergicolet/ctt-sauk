/**
 * Seguimiento de incidencias (12:00 Madrid).
 * Revisa las incidencias notificadas AYER (o viernes si hoy es lunes):
 *   - Si el envío ha cambiado / se ha resuelto (entregado, devolución, punto CTT,
 *     o ya sin incidencia activa) → se descarta (resultado_followup = "resuelto").
 *   - Si sigue igual sin resolverse → email INTERNO avisando, y
 *     resultado_followup = "reenviado_interno".
 *
 * Reutiliza el mismo motor que el batch (readShipment, Gmail, Firestore).
 * Porta la lógica de workflows/incidencias.json.
 */
import { loadEnv } from "./lib/env.js";
loadEnv();

import { CLIENTS } from "./config/clients.js";
import { initFirestore, getDb } from "./lib/firestore.js";
import { readShipment } from "./single.js";
import { sendNotification } from "./lib/gmail.js";
import type { Decision } from "./lib/decision.js";
import { log } from "./lib/logger.js";

const TERMINAL_OK = new Set(["2000", "2100", "2300", "2310", "2500", "3000"]);

/** yyyy-MM-dd objetivo en Madrid: ayer, o viernes si hoy es lunes. */
function targetDateMadrid(): string {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  const now = new Date();
  const wd = fmt.formatToParts(now).find((p) => p.type === "weekday")?.value ?? "Mon";
  const backDays = wd === "Mon" ? 3 : 1;
  const target = new Date(now.getTime() - backDays * 86400000);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(target);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Normaliza fecha_procesado a yyyy-MM-dd (soporta dd-mm-yyyy legacy). */
function normalizeFecha(v: any): string {
  if (!v) return "";
  const s = String(v);
  if (s.length >= 10 && s[2] === "-" && s[5] === "-") return s.substring(0, 10).split("-").reverse().join("-");
  return s.substring(0, 10);
}

async function main() {
  const t0 = Date.now();
  const dryRun = process.env.DRY_RUN !== "false";
  const suffix = process.env.BATCH_COLLECTION_SUFFIX ?? "_batch_test";
  const colInc = `incidencias${suffix}`;
  initFirestore();
  const db = getDb();

  const target = targetDateMadrid();
  log.info("Seguimiento incidencias iniciado", { fase_salida: "fw_start", target, dry_run: dryRun } as any);

  // Incidencias candidatas: notificadas, sin seguimiento previo, de la fecha objetivo.
  const snap = await db.collection(colInc).get();
  const candidatos: { id: string; data: any }[] = [];
  snap.forEach((d) => {
    const x = d.data();
    if (x.email_enviado === false) return;
    if (x.resultado_followup && String(x.resultado_followup).trim() !== "") return;
    if (normalizeFecha(x.fecha_procesado) !== target) return;
    candidatos.push({ id: d.id, data: x });
  });
  log.info("Candidatos de seguimiento", { total: candidatos.length, target } as any);

  let resueltos = 0, reenviados = 0, errores = 0;

  for (const c of candidatos) {
    const code = c.id;
    try {
      const r = await readShipment(code);
      const estado = r.decision.estado_actual;
      const client = CLIENTS[r.client_code];

      // ¿Resuelto? terminal/cierre, o ya sin incidencia notificable.
      const resuelto = r.all_terminal || TERMINAL_OK.has(estado) || !r.decision.should_notify;

      if (resuelto) {
        resueltos++;
        if (!dryRun) await db.collection(colInc).doc(code).set({ resultado_followup: "resuelto", fecha_followup: new Date().toISOString(), estado_followup: estado }, { merge: true });
        log.info("Seguimiento: resuelto", { shipping_code: code, client: client?.name, estado } as any);
        continue;
      }

      // Sigue sin resolverse → email INTERNO.
      reenviados++;
      const ped = String(c.data.numero_pedido || r.meta?.client_reference || "");
      const internalDecision: Decision = {
        is_incident: true, should_notify: true, notification_type: "seguimiento",
        target_type: "internal",
        asunto: `[SEGUIMIENTO] Sigue sin resolverse: ${ped || code}`,
        cuerpo: `Hola equipo, la incidencia del envío ${code}${ped ? " (pedido " + ped + ")" : ""} notificada el ${target} SIGUE sin resolverse (estado actual ${estado}). Por favor, gestionad manualmente con CTT.`,
        destinatario: client?.internalEmail || "",
        numero_avisos: Number(c.data.numero_avisos || 0) + 1,
        ai_justification: r.decision.ai_justification,
        affected_bulto: r.decision.affected_bulto,
        estado_actual: estado,
        force_internal: true,
      };
      const outcome = await sendNotification(client, internalDecision, code);
      if (!dryRun) await db.collection(colInc).doc(code).set({ resultado_followup: "reenviado_interno", fecha_followup: new Date().toISOString(), estado_followup: estado, numero_avisos: internalDecision.numero_avisos }, { merge: true });
      log.info("Seguimiento: reenviado interno", { shipping_code: code, client: client?.name, estado, email: outcome } as any);
    } catch (e) {
      errores++;
      log.error("Seguimiento: error", { shipping_code: code, razon: String(e) });
    }
  }

  log.info("Seguimiento incidencias finalizado", { fase_salida: "fw_done", target, candidatos: candidatos.length, resueltos, reenviados, errores, ms: Date.now() - t0 } as any);
}

main().then(() => process.exit(0)).catch((e) => { log.error("Seguimiento abortado", { razon: String(e) }); process.exit(1); });
