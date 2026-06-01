/**
 * runBatch(): ejecuta el batch completo (lo que dispara el Scheduler).
 * Invocable desde el CLI (index.ts) y desde el servidor HTTP (server.ts).
 */

import pLimit from "p-limit";
import { ALL_CLIENTS } from "./config/clients.js";
import { TERMINAL_CODES, SHIPMENT_CONCURRENCY } from "./config/constants.js";
import { getAccessToken, listShipments, type Shipment } from "./lib/ctt.js";
import { initFirestore, persistAll } from "./lib/firestore.js";
import { getSettings, shouldRunNow } from "./lib/settings.js";
import { processShipment, type ShipmentResult } from "./pipeline.js";
import { log } from "./lib/logger.js";

function filterActive(shipments: Shipment[]): Shipment[] {
  return shipments.filter((s) => {
    const status = String(s.shipping_status_code ?? "").replace(/"/g, "").trim();
    if (!TERMINAL_CODES.has(status)) return true;
    return (Array.isArray(s.items) ? s.items.length : 0) > 1;
  });
}

export interface BatchSummary {
  run: boolean;
  reason: string;
  runId: string;
  dry_run?: boolean;
  total?: number;
  por_fase?: Record<string, number>;
  notificaciones_por_tipo?: Record<string, number>;
  emails?: Record<string, number>;
  ms?: number;
}

/** `force` ignora el gate de día/hora (para ejecución manual desde dashboard). */
export async function runBatch(opts: { force?: boolean; limit?: number } = {}): Promise<BatchSummary> {
  const t0 = Date.now();
  const LIMIT = opts.limit ?? (process.env.LIMIT ? parseInt(process.env.LIMIT) : 0);
  const runId = `batch_${new Date().toISOString().replace(/[:.]/g, "-")}`;

  initFirestore();

  const settings = await getSettings();
  const gate = shouldRunNow(settings, opts.force === true || LIMIT > 0);
  log.info("Batch CTT iniciado", { fase_salida: "start", runId, gate: gate.reason, settings } as any);
  if (!gate.run) {
    log.info("Batch no se ejecuta ahora", { fase_salida: "skipped_by_config", razon: gate.reason } as any);
    return { run: false, reason: gate.reason, runId };
  }

  if (process.env.DRY_RUN === undefined) process.env.DRY_RUN = String(settings.dry_run);
  if (process.env.SEND_EMAILS === undefined) process.env.SEND_EMAILS = String(settings.send_emails);
  const dryRun = process.env.DRY_RUN !== "false";

  const clients = ALL_CLIENTS.filter((c) => settings.clients_enabled.includes(c.code));
  const limit = pLimit(SHIPMENT_CONCURRENCY);
  const results: ShipmentResult[] = [];

  for (const client of clients) {
    let token: string;
    try {
      token = await getAccessToken(client);
    } catch (e) {
      log.error("Token cliente falló", { client: client.name, razon: String(e) });
      continue;
    }

    let active = filterActive(await listShipments(token, client));
    if (LIMIT > 0) active = active.slice(0, LIMIT);
    log.info("Procesando cliente", { client: client.name, activos: active.length } as any);

    const clientResults = await Promise.all(
      active.map((s) =>
        limit(async () => {
          try {
            return await processShipment(s, client, token, runId);
          } catch (e) {
            const sc = String(s.shipping_code);
            log.error("processShipment excepción", { shipping_code: sc, razon: String(e) });
            return {
              shipping_code: sc,
              client: client.name,
              fase_salida: "error" as const,
              razon: String(e),
              records: {
                docid: sc,
                ejecucion: { numero_envio: sc, tienda: client.name, razon: String(e), fecha_procesado: new Date().toISOString() },
                incidencia: null,
                trazabilidad: {
                  shipping_code: sc, client_code: client.code, tienda: client.name,
                  fecha: new Date().toISOString(), ejecucion_id: runId, fase_salida: "error", razon: String(e),
                },
              },
            };
          }
        }),
      ),
    );
    results.push(...clientResults);
  }

  await persistAll(results.map((r) => r.records));

  const byFase: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byEmail: Record<string, number> = {};
  for (const r of results) {
    byFase[r.fase_salida] = (byFase[r.fase_salida] || 0) + 1;
    if (r.fase_salida === "notified") {
      byType[r.notification_type || "?"] = (byType[r.notification_type || "?"] || 0) + 1;
      if (r.email_outcome) byEmail[r.email_outcome] = (byEmail[r.email_outcome] || 0) + 1;
    }
  }

  const summary: BatchSummary = {
    run: true, reason: gate.reason, runId, dry_run: dryRun,
    total: results.length, por_fase: byFase, notificaciones_por_tipo: byType, emails: byEmail, ms: Date.now() - t0,
  };
  log.info("Batch CTT finalizado", { fase_salida: "done", ...summary } as any);
  return summary;
}
