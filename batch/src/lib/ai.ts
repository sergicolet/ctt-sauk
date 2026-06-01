/**
 * Análisis IA (OpenAI gpt-4o-mini). System prompt y user prompt idénticos a
 * "AI: Analizar Historiales" (main.json) y callOpenAI (route.ts).
 * Si no hay OPENAI_API_KEY, devuelve null y el override matemático decide.
 */

import type { Bulto, SlaResult } from "./sla.js";
import { log } from "./logger.js";

const SYSTEM_PROMPT = `Eres un auditor logístico de CTT Express. Analiza el historial y decide la acción correcta. RESPONDE SOLO CON JSON PURO, SIN MARKDOWN.

### FUENTE DE VERDAD
Lee el historial cronológicamente. Los valores precalculados ya están calculados en JS — ÚSALOS DIRECTAMENTE, NO los recalcules.

### VERIFICACIÓN EN ORDEN ESTRICTO

PASO 0 — ESTADOS TERMINALES (prioridad máxima):
¿El último evento de algún bulto es 2500, 2300 o 2310?
- 2500 → notification_type: "devolucion". FIN.
- 2300 → notification_type: "punto_ctt". FIN.
- 2310 → notification_type: "punto_ctt". FIN.
- 2100 → notification_type: "none", should_notify: false (entregado). FIN.
- 2000 → notification_type: "none", should_notify: false (entregado). FIN.

PASO 1 — INCIDENCIAS GRAVES (sin umbral de tiempo):
¿Existe en el historial algún evento 1006, 1008 o 1012?
- 1006 (daño) / 1008 (robo) / 1012 (extravío) → notification_type: "siniestro". FIN.

PASO 2 — INCIDENCIA ACTIVA (usa el campo precalculado, NO analices el historial):
¿has_active_incident es true?
- active_incident_code = 0600 → notification_type: "recogida_fallida". FIN.
- active_incident_code = 1600/2400/2600/2700 → notification_type: "segundo_intento". FIN.

PASO 3 — UMBRALES DE TIEMPO (Obligatorio, prevalece sobre el "sentido común"):
SI SE CUMPLE ALGUNA DE ESTAS CONDICIONES MATEMÁTICAS, APLICA INMEDIATAMENTE (Sin importar si el último estado suena normal, como un [1200] Delegación destino. Si supera el tiempo, ES una incidencia por retraso):
- manifest_hours > 24 y el último evento es 0000 → notification_type: "pendiente".
- manifest_hours > 24 y el último evento es 0030 → notification_type: "recogida_0030".
- transit_hours > 24 y NO existe ningún [1200] o [1500] en el historial → notification_type: "agilizar_transito".
- delivery_hours > 24 → notification_type: "agilizar_reparto". (Nota: Aplica aunque el envío solo esté en la delegación de destino [1200])
- stationary_hours > 24 → notification_type: "agilizar_reparto".
- Si absolutamente Ninguno supera su umbral → notification_type: "none".

### REGLAS ANTI-ALUCINACIÓN
- PROHIBIDO saltarse el Paso 3. Que un envío haya "llegado a la delegación" [1200] NO significa que esté bien si delivery_hours > 24.
- NUNCA afirmes un evento si su código no aparece textualmente en el historial.
- 71_INAT NO es una incidencia. Es gestión interna de CTT.
- Si should_notify es false → notification_type DEBE ser "none".
- Si should_notify es true → notification_type NUNCA puede ser "none".

### SALIDA JSON (ÚNICO FORMATO VÁLIDO)
{
  "analysis": {
    "ultimo_estado": "código del último evento del bulto más relevante",
    "item_afectado": "item_code del bulto con la incidencia, o null",
    "justificacion": "explicación del paso seguido y por qué. Especifica siempre qué condición de tiempo se cumplió si aplica."
  },
  "decision": {
    "is_incident": boolean,
    "should_notify": boolean,
    "notification_type": "none|pendiente|devolucion|siniestro|segundo_intento|recogida_fallida|agilizar_transito|agilizar_reparto|punto_ctt|recogida_0030"
  }
}`;

export interface AiResult {
  analysis?: { ultimo_estado?: string; item_afectado?: string | null; justificacion?: string };
  decision?: { is_incident?: boolean; should_notify?: boolean; notification_type?: string };
}

function fmtNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function analyze(
  bultos: Bulto[],
  sla: SlaResult,
  ctx: { shipping_code: string; client_references: string[]; client_name: string },
): Promise<AiResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log.warn("OPENAI_API_KEY no configurada — se salta IA, decide override SLA", { shipping_code: ctx.shipping_code });
    return null;
  }

  const historyText = bultos.map((b) => `Item: ${b.item_code}\n${b.history}`).join("\n\n---\n\n");
  const userContent = `Envío: ${ctx.shipping_code}
Referencia cliente: ${ctx.client_references[0] || "sin-ref"}
Cliente: ${ctx.client_name}
Fecha/hora actual: ${fmtNow()}

--- VALORES PRECALCULADOS (USA ESTOS DIRECTAMENTE, NO RECALCULES) ---
Horas en grabación/pendiente (0000/0030): ${sla.manifest_hours}
Horas en tránsito (0900/1000): ${sla.transit_hours}
Horas en reparto (1200/1500): ${sla.delivery_hours}
Horas estacionado (1700/1800): ${sla.stationary_hours}
Incidencia activa (1600/2400/2600/2700/0600 sin resolución posterior): ${sla.has_active_incident}
Código de incidencia activa: ${sla.active_incident_code || "ninguna"}

--- HISTORIALES DE BULTOS ---
${historyText}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      log.error(`OpenAI HTTP ${res.status}`, { shipping_code: ctx.shipping_code });
      return null;
    }
    const data = (await res.json()) as any;
    const text = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(text) as AiResult;
  } catch (e) {
    log.error("Excepción OpenAI", { shipping_code: ctx.shipping_code, razon: String(e) });
    return null;
  }
}
