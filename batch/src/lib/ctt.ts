/**
 * Cliente CTT Express: autenticación OAuth2 + listado paginado de envíos.
 * Porta los nodos "Token CTT", el subworkflow de paginación y "HTTP: Historial Bulto".
 */

import pLimit from "p-limit";
import { ClientConfig } from "../config/clients.js";
import { DAYS_RANGE, PAGE_LIMIT } from "../config/constants.js";
import { log } from "./logger.js";

const TOKEN_URL = "https://api.cttexpress.com/integrations/oauth2/token";
const SHIPPINGS_URL = "https://api.cttexpress.com/integrations/trf/web-tracking/v1.0/shippings";
const HISTORY_URL = "https://api.cttexpress.com/integrations-info/trf/item-history-api/history";

export interface Shipment {
  shipping_code: string;
  client_code?: string;
  client_center_code?: string;
  client_references?: string[];
  shipping_status_code?: string;
  shipping_status_datetime?: string;
  items?: { item_code: string }[];
  [key: string]: unknown;
}

/** yyyy-MM-dd local. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Obtiene un access_token (client_credentials). Reintenta hasta 5 veces como en n8n. */
export async function getAccessToken(client: ClientConfig): Promise<string> {
  const params = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: "client_credentials",
    scope: "urn:com:ctt-express:integration-clients:scopes:common/ALL",
  });

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      if (!res.ok) throw new Error(`token HTTP ${res.status}`);
      const data = (await res.json()) as { access_token?: string };
      if (!data.access_token) throw new Error("token vacío");
      return data.access_token;
    } catch (e) {
      lastErr = e;
      log.warn(`Token CTT fallo (intento ${attempt}/5)`, { client: client.name, razon: String(e) });
      await sleep(5000);
    }
  }
  throw new Error(`No se pudo obtener token CTT para ${client.name}: ${String(lastErr)}`);
}

/** Lee una página de envíos de un centro. */
async function fetchPage(
  token: string,
  centerCode: string,
  page: number,
  from: string,
  to: string,
): Promise<{ data: Shipment[]; lastPage: number }> {
  const url = new URL(SHIPPINGS_URL);
  url.searchParams.set("mapping_table_code", "APITRACK");
  url.searchParams.set("client_center_code", centerCode);
  url.searchParams.set("shipping_date", `${from}[range]${to}`);
  url.searchParams.set("page_limit", String(PAGE_LIMIT));
  url.searchParams.set("page_offsets", String(page));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`shippings HTTP ${res.status}`);
      const json = (await res.json()) as {
        data?: Shipment[];
        pagination?: { page_offsets?: { current?: number; last?: number } };
      };
      const data = Array.isArray(json.data) ? json.data.filter((s) => s && s.shipping_code) : [];
      const lastPage = Math.max(Number(json.pagination?.page_offsets?.last ?? 1), 1);
      return { data, lastPage };
    } catch (e) {
      lastErr = e;
      await sleep(2000);
    }
  }
  log.warn(`Página de envíos fallida`, { client: centerCode, razon: String(lastErr), page });
  return { data: [], lastPage: 1 };
}

/**
 * Lista TODOS los envíos de un cliente (todos sus centros, todas las páginas).
 * Equivale al subworkflow de paginación, pero con páginas en paralelo.
 */
export async function listShipments(token: string, client: ClientConfig): Promise<Shipment[]> {
  const now = new Date();
  const from = ymd(new Date(now.getTime() - DAYS_RANGE * 86400000));
  const to = ymd(now);
  const pageLimit = pLimit(4); // hasta 4 páginas concurrentes
  const all: Shipment[] = [];

  for (const center of client.centers) {
    // Página 1: nos dice cuántas páginas hay.
    const first = await fetchPage(token, center, 1, from, to);
    for (const s of first.data) all.push(tag(s, client.code, center));

    if (first.lastPage > 1) {
      const rest = await Promise.all(
        Array.from({ length: first.lastPage - 1 }, (_, i) => i + 2).map((p) =>
          pageLimit(() => fetchPage(token, center, p, from, to)),
        ),
      );
      for (const r of rest) for (const s of r.data) all.push(tag(s, client.code, center));
    }
  }

  log.info(`Envíos listados`, { client: client.name, total: all.length } as any);
  return all;
}

function tag(s: Shipment, clientCode: string, centerCode: string): Shipment {
  return { ...s, client_code: s.client_code ?? clientCode, client_center_code: s.client_center_code ?? centerCode };
}

/** Historial completo de un envío con todos sus bultos (showItems=true). Como route.ts. */
export async function fetchShippingHistory(token: string, shippingCode: string): Promise<any> {
  const url = `${HISTORY_URL}/${shippingCode}?view=APITRACK&showItems=true`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 502 || res.status === 504) {
        await sleep(3000);
        continue;
      }
      if (!res.ok) return { error: { message: `HTTP ${res.status}` } };
      return await res.json();
    } catch (e) {
      await sleep(3000);
    }
  }
  return { error: { message: "Excedidos reintentos máximos" } };
}

/** Historial de un bulto concreto (item_code). Reintenta 502/504 como en route.ts. */
export async function fetchItemHistory(token: string, itemCode: string): Promise<any> {
  const url = `${HISTORY_URL}/${itemCode}?view=APITRACK&showItems=false`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 502 || res.status === 504) {
        await sleep(3000);
        continue;
      }
      if (!res.ok) return { error: { message: `HTTP ${res.status}` } };
      return await res.json();
    } catch (e) {
      await sleep(3000);
    }
  }
  return { error: { message: "Excedidos reintentos máximos" } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
