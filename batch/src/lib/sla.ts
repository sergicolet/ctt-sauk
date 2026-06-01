/**
 * Extracción de bultos/historial y cálculo de horas SLA.
 * Porta "Code: Extraer Historial", "Code: Calcular Horas Fase" y "Code: Calcular SLA Horas"
 * (idéntico a calculateSLAFases de route.ts).
 */

import { INCIDENT_CODES, RESOLUTION_CODES } from "../config/constants.js";

export interface Bulto {
  item_code: string;
  history: string;
  shipping_status_code: string;
  events?: { date: string; code: string; desc: string }[];
}

export interface SlaResult {
  manifest_hours: number;
  transit_hours: number;
  delivery_hours: number;
  stationary_hours: number;
  h_en_estado: number;
  has_active_incident: boolean;
  active_incident_code: string | null;
}

const MAX_EVENTS = 20;

/** Formatea los eventos de UN historial de bulto en líneas de texto + último estado + lista. */
function formatEvents(rawEvents: any[]): { history: string; status: string; events: { date: string; code: string; desc: string }[] } {
  const evs = rawEvents.length <= MAX_EVENTS ? rawEvents : [rawEvents[0], ...rawEvents.slice(-(MAX_EVENTS - 1))];
  const lines: string[] = [];
  const events: { date: string; code: string; desc: string }[] = [];
  let latestEvent: any = null;
  for (const e of evs) {
    const rawDate = e.event_date || e.item_event_date || "";
    const date = rawDate ? rawDate.substring(0, 16).replace("T", " ") : "????-??-?? ??:??";
    if (!latestEvent || rawDate > (latestEvent.event_date || latestEvent.item_event_date || "")) latestEvent = e;
    const code = e.code || e.event_code || "????";
    const desc = e.description || e.event_description || "";
    const detailRaw = e.detail?.External_event_text || e.detail?.item_event_text || "";
    const cleanDetail = detailRaw && detailRaw !== "null" && detailRaw !== "undefined" ? " - " + detailRaw : "";
    lines.push(`${date} | [${code}] ${desc}${cleanDetail}`);
    events.push({ date, code, desc: desc + cleanDetail });
  }
  return { history: lines.join("\n"), status: latestEvent ? String(latestEvent.code || latestEvent.event_code || "") : "", events };
}

/**
 * Convierte la respuesta del history-api de UN bulto (showItems=false) en un Bulto.
 * Espejo de "Code: Extraer Historial" de main.json (un httpResp por item).
 */
export function extractSingleBulto(histResp: any, fallbackItemCode: string): Bulto {
  if (histResp?.error || !histResp?.data?.shipping_history) {
    return {
      item_code: fallbackItemCode,
      history: "ERROR: No se pudo obtener el historial (" + (histResp?.error?.message || "sin datos") + ")",
      shipping_status_code: "FETCH_ERROR",
    };
  }
  const histData = histResp.data.shipping_history;
  const item_code = histData.item_code || fallbackItemCode;
  const rawEvents: any[] = histData.events || (Array.isArray(histData) ? histData : []);
  const { history, status, events } = formatEvents(rawEvents);
  return { item_code, history, shipping_status_code: status, events };
}

/** Convierte la respuesta del history-api (showItems=true) en array de bultos formateados. */
export function extractBultos(histData: any, shippingCode: string): Bulto[] {
  let rawData = histData?.data?.shipping_history ?? histData?.data?.items_raw ?? [];
  const items: any[] = Array.isArray(rawData) ? rawData : rawData && typeof rawData === "object" ? [rawData] : [];

  if (items.length === 0) {
    items.push({ item_code: shippingCode + "001", events: [] });
  }

  const bultos: Bulto[] = items.map((it) => {
    const itemCode = it.item_code || shippingCode;
    const rawEvents: any[] = it.events || (Array.isArray(it) ? it : []);
    const events = rawEvents.length <= MAX_EVENTS ? rawEvents : [rawEvents[0], ...rawEvents.slice(-(MAX_EVENTS - 1))];

    const lines: string[] = [];
    let latestEvent: any = null;
    for (const e of events) {
      const rawDate = e.event_date || e.item_event_date || "";
      const date = rawDate ? rawDate.substring(0, 16).replace("T", " ") : "????-??-?? ??:??";
      if (!latestEvent || rawDate > (latestEvent.event_date || latestEvent.item_event_date || "")) latestEvent = e;
      const code = e.code || e.event_code || "????";
      const desc = e.description || e.event_description || "";
      const detailRaw = e.detail?.External_event_text || e.detail?.item_event_text || "";
      const cleanDetail = detailRaw && detailRaw !== "null" && detailRaw !== "undefined" ? " - " + detailRaw : "";
      lines.push(`${date} | [${code}] ${desc}${cleanDetail}`);
    }

    return {
      item_code: itemCode,
      history: lines.join("\n"),
      shipping_status_code: latestEvent ? String(latestEvent.code || latestEvent.event_code || "") : "",
    };
  });

  bultos.sort((a, b) => (a.item_code < b.item_code ? -1 : 1));
  return bultos;
}

/** Calcula horas por fase + incidencia activa. Espejo exacto de calculateSLAFases (route.ts). */
export function calculateSLA(bultos: Bulto[]): SlaResult {
  const now = new Date();
  let manifest_hours = 0;
  let transit_hours = 0;
  let delivery_hours = 0;
  let stationary_hours = 0;
  let last_event_date: Date | null = null;
  let has_active_incident = false;
  let active_incident_code: string | null = null;

  for (const b of bultos) {
    const historyStr = b.history || "";
    if (!historyStr) continue;

    const events: { date: Date; code: string | null }[] = [];
    for (const line of historyStr.split("\n")) {
      if (!line) continue;
      const parts = line.split(" | ");
      if (parts.length < 2) continue;
      const d = new Date(parts[0]);
      if (isNaN(d.getTime())) continue;
      const match = parts[1].match(/\[(\w+)\]/);
      events.push({ date: d, code: match ? match[1] : null });
    }
    if (events.length === 0) continue;

    let lManifest: Date | null = null;
    let lTransit: Date | null = null;
    let lDelivery: Date | null = null;
    let lStationary: Date | null = null;
    let latest: Date | null = null;
    let lastIncident: string | null = null;

    for (const e of events) {
      if (!latest || e.date > latest) latest = e.date;
      const c = e.code ?? "";
      if (["0000", "0030"].includes(c)) lManifest = e.date;
      if (["0900", "1000"].includes(c)) lTransit = e.date;
      if (["1200", "1500", "1600", "2400", "2600", "2700"].includes(c)) lDelivery = e.date;
      if (["1700", "1800"].includes(c)) lStationary = e.date;
      if (INCIDENT_CODES.has(c)) lastIncident = c;
      if (RESOLUTION_CODES.has(c)) lastIncident = null;
    }

    if (latest && (!last_event_date || latest > last_event_date)) last_event_date = latest;
    if (lastIncident) {
      has_active_incident = true;
      active_incident_code = lastIncident;
    }

    const diffNow = (d: Date | null) => (d ? (now.getTime() - d.getTime()) / 3600000 : 0);
    if (lManifest) manifest_hours = Math.max(manifest_hours, diffNow(lManifest));
    if (lTransit) transit_hours = Math.max(transit_hours, diffNow(lTransit));
    if (lDelivery) delivery_hours = Math.max(delivery_hours, diffNow(lDelivery));
    if (lStationary) stationary_hours = Math.max(stationary_hours, diffNow(lStationary));
  }

  return {
    manifest_hours: Number(manifest_hours.toFixed(1)),
    transit_hours: Number(transit_hours.toFixed(1)),
    delivery_hours: Number(delivery_hours.toFixed(1)),
    stationary_hours: Number(stationary_hours.toFixed(1)),
    h_en_estado: last_event_date ? Number(((now.getTime() - last_event_date.getTime()) / 3600000).toFixed(1)) : 0,
    has_active_incident,
    active_incident_code,
  };
}
