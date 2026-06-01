/**
 * Test manual: busca envíos con VARIOS bultos y muestra el desglose completo
 * de la decisión (SLA + IA + routing). Dry-run total: no escribe ni envía.
 *
 * Uso:  node test-multibulto.mjs [N]      (N = nº de envíos, default 10)
 */
import { loadEnv } from "./dist/lib/env.js";
loadEnv();

import { ALL_CLIENTS } from "./dist/config/clients.js";
import { getAccessToken, listShipments, fetchItemHistory } from "./dist/lib/ctt.js";
import { extractSingleBulto, calculateSLA } from "./dist/lib/sla.js";
import { analyze } from "./dist/lib/ai.js";
import { decide } from "./dist/lib/decision.js";
import { initFirestore, prepareContext } from "./dist/lib/firestore.js";

const TARGET = parseInt(process.argv[2] || "10");
const TERMINAL = new Set(["2000", "2100", "2300", "2310", "3000"]);

initFirestore();

const found = [];

for (const client of ALL_CLIENTS) {
  if (found.length >= TARGET) break;
  let token;
  try {
    token = await getAccessToken(client);
  } catch (e) {
    console.error(`[${client.name}] token fallo:`, String(e));
    continue;
  }
  const shipments = (await listShipments(token, client)).filter((s) => {
    const st = String(s.shipping_status_code ?? "").replace(/"/g, "").trim();
    return !TERMINAL.has(st);
  });

  // Solo envíos con varios bultos (items[].length > 1), según el listado.
  const multi = shipments.filter((s) => Array.isArray(s.items) && s.items.length > 1);
  let scanned = 0;
  for (const s of multi) {
    if (found.length >= TARGET) break;
    if (scanned++ > 40) break;
    const itemCodes = s.items.map((it) => it.item_code);
    const bultos = await Promise.all(itemCodes.map(async (c) => extractSingleBulto(await fetchItemHistory(token, c), c)));
    bultos.sort((a, b) => (a.item_code < b.item_code ? -1 : 1));
    if (bultos.length < 2) continue;

    const estado_actual = String(bultos[0]?.shipping_status_code ?? "").replace(/"/g, "").trim();
    const refs = s.client_references || ["sin-ref"];
    const ctx = await prepareContext(String(s.shipping_code), estado_actual, refs);
    const sla = calculateSLA(bultos);
    const ai = await analyze(bultos, sla, { shipping_code: String(s.shipping_code), client_references: ctx.client_references, client_name: client.name });
    const decision = decide({
      bultos, sla, ai, client,
      client_references: ctx.client_references,
      shipping_code: String(s.shipping_code),
      numero_avisos_previos: ctx.numero_avisos,
      force_internal_ctx: ctx.force_internal,
    });
    found.push({ client, s, bultos, sla, ai, ctx, decision });
  }
}

// ---------- Informe ----------
console.log("\n" + "=".repeat(90));
console.log(`INFORME — ${found.length} envíos multi-bulto`);
console.log("=".repeat(90));

for (const [i, f] of found.entries()) {
  const { client, s, bultos, sla, ai, ctx, decision } = f;
  console.log(`\n#${i + 1}  ${s.shipping_code}   [${client.name}]   bultos: ${bultos.length}`);
  console.log("   estados por bulto: " + bultos.map((b) => `${b.item_code.slice(-4)}=${b.shipping_status_code}`).join("  "));
  console.log(`   SLA  manifest:${sla.manifest_hours}h  transit:${sla.transit_hours}h  delivery:${sla.delivery_hours}h  stationary:${sla.stationary_hours}h`);
  console.log(`   incidencia_activa: ${sla.has_active_incident}${sla.active_incident_code ? " (" + sla.active_incident_code + ")" : ""}   avisos_previos: ${ctx.numero_avisos}   force_internal_ctx: ${ctx.force_internal}`);
  console.log(`   IA: ${ai ? `notify=${ai.decision?.should_notify} tipo=${ai.decision?.notification_type}` : "SIN IA (override)"}`);
  if (ai?.analysis?.justificacion) console.log(`   IA justificación: ${ai.analysis.justificacion.slice(0, 140)}`);
  console.log(`   ► DECISIÓN: notify=${decision.should_notify}  tipo=${decision.notification_type}  target=${decision.target_type}  → ${decision.destinatario || "(nadie)"}`);
  if (decision.should_notify) console.log(`     asunto: ${decision.asunto}`);
}

console.log("\n" + "=".repeat(90));
const resumen = {};
for (const f of found) {
  const k = f.decision.should_notify ? `${f.decision.notification_type}/${f.decision.target_type}` : "no_notify";
  resumen[k] = (resumen[k] || 0) + 1;
}
console.log("Resumen:", JSON.stringify(resumen));
process.exit(0);
