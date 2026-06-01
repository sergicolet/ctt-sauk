/**
 * Lectura y refresco de UN envío (on-demand desde el dashboard).
 *   readShipment  → READ-ONLY: todos los bultos reales + SLA + IA + decisión.
 *   refreshShipment → readShipment + escribe en Firestore + (opcional) email.
 * Reutiliza el mismo motor que el batch programado.
 */

import { CLIENTS, clientFromCenter, type ClientConfig } from "./config/clients.js";
import { TERMINAL_CODES } from "./config/constants.js";
import { getAccessToken, fetchShippingHistory, fetchItemHistory } from "./lib/ctt.js";
import { extractSingleBulto, calculateSLA, type Bulto, type SlaResult } from "./lib/sla.js";
import { analyze, type AiResult } from "./lib/ai.js";
import { decide, type Decision } from "./lib/decision.js";
import { prepareContext, persistAll } from "./lib/firestore.js";
import { sendNotification, type EmailOutcome } from "./lib/gmail.js";
import { log } from "./lib/logger.js";

export interface ShipmentRead {
  shipping_code: string;
  client_code: string;
  client_name: string;
  meta: Record<string, unknown>;
  bultos: Bulto[];
  sla: SlaResult;
  ai: AiResult | null;
  decision: Decision;
  numero_avisos_previos: number;
  all_terminal: boolean;
}

/** Lee un envío completo. Si no se pasa client_code, se deduce del centro. */
export async function readShipment(shipping_code: string, client_code?: string): Promise<ShipmentRead> {
  let client: ClientConfig | null = client_code ? CLIENTS[client_code] ?? null : null;

  // Cabecera (showItems=true): trae item_count + metadata. Usa un token cualquiera si aún no sabemos el cliente.
  let token = await getAccessToken(client ?? CLIENTS["47352"]);
  const head = await fetchShippingHistory(token, shipping_code);
  if (head?.error) throw new Error("CTT: " + head.error.message);
  const meta = head.data || {};

  if (!client) {
    client = clientFromCenter(String(meta.client_center_code || "")) || CLIENTS["47352"];
    token = await getAccessToken(client);
  }

  const itemCount = Number(meta.item_count || 1) || 1;
  const codes = Array.from({ length: itemCount }, (_, i) => shipping_code + String(i + 1).padStart(3, "0"));

  const bultos: Bulto[] = [];
  for (const c of codes) bultos.push(extractSingleBulto(await fetchItemHistory(token, c), c));
  bultos.sort((a, b) => (a.item_code < b.item_code ? -1 : 1));

  const refs = meta.client_reference ? [String(meta.client_reference)] : ["sin-ref"];
  const estado_actual = String(bultos[0]?.shipping_status_code ?? "").replace(/"/g, "").trim();
  const ctx = await prepareContext(shipping_code, estado_actual, refs);
  const sla = calculateSLA(bultos);
  const ai = await analyze(bultos, sla, { shipping_code, client_references: ctx.client_references, client_name: client.name });
  const decision = decide({
    bultos, sla, ai, client,
    client_references: ctx.client_references,
    shipping_code,
    numero_avisos_previos: ctx.numero_avisos,
    force_internal_ctx: ctx.force_internal,
  });

  const all_terminal = bultos.length > 0 && bultos.every((b) => TERMINAL_CODES.has(String(b.shipping_status_code).replace(/"/g, "").trim()));

  return {
    shipping_code, client_code: client.code, client_name: client.name,
    meta, bultos, sla, ai, decision, numero_avisos_previos: ctx.numero_avisos, all_terminal,
  };
}

export interface RefreshResult extends ShipmentRead {
  email_outcome: EmailOutcome | "not_notified";
  persisted: boolean;
}

/**
 * Manual refresh: lee + escribe en Firestore + (si procede y SEND_EMAILS) envía/crea draft.
 * Respeta DRY_RUN / SEND_EMAILS / BATCH_COLLECTION_SUFFIX como el batch.
 */
export async function refreshShipment(shipping_code: string, client_code?: string): Promise<RefreshResult> {
  const r = await readShipment(shipping_code, client_code);
  const client = CLIENTS[r.client_code];
  const d = r.decision;

  // Email (si notifica).
  let email_outcome: EmailOutcome | "not_notified" = "not_notified";
  if (d.should_notify && d.target_type !== "none") {
    email_outcome = await sendNotification(client, d, shipping_code);
  }

  // Documentos (espejo de processShipment, versión single).
  const slaFields = {
    h_en_estado: r.sla.h_en_estado, transit_hours: r.sla.transit_hours, delivery_hours: r.sla.delivery_hours,
    manifest_hours: r.sla.manifest_hours, stationary_hours: r.sla.stationary_hours,
  };
  const now = new Date();
  const _p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(now);
  const _g = (t: string) => _p.find((x) => x.type === t)?.value ?? "00";
  const fmt = `${_g("year")}-${_g("month")}-${_g("day")} ${_g("hour") === "24" ? "00" : _g("hour")}:${_g("minute")}:${_g("second")}`;
  const bultos_historial_json = JSON.stringify(r.bultos);
  const historial_formateado = r.bultos.map((b) => `Item: ${b.item_code}\n${b.history}`).join("\n\n---\n\n");

  const ejecucion: Record<string, unknown> = {
    ...slaFields, fecha_procesado: fmt + " (Manual)", numero_envio: shipping_code,
    numero_pedido: r.decision ? (r.meta.client_reference || "") : "", tienda: r.client_name,
    centro: String(r.meta.client_center_code || ""), estado: d.estado_actual,
    credencial: r.client_name, email_enviado: d.should_notify, tipo_email: d.target_type,
    razon: d.ai_justification, destinatario: d.destinatario, forzado_interno: d.target_type === "internal",
    dano: d.notification_type === "siniestro" || d.estado_actual === "1006",
    asunto: d.asunto, cuerpo: d.cuerpo, historial_formateado, bultos_historial_json,
  };
  const incidencia: Record<string, unknown> | null = d.is_incident
    ? { ...ejecucion, incidencia: d.asunto, numero_avisos: d.numero_avisos, bulto_afectado: d.affected_bulto || "", shipping_code }
    : null;
  const trazabilidad = {
    shipping_code, client_code: r.client_code, tienda: r.client_name, fecha: now.toISOString(),
    ejecucion_id: "manual_" + now.toISOString(), fase_salida: d.should_notify ? "notified" : "ai_no_notify",
    razon: d.ai_justification, estado_final: d.estado_actual, numero_avisos: d.numero_avisos, ai_justification: d.ai_justification,
  };

  await persistAll([{ docid: shipping_code, ejecucion, incidencia, trazabilidad }]);
  const persisted = process.env.DRY_RUN === "false";

  log.info("Manual refresh", { shipping_code, client: r.client_name, notify: d.should_notify, email_outcome, persisted } as any);
  return { ...r, email_outcome, persisted };
}
