/**
 * Núcleo CTT compartido (server-only) para el dashboard.
 * Mismo motor que el Cloud Run Job (batch/): token, expansión de bultos,
 * historial por bulto, SLA, IA y decisión. Devuelve "la realidad": todos los
 * bultos con su estado real, métricas y la decisión.
 *
 * Lectura READ-ONLY: no escribe en Firestore ni envía emails.
 */

// ----------------------------- Config clientes -----------------------------
export interface ClientConfig {
  code: string;
  name: string;
  clientId: string;
  clientSecret: string;
  centers: string[];
  internalEmail: string;
  ccaZone: string;
}

const env = (k: string, f: string) => process.env[k] ?? f;

export const CLIENTS: Record<string, ClientConfig> = {
  "48630": { code: "48630", name: "HAMINOS", clientId: env("CTT_HAMINOS_CLIENT_ID", ""), clientSecret: env("CTT_HAMINOS_CLIENT_SECRET", ""), centers: ["4863000001"], internalEmail: "incidenciashaminos@gmail.com", ccaZone: "cca.z3@cttexpress.com" },
  "47352": { code: "47352", name: "SNAPPY", clientId: env("CTT_SNAPPY_CLIENT_ID", ""), clientSecret: env("CTT_SNAPPY_CLIENT_SECRET", ""), centers: ["4735200001", "4735200002", "4735200003", "4735200004", "4735200005"], internalEmail: "incidenciassnappyblue@gmail.com", ccaZone: "cca.z3@cttexpress.com" },
  "47685": { code: "47685", name: "MIESTERY", clientId: env("CTT_MIESTERY_CLIENT_ID", ""), clientSecret: env("CTT_MIESTERY_CLIENT_SECRET", ""), centers: ["4768500003"], internalEmail: "incidenciasamzdiscounts01@gmail.com", ccaZone: "cca.z3@cttexpress.com" },
  "45416": { code: "45416", name: "KULTUDENDA", clientId: env("CTT_KULTUDENDA_CLIENT_ID", ""), clientSecret: env("CTT_KULTUDENDA_CLIENT_SECRET", ""), centers: ["4541600001", "4541600002"], internalEmail: "incidenciaskulturdenda@gmail.com", ccaZone: "cca.z2@cttexpress.com" },
};

export const TERMINAL_CODES = new Set(["2000", "2100", "2300", "2310", "3000"]);
const INCIDENT_CODES = new Set(["1600", "2400", "2600", "2700", "0600"]);
const RESOLUTION_CODES = new Set(["1500", "2000", "2100"]);

// ----------------------------- API CTT -----------------------------
const TOKEN_URL = "https://api.cttexpress.com/integrations/oauth2/token";
const HISTORY_URL = "https://api.cttexpress.com/integrations-info/trf/item-history-api/history";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getToken(c: ClientConfig): Promise<string> {
  const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "client_credentials", scope: "urn:com:ctt-express:integration-clients:scopes:common/ALL" });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`token CTT HTTP ${res.status}`);
  const d = await res.json();
  return d.access_token;
}

async function fetchHistory(token: string, code: string, showItems: boolean): Promise<any> {
  const url = `${HISTORY_URL}/${code}?view=APITRACK&showItems=${showItems}`;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 502 || res.status === 504) { await sleep(2000); continue; }
      if (!res.ok) return { error: { message: `HTTP ${res.status}` } };
      return await res.json();
    } catch (e) { await sleep(2000); }
  }
  return { error: { message: "reintentos agotados" } };
}

// ----------------------------- Bultos + SLA -----------------------------
export interface Bulto { item_code: string; history: string; shipping_status_code: string; events: { date: string; code: string; desc: string }[]; }

const MAX_EVENTS = 50;

function buildBulto(histResp: any, fallbackCode: string): Bulto {
  if (histResp?.error || !histResp?.data?.shipping_history) {
    return { item_code: fallbackCode, history: "ERROR: " + (histResp?.error?.message || "sin datos"), shipping_status_code: "FETCH_ERROR", events: [] };
  }
  const h = histResp.data.shipping_history;
  const item_code = h.item_code || fallbackCode;
  const raw: any[] = h.events || [];
  const ev = raw.length <= MAX_EVENTS ? raw : [raw[0], ...raw.slice(-(MAX_EVENTS - 1))];
  const lines: string[] = [];
  const events: { date: string; code: string; desc: string }[] = [];
  let latest: any = null;
  for (const e of ev) {
    const rawDate = e.event_date || e.item_event_date || "";
    const date = rawDate ? rawDate.substring(0, 16).replace("T", " ") : "????";
    if (!latest || rawDate > (latest.event_date || latest.item_event_date || "")) latest = e;
    const code = e.code || e.event_code || "????";
    const desc = e.description || e.event_description || "";
    const detail = e.detail?.External_event_text || e.detail?.item_event_text || "";
    const clean = detail && detail !== "null" && detail !== "undefined" ? " - " + detail : "";
    lines.push(`${date} | [${code}] ${desc}${clean}`);
    events.push({ date, code, desc: desc + clean });
  }
  return { item_code, history: lines.join("\n"), shipping_status_code: latest ? String(latest.code || latest.event_code || "") : "", events };
}

export interface Sla { manifest_hours: number; transit_hours: number; delivery_hours: number; stationary_hours: number; h_en_estado: number; has_active_incident: boolean; active_incident_code: string | null; }

export function calcSla(bultos: Bulto[]): Sla {
  const now = Date.now();
  let manifest = 0, transit = 0, delivery = 0, stationary = 0;
  let last: number | null = null, hasInc = false, incCode: string | null = null;
  for (const b of bultos) {
    if (!b.history) continue;
    const evs: { d: number; c: string }[] = [];
    for (const line of b.history.split("\n")) {
      const parts = line.split(" | ");
      if (parts.length < 2) continue;
      const d = new Date(parts[0]).getTime();
      if (isNaN(d)) continue;
      const m = parts[1].match(/\[(\w+)\]/);
      evs.push({ d, c: m ? m[1] : "" });
    }
    if (!evs.length) continue;
    let lM = 0, lT = 0, lD = 0, lS = 0, lt = 0, lastInc: string | null = null;
    for (const e of evs) {
      if (e.d > lt) lt = e.d;
      if (["0000", "0030"].includes(e.c)) lM = e.d;
      if (["0900", "1000"].includes(e.c)) lT = e.d;
      if (["1200", "1500", "1600", "2400", "2600", "2700"].includes(e.c)) lD = e.d;
      if (["1700", "1800"].includes(e.c)) lS = e.d;
      if (INCIDENT_CODES.has(e.c)) lastInc = e.c;
      if (RESOLUTION_CODES.has(e.c)) lastInc = null;
    }
    if (lt && (!last || lt > last)) last = lt;
    if (lastInc) { hasInc = true; incCode = lastInc; }
    const h = (t: number) => (t ? (now - t) / 3600000 : 0);
    manifest = Math.max(manifest, h(lM)); transit = Math.max(transit, h(lT)); delivery = Math.max(delivery, h(lD)); stationary = Math.max(stationary, h(lS));
  }
  return {
    manifest_hours: +manifest.toFixed(1), transit_hours: +transit.toFixed(1), delivery_hours: +delivery.toFixed(1), stationary_hours: +stationary.toFixed(1),
    h_en_estado: last ? +((now - last) / 3600000).toFixed(1) : 0, has_active_incident: hasInc, active_incident_code: incCode,
  };
}

// ----------------------------- IA -----------------------------
const SYSTEM_PROMPT = `Eres un auditor logístico de CTT Express. Analiza el historial y decide la acción correcta. RESPONDE SOLO CON JSON PURO, SIN MARKDOWN.

### FUENTE DE VERDAD
Lee el historial cronológicamente. Los valores precalculados ya están calculados en JS — ÚSALOS DIRECTAMENTE, NO los recalcules.

### VERIFICACIÓN EN ORDEN ESTRICTO
PASO 0 — ESTADOS TERMINALES: ¿último evento 2500/2300/2310/2100/2000?
- 2500 → "devolucion". 2300/2310 → "punto_ctt". 2100/2000 → "none", should_notify:false.
PASO 1 — GRAVES: ¿1006/1008/1012? → "siniestro".
PASO 2 — INCIDENCIA ACTIVA (campo precalculado): 0600 → "recogida_fallida"; 1600/2400/2600/2700 → "segundo_intento".
PASO 3 — UMBRALES (prevalece sobre el sentido común):
- manifest_hours>24 y último 0000 → "pendiente"; y último 0030 → "recogida_0030".
- transit_hours>24 y sin [1200]/[1500] → "agilizar_transito".
- delivery_hours>24 → "agilizar_reparto". stationary_hours>24 → "agilizar_reparto".
- Ninguno supera umbral → "none".

### REGLAS
- PROHIBIDO saltarse Paso 3. 71_INAT NO es incidencia. Si should_notify=false → type "none"; si true → nunca "none".

### SALIDA JSON
{"analysis":{"ultimo_estado":"","item_afectado":null,"justificacion":""},"decision":{"is_incident":false,"should_notify":false,"notification_type":"none"}}`;

export interface AiResult { analysis?: { ultimo_estado?: string; item_afectado?: string | null; justificacion?: string }; decision?: { is_incident?: boolean; should_notify?: boolean; notification_type?: string }; }

export async function callAi(bultos: Bulto[], sla: Sla, ctx: { shipping_code: string; client_references: string[]; client_name: string }): Promise<AiResult | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const hist = bultos.map((b) => `Item: ${b.item_code}\n${b.history}`).join("\n\n---\n\n");
  const user = `Envío: ${ctx.shipping_code}\nReferencia: ${ctx.client_references[0] || "sin-ref"}\nCliente: ${ctx.client_name}\n\n--- PRECALCULADO ---\nmanifest: ${sla.manifest_hours}\ntransit: ${sla.transit_hours}\ndelivery: ${sla.delivery_hours}\nstationary: ${sla.stationary_hours}\nincidencia_activa: ${sla.has_active_incident}\ncodigo_incidencia: ${sla.active_incident_code || "ninguna"}\n\n--- HISTORIALES ---\n${hist}`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: user }] }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return JSON.parse(d.choices?.[0]?.message?.content || "{}");
  } catch { return null; }
}

// ----------------------------- Decisión -----------------------------
const TYPES_INTERNAL_FIRST = new Set(["pendiente", "devolucion", "siniestro"]);
const TPL: Record<string, { s: (p: string, c: string) => string; b: (p: string, c: string) => string }> = {
  pendiente: { s: () => "ALERTA PENDIENTE (0000)", b: (p, c) => `Hola, el envío lleva más de 24h en estado 0000. Revisadlo.\nPEDIDO: - ${p || c}` },
  devolucion: { s: (p, c) => `Devolución en proceso: ${p || c}`, b: (_p, c) => `El pedido ha entrado en devolución. Seguimiento manual.\nCÓDIGO: - ${c}` },
  siniestro: { s: (p, c) => `Apertura de siniestro: ${p || c}`, b: (_p, c) => `Solicitamos apertura de expediente de siniestro para el envío:\nREFERENCIA: - ${c}.` },
  segundo_intento: { s: (p, c) => `Incidencia en el envío ${p || c}`, b: (_p, c) => `Tras la incidencia, solicitamos segundo intento de reparto.\nEXPEDICIÓN: - ${c}.` },
  recogida_fallida: { s: (p, c) => `Incidencia en el envío ${p || c}`, b: (_p, c) => `Solicitamos reintentar la recogida fallida.\nEXPEDICIÓN: - ${c}.` },
  agilizar_transito: { s: (p, c) => `Incidencia en el envío ${p || c}`, b: (_p, c) => `El envío ${c} lleva +24h en tránsito sin pasar a reparto. Solicitamos reparto el próximo día hábil.` },
  agilizar_reparto: { s: (p, c) => `Incidencia en el envío ${p || c}`, b: (_p, c) => `El envío ${c} lleva +24h en reparto sin entregarse. Solicitamos sacarlo de nuevo a reparto hoy.` },
  punto_ctt: { s: (p, c) => `Envío en punto CTT: ${p || c}`, b: (_p, c) => `Necesitamos la dirección del punto de recogida del envío:\nEXPEDICIÓN: - ${c}.` },
  recogida_0030: { s: (p, c) => `Incidencia en el envío ${p || c}`, b: (_p, c) => `Solicitamos agilizar la recogida (+24h pendiente):\nLISTADO: - ${c}.` },
};

export interface Decision {
  is_incident: boolean; should_notify: boolean; notification_type: string;
  target_type: "none" | "standard" | "internal"; asunto: string; cuerpo: string;
  destinatario: string; numero_avisos: number; ai_justification: string; affected_bulto: string | null; estado_actual: string;
}

export function decide(p: { bultos: Bulto[]; sla: Sla; ai: AiResult | null; client: ClientConfig; refs: string[]; code: string; avisosPrevios: number; forceInternalCtx: boolean }): Decision {
  const { bultos, sla, ai, client, refs, code } = p;
  let is_incident = ai?.decision?.is_incident === true;
  let should_notify = ai?.decision?.should_notify === true;
  let notification_type = ai?.decision?.notification_type || "none";
  const ai_justification = ai?.analysis?.justificacion || (ai ? "Análisis IA" : "Sin IA (override SLA)");
  const affected_bulto = ai?.analysis?.item_afectado || null;
  const estado = String(bultos[0]?.shipping_status_code ?? "").replace(/["']/g, "").trim();

  const isM = estado === "0000" || estado === "0030";
  const isT = estado === "0900" || estado === "1000";
  const isD = ["1200", "1500", "1600", "2400", "2600", "2700"].includes(estado);
  const isS = estado === "1700" || estado === "1800";
  const is2500 = estado === "2500", is71 = estado === "71_INAT";
  const problematic = isD || isS || is2500 || is71 || sla.has_active_incident;

  const breached = (p.forceInternalCtx && problematic) || sla.has_active_incident ||
    (isM && sla.manifest_hours > 24) || (isT && sla.transit_hours > 24) || (isD && sla.delivery_hours > 24) || (isS && sla.stationary_hours > 24) || is71;

  if (breached) {
    is_incident = true; should_notify = true;
    if (notification_type === "none") {
      if (sla.has_active_incident) notification_type = sla.active_incident_code === "0600" ? "recogida_fallida" : "segundo_intento";
      else if (isM) notification_type = estado === "0030" ? "recogida_0030" : "pendiente";
      else if (isT) notification_type = "agilizar_transito";
      else if (is2500) notification_type = "devolucion";
      else if (is71 || isD || isS) notification_type = "agilizar_reparto";
    }
  }

  let target_type: Decision["target_type"] = "none", asunto = "", cuerpo = "", destinatario = "", numero_avisos = p.avisosPrevios;
  const ped = refs[0] || "";
  if (should_notify && notification_type !== "none") {
    const t = TPL[notification_type];
    if (t) { target_type = TYPES_INTERNAL_FIRST.has(notification_type) ? "internal" : "standard"; asunto = t.s(ped, code); cuerpo = t.b(ped, code); }
    else { target_type = "internal"; asunto = `Gestión Urgente: ${code}`; cuerpo = `Revisión manual del envío ${code}.\n${ai_justification}`; }
    numero_avisos += 1;
    if (numero_avisos > 1 && target_type === "standard") {
      target_type = "internal"; asunto = `[RE-INCIDENCIA] ${asunto}`;
      cuerpo = `Este envío ya fue notificado y sigue en incidencia. Gestionad manualmente.\n\n${cuerpo}`;
    }
    destinatario = target_type === "internal" ? client.internalEmail : client.ccaZone;
  }
  return { is_incident, should_notify, notification_type, target_type, asunto, cuerpo, destinatario, numero_avisos, ai_justification, affected_bulto, estado_actual: estado };
}

// ----------------------------- Lectura completa de UN envío -----------------------------
export interface ShipmentRead {
  shipping_code: string; client_code: string; client_name: string;
  meta: Record<string, unknown>; // metadata cruda de CTT (destinatario, direcciones, fechas…)
  bultos: Bulto[]; sla: Sla; ai: AiResult | null; decision: Decision;
  all_terminal: boolean;
}

/** Resuelve el client_code a partir del client_center_code de la metadata. */
export function clientFromCenter(centerCode: string): ClientConfig | null {
  for (const c of Object.values(CLIENTS)) if (c.centers.includes(centerCode)) return c;
  return null;
}

/**
 * Lee un envío completo (READ-ONLY). Si no se pasa client_code, se deduce del centro.
 * `prev` = doc previo de incidencias (para numero_avisos/force_internal); opcional.
 */
export async function readShipment(
  shipping_code: string,
  opts: { client_code?: string; prev?: any } = {},
): Promise<ShipmentRead> {
  // 1) Metadata + item_count con showItems=true (un token cualquiera sirve si no sabemos el cliente).
  let client = opts.client_code ? CLIENTS[opts.client_code] : null;
  let token = await getToken(client ?? CLIENTS["47352"]); // SNAPPY por defecto para la 1ª lectura
  let head = await fetchHistory(token, shipping_code, true);
  if (head?.error) throw new Error("CTT: " + head.error.message);

  const meta = head.data || {};
  // Deducir cliente real por el centro si no nos lo dieron.
  if (!client) {
    client = clientFromCenter(String(meta.client_center_code || "")) || CLIENTS["47352"];
    token = await getToken(client);
  }

  const itemCount = Number(meta.item_count || 1) || 1;
  const codes = Array.from({ length: itemCount }, (_, i) => shipping_code + String(i + 1).padStart(3, "0"));

  // 2) Historial por bulto.
  const bultos: Bulto[] = [];
  for (const c of codes) bultos.push(buildBulto(await fetchHistory(token, c, false), c));
  bultos.sort((a, b) => (a.item_code < b.item_code ? -1 : 1));

  // 3) SLA + IA + decisión.
  const refs = meta.client_reference ? [String(meta.client_reference)] : ["sin-ref"];
  const sla = calcSla(bultos);
  const ai = await callAi(bultos, sla, { shipping_code, client_references: refs, client_name: client.name });
  const avisos = parseInt(String(opts.prev?.numero_avisos ?? 0).replace(/"/g, "")) || 0;
  const is2500 = String(bultos[0]?.shipping_status_code) === "2500";
  const decision = decide({ bultos, sla, ai, client, refs, code: shipping_code, avisosPrevios: avisos, forceInternalCtx: is2500 });

  const all_terminal = bultos.length > 0 && bultos.every((b) => TERMINAL_CODES.has(String(b.shipping_status_code).replace(/"/g, "").trim()));

  return { shipping_code, client_code: client.code, client_name: client.name, meta, bultos, sla, ai, decision, all_terminal };
}
