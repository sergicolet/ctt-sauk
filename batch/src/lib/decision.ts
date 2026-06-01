/**
 * Decisión final: override matemático SLA sobre la IA + plantillas + routing.
 * Porta "Code: Parsear y Override IA" y "Code: Procesar Respuesta IA" (main.json)
 * y la sección H/I de route.ts.
 *
 * ROUTING (confirmado, idéntico a hoy):
 *  - tipos "a CTT" en 1er aviso  → target_type=standard → DRAFT a cca_zone
 *  - reincidencia (avisos>0)      → escala a internal → SEND con [RE-INCIDENCIA]
 *  - pendiente/devolucion/siniestro → internal directo en 1er aviso (excepción)
 */

import type { ClientConfig } from "../config/clients.js";
import type { AiResult } from "./ai.js";
import type { Bulto, SlaResult } from "./sla.js";

export type TargetType = "none" | "standard" | "internal";

const TEMPLATES: Record<string, { subject: (p: string, s: string) => string; body: (p: string, s: string) => string }> = {
  pendiente: {
    subject: () => "ALERTA PENDIENTE (0000)",
    body: (p, s) => `Hola, se ha detectado que el siguiente envío lleva más de 24 horas en estado 0000. Por favor, revisadlo.\nPEDIDO: - ${p || s}`,
  },
  devolucion: {
    subject: (p, s) => `Devolución en proceso: ${p || s}`,
    body: (_p, s) => `Hola, el siguiente pedido ha entrado en proceso de devolución. Iniciamos seguimiento manual.\nCÓDIGO: - ${s}`,
  },
  siniestro: {
    subject: (p, s) => `Apertura de siniestro: ${p || s}`,
    body: (_p, s) => `Buenos días CTT, solicitamos la apertura oficial de expediente de siniestro por pérdida/daño para el envío:\nREFERENCIA: - ${s}. Quedamos a la espera del número de expediente.`,
  },
  segundo_intento: {
    subject: (p, s) => `Incidencia en el envío ${p || s}`,
    body: (_p, s) => `Buenos días. Tras la incidencia en el primer intento, solicitamos automáticamente un segundo intento de reparto para el siguiente día hábil.\nEXPEDICIÓN: - ${s}. Gracias.`,
  },
  recogida_fallida: {
    subject: (p, s) => `Incidencia en el envío ${p || s}`,
    body: (_p, s) => `Buenos días. Solicitamos que se reintente la recogida fallida del siguiente envío:\nEXPEDICIÓN: - ${s}. Gracias.`,
  },
  agilizar_transito: {
    subject: (p, s) => `Incidencia en el envío ${p || s}`,
    body: (_p, s) => `Buenos días. El envío ${s} lleva más de 24 horas en tránsito sin pasar a reparto. Solicitamos que salga a reparto el próximo día hábil. Gracias.`,
  },
  agilizar_reparto: {
    subject: (p, s) => `Incidencia en el envío ${p || s}`,
    body: (_p, s) => `Buenos días. El envío ${s} lleva más de 24 horas en reparto sin entregarse. Solicitamos que sea sacado nuevamente a reparto hoy mismo. Gracias.`,
  },
  punto_ctt: {
    subject: (p, s) => `Envío en punto CTT: ${p || s}`,
    body: (_p, s) => `Buenos días. Necesitamos la dirección detallada del punto de recogida para el siguiente envío:\nEXPEDICIÓN: - ${s}. Gracias de antemano.`,
  },
  recogida_0030: {
    subject: (p, s) => `Incidencia en el envío ${p || s}`,
    body: (_p, s) => `Buenos días. Solicitamos agilizar la recogida del siguiente envío que lleva más de 24 horas pendiente:\nLISTADO DE ENVÍOS: - ${s}. Gracias.`,
  },
};

const TYPES_INTERNAL_FIRST = new Set(["pendiente", "devolucion", "siniestro"]);

export interface Decision {
  is_incident: boolean;
  should_notify: boolean;
  notification_type: string;
  target_type: TargetType;
  asunto: string;
  cuerpo: string;
  destinatario: string;
  numero_avisos: number;
  ai_justification: string;
  affected_bulto: string | null;
  estado_actual: string;
  force_internal: boolean;
}

export interface DecisionInput {
  bultos: Bulto[];
  sla: SlaResult;
  ai: AiResult | null;
  client: ClientConfig;
  client_references: string[];
  shipping_code: string;
  /** avisos previos en Firestore. */
  numero_avisos_previos: number;
  /** force_internal calculado en preparar contexto (procesado ayer o 2500). */
  force_internal_ctx: boolean;
}

export function decide(input: DecisionInput): Decision {
  const { bultos, sla, ai, client, client_references, shipping_code } = input;

  let is_incident = ai?.decision?.is_incident === true;
  let should_notify = ai?.decision?.should_notify === true;
  let notification_type = ai?.decision?.notification_type || "none";
  const ai_justification = ai?.analysis?.justificacion || "Análisis IA completado";
  const affected_bulto = ai?.analysis?.item_afectado || null;

  const estado_actual = String(bultos[0]?.shipping_status_code ?? "").replace(/["']/g, "").trim();

  const isManifest = estado_actual === "0000" || estado_actual === "0030";
  const isTransit = estado_actual === "0900" || estado_actual === "1000";
  const isDelivery = ["1200", "1500", "1600", "2400", "2600", "2700"].includes(estado_actual);
  const isStationary = estado_actual === "1700" || estado_actual === "1800";
  const is2500 = estado_actual === "2500";
  const is71INAT = estado_actual === "71_INAT";

  const stateIsStillProblematic = isDelivery || isStationary || is2500 || is71INAT || sla.has_active_incident;

  // --- Override matemático: la IA decide, pero un umbral roto fuerza incidencia. ---
  const breached =
    (input.force_internal_ctx && stateIsStillProblematic) ||
    sla.has_active_incident ||
    (isManifest && sla.manifest_hours > 24) ||
    (isTransit && sla.transit_hours > 24) ||
    (isDelivery && sla.delivery_hours > 24) ||
    (isStationary && sla.stationary_hours > 24) ||
    is71INAT;

  if (breached) {
    is_incident = true;
    should_notify = true;
    if (notification_type === "none") {
      if (sla.has_active_incident) {
        notification_type = sla.active_incident_code === "0600" ? "recogida_fallida" : "segundo_intento";
      } else if (isManifest) {
        notification_type = estado_actual === "0030" ? "recogida_0030" : "pendiente";
      } else if (isTransit) notification_type = "agilizar_transito";
      else if (is2500) notification_type = "devolucion";
      else if (is71INAT || isDelivery || isStationary) notification_type = "agilizar_reparto";
    }
  }

  // --- Routing + plantilla ---
  let target_type: TargetType = "none";
  let asunto = "";
  let cuerpo = "";
  let destinatario = "";
  let numero_avisos = input.numero_avisos_previos;

  const ped = client_references[0] || "";
  const seg = shipping_code;

  if (should_notify && notification_type !== "none") {
    const tpl = TEMPLATES[notification_type];
    if (tpl) {
      // Excepción: pendiente/devolucion/siniestro → internal en 1er aviso.
      target_type = TYPES_INTERNAL_FIRST.has(notification_type) ? "internal" : "standard";
      asunto = tpl.subject(ped, seg);
      cuerpo = tpl.body(ped, seg);
    } else {
      target_type = "internal";
      asunto = `Gestión Urgente: ${seg}`;
      cuerpo = `Hola, se requiere revisión manual para el envío ${seg}.\nJustificación: ${ai_justification}`;
    }

    numero_avisos += 1;

    // Reincidencia: si ya hubo avisos y era standard (draft a CTT) → escala a interno.
    if (numero_avisos > 1 && target_type === "standard") {
      target_type = "internal";
      asunto = `[RE-INCIDENCIA] ${asunto}`;
      cuerpo = `Hola equipo, este envío ya fue notificado previamente y sigue en incidencia. Por favor, gestionad manualmente.\n\n${cuerpo}`;
    }

    destinatario = target_type === "internal" ? client.internalEmail : client.ccaZone;
  }

  // Fallback defensivo (como en main.json/route.ts).
  if (should_notify && !asunto) {
    target_type = "internal";
    asunto = `Gestión Urgente: ${seg}`;
    cuerpo = `Hola, se requiere revisión manual para el envío ${seg}.\nJustificación: ${ai_justification}`;
    destinatario = client.internalEmail;
  }

  return {
    is_incident,
    should_notify,
    notification_type,
    target_type,
    asunto,
    cuerpo,
    destinatario,
    numero_avisos,
    ai_justification,
    affected_bulto,
    estado_actual,
    force_internal: target_type === "internal",
  };
}

export { TEMPLATES };
