/**
 * CLI entry del batch (modo Cloud Run Job / ejecución directa).
 * Para el servidor HTTP, ver server.ts.
 *
 * Env opcionales: LIMIT=N, DRY_RUN, SEND_EMAILS, OPENAI_API_KEY.
 */
import { loadEnv } from "./lib/env.js";
loadEnv();

import { runBatch } from "./run.js";
import { log } from "./lib/logger.js";

runBatch()
  .then(() => process.exit(0))
  .catch((e) => {
    log.error("Batch CTT abortado", { razon: String(e) });
    process.exit(1);
  });
