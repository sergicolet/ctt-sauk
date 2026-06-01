/**
 * Servidor HTTP del servicio CTT (Cloud Run Service + localhost).
 * Endpoints:
 *   GET  /health            → ok
 *   POST /read    {shipping_code, client_code?}   → lectura read-only (todos los bultos, SLA, IA, decisión)
 *   POST /refresh {shipping_code, client_code?}   → manual refresh (lee + escribe + email si procede)
 *   POST /run-batch {force?, limit?}              → ejecuta el batch completo (lo dispara el Scheduler)
 *
 * Local:  npm run serve   → http://localhost:8080
 */
import { loadEnv } from "./lib/env.js";
loadEnv();

import http from "http";
import { initFirestore } from "./lib/firestore.js";
import { readShipment, refreshShipment } from "./single.js";
import { runBatch } from "./run.js";
import { log } from "./lib/logger.js";

const PORT = parseInt(process.env.PORT || "8080");

initFirestore();

function send(res: http.ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  });
  res.end(data);
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && url === "/health") return send(res, 200, { ok: true, service: "ctt-batch" });

  try {
    if (req.method === "POST" && url === "/read") {
      const { shipping_code, client_code } = await readBody(req);
      if (!shipping_code) return send(res, 400, { success: false, error: "Falta shipping_code" });
      const result = await readShipment(String(shipping_code).trim(), client_code || undefined);
      return send(res, 200, { success: true, result });
    }

    if (req.method === "POST" && url === "/refresh") {
      const { shipping_code, client_code } = await readBody(req);
      if (!shipping_code) return send(res, 400, { success: false, error: "Falta shipping_code" });
      const result = await refreshShipment(String(shipping_code).trim(), client_code || undefined);
      return send(res, 200, { success: true, result });
    }

    if (req.method === "POST" && url === "/run-batch") {
      const { force, limit } = await readBody(req);
      const summary = await runBatch({ force: force === true, limit: limit ? Number(limit) : undefined });
      return send(res, 200, { success: true, summary });
    }

    return send(res, 404, { success: false, error: "Not found" });
  } catch (e: any) {
    log.error("HTTP error", { razon: String(e?.message || e) });
    return send(res, 500, { success: false, error: e?.message || String(e) });
  }
});

server.listen(PORT, () => log.info(`Servidor CTT escuchando`, { port: PORT } as any));
