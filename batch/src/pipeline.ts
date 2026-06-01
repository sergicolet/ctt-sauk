/**
 * processShipment: camino completo de UN envío (espejo del interior del
 * "Loop: Un envío a la vez" de main.json).
 *
 * En dry-run NO escribe en Firestore ni envía email: solo decide y devuelve
 * el resultado para que index.ts lo resuma / lo persista en fases posteriores.
 */

import pLimit from "p-limit";
import type { ClientConfig } from "./config/clients.js";
import { TERMINAL_CODES, BULTO_CONCURRENCY } from "./config/constants.js";
import { fetchItemHistory, type Shipment } from "./lib/ctt.js";
import { extractSingleBulto, calculateSLA, type Bulto } from "./lib/sla.js";
import { analyze } from "./lib/ai.js";
import { decide, type Decision } from "./lib/decision.js";
import { prepareContext } from "./lib/firestore.js";
import { sendNotification, type EmailOutcome } from "./lib/gmail.js";
import { log } from "./lib/logger.js";

export type FaseSalida =
  | "skipped_processed_today"
  | "skipped_all_terminal_bultos"
  | "error"
  | "ai_no_notify"
  | "notified";

/** Documentos a persistir (Fase 3). docid = shipping_code, igual que main.json. */
export interface ShipmentRecords {
  docid: string;
  /** Doc para colección `ejecuciones` (siempre se escribe). */
  ejecucion: Record<string, unknown>;
  /** Doc para `incidencias` si is_incident; null → borrar el doc. */
  incidencia: Record<string, unknown> | null;
  /** Doc para `trazabilidad_ejecuciones`. */
  trazabilidad: Record<string, unknown>;
}

export interface ShipmentResult {
  shipping_code: string;
  client: string;
  fase_salida: FaseSalida;
  notification_type?: string;
  target_type?: string;
  destinatario?: string;
  email_outcome?: EmailOutcome;
  razon?: string;
  decision?: Decision;
  records: ShipmentRecords;
}

/** Fecha-hora actual en zona Europe/Madrid, formato "yyyy-MM-dd HH:mm:ss". */
function fmtNow(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hh = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")} ${hh}:${g("minute")}:${g("second")}`;
}

export async function processShipment(
  shipment: Shipment,
  client: ClientConfig,
  token: string,
  runId: string,
): Promise<ShipmentResult> {
  const shipping_code = String(shipment.shipping_code);
  const fallbackRefs =
    shipment.client_references || ((shipment as any).numero_pedido ? [String((shipment as any).numero_pedido)] : ["sin-ref"]);
  const centro = String(shipment.client_center_code ?? "");
  const fecha_estado = String(shipment.shipping_status_datetime ?? "");

  // Helper para trazabilidad (espejo de los nodos "Set: Trace ...").
  const traza = (fase: FaseSalida, razon: string, estadoFinal: string, avisos: number, ai_just: string) => ({
    shipping_code,
    client_code: client.code,
    tienda: client.name,
    fecha: new Date().toISOString(),
    ejecucion_id: runId,
    fase_salida: fase,
    razon,
    estado_final: estadoFinal,
    numero_avisos: avisos,
    ai_justification: ai_just,
  });

  // 1. Expandir bultos desde items[] del listado y pedir el historial de cada uno
  //    en paralelo (espejo de "Code: Expandir Bultos" + "HTTP: Historial Bulto").
  const itemCodes: string[] =
    Array.isArray(shipment.items) && shipment.items.length > 0
      ? shipment.items.map((it) => it.item_code)
      : [shipping_code + "001"];

  const bultoLimit = pLimit(BULTO_CONCURRENCY);
  const bultos: Bulto[] = await Promise.all(
    itemCodes.map((code) => bultoLimit(async () => extractSingleBulto(await fetchItemHistory(token, code), code))),
  );
  bultos.sort((a, b) => (a.item_code < b.item_code ? -1 : 1));

  const estado_actual = String(bultos[0]?.shipping_status_code ?? "").replace(/"/g, "").trim();
  const historial_formateado = bultos.map((b) => `Item: ${b.item_code}\n${b.history}`).join("\n\n---\n\n");
  const bultos_historial_json = JSON.stringify(bultos);

  // Base del doc ejecuciones (campos comunes; espejo de "Set: Preparar Log").
  function baseEjecucion(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      fecha_procesado: fmtNow(),
      numero_envio: shipping_code,
      numero_pedido: fallbackRefs[0] || "",
      tienda: client.name,
      centro,
      estado: estado_actual,
      fecha_estado,
      credencial: client.name,
      bultos_historial_json,
      historial_formateado,
      ...extra,
    };
  }

  // Si TODOS los bultos fallaron al traer historial → error.
  if (bultos.every((b) => b.shipping_status_code === "FETCH_ERROR")) {
    const razon = "Error historial: todos los bultos fallaron";
    return {
      shipping_code,
      client: client.name,
      fase_salida: "error",
      razon,
      records: { docid: shipping_code, ejecucion: baseEjecucion(), incidencia: null, trazabilidad: traza("error", razon, "", 0, "") },
    };
  }

  // 2. Contexto previo (skip / force_internal / numero_avisos).
  const ctx = await prepareContext(shipping_code, estado_actual, fallbackRefs);
  if (ctx.skip) {
    const razon = "Ya procesado hoy sin cambios";
    return {
      shipping_code,
      client: client.name,
      fase_salida: "skipped_processed_today",
      razon,
      records: {
        docid: shipping_code,
        ejecucion: baseEjecucion({ razon, email_enviado: false, tipo_email: "none" }),
        incidencia: null,
        trazabilidad: traza("skipped_processed_today", razon, estado_actual, ctx.numero_avisos, ""),
      },
    };
  }

  // 3. ¿Todos los bultos terminales? → saltar.
  const allTerminal =
    bultos.length > 0 &&
    bultos.every((b) => TERMINAL_CODES.has(String(b.shipping_status_code).replace(/"/g, "").trim()));
  if (allTerminal) {
    const razon = "Todos los bultos en estado terminal";
    return {
      shipping_code,
      client: client.name,
      fase_salida: "skipped_all_terminal_bultos",
      razon,
      records: {
        docid: shipping_code,
        ejecucion: baseEjecucion({ razon, email_enviado: false, tipo_email: "none" }),
        incidencia: null,
        trazabilidad: traza("skipped_all_terminal_bultos", razon, estado_actual, ctx.numero_avisos, ""),
      },
    };
  }

  // 4. SLA + IA + decisión.
  const sla = calculateSLA(bultos);
  const ai = await analyze(bultos, sla, {
    shipping_code,
    client_references: ctx.client_references,
    client_name: client.name,
  });
  const decision = decide({
    bultos,
    sla,
    ai,
    client,
    client_references: ctx.client_references,
    shipping_code,
    numero_avisos_previos: ctx.numero_avisos,
    force_internal_ctx: ctx.force_internal,
  });

  const slaFields = {
    h_en_estado: sla.h_en_estado,
    transit_hours: sla.transit_hours,
    delivery_hours: sla.delivery_hours,
    manifest_hours: sla.manifest_hours,
    stationary_hours: sla.stationary_hours,
  };

  const ejecucion = baseEjecucion({
    ...slaFields,
    email_enviado: decision.should_notify,
    tipo_email: decision.target_type,
    razon: decision.ai_justification,
    destinatario: decision.destinatario,
    forzado_interno: decision.force_internal,
    dano: decision.notification_type === "siniestro" || estado_actual === "1006",
    asunto: decision.asunto,
    cuerpo: decision.cuerpo,
  });

  if (!decision.should_notify || decision.target_type === "none") {
    return {
      shipping_code,
      client: client.name,
      fase_salida: "ai_no_notify",
      razon: decision.ai_justification,
      decision,
      records: {
        docid: shipping_code,
        ejecucion,
        incidencia: null, // no es incidencia → se borra de la colección
        trazabilidad: traza("ai_no_notify", decision.ai_justification, estado_actual, decision.numero_avisos, decision.ai_justification),
      },
    };
  }

  // Es incidencia notificable.
  const incidencia = {
    ...slaFields,
    fecha_procesado: fmtNow(),
    numero_envio: shipping_code,
    numero_pedido: fallbackRefs[0] || "",
    tienda: client.name,
    centro,
    incidencia: decision.asunto,
    email_enviado: decision.should_notify,
    tipo_email: decision.target_type,
    razon: decision.ai_justification,
    destinatario: decision.destinatario,
    asunto: decision.asunto,
    cuerpo: decision.cuerpo,
    numero_avisos: decision.numero_avisos,
    bulto_afectado: decision.affected_bulto || "",
    bultos_historial_json,
    forzado_interno: decision.force_internal,
    shipping_code,
  };

  log.info("Envío con incidencia", {
    shipping_code,
    client: client.name,
    notification_type: decision.notification_type,
    target_type: decision.target_type,
    destinatario: decision.destinatario,
  } as any);

  // Fase 4: crear draft (standard) o enviar (internal). Seguro por SEND_EMAILS.
  const email_outcome = await sendNotification(client, decision, shipping_code);

  return {
    shipping_code,
    client: client.name,
    fase_salida: "notified",
    notification_type: decision.notification_type,
    target_type: decision.target_type,
    destinatario: decision.destinatario,
    email_outcome,
    razon: decision.ai_justification,
    decision,
    records: {
      docid: shipping_code,
      ejecucion,
      incidencia,
      trazabilidad: traza("notified", "Notificación preparada", estado_actual, decision.numero_avisos, decision.ai_justification),
    },
  };
}
