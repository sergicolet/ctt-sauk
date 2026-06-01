/**
 * Log estructurado JSON → stdout → Cloud Logging.
 * En Cloud Run, cada línea JSON de stdout se indexa como una entrada de log.
 * Filtrable en Cloud Logging por: jsonPayload.shipping_code, jsonPayload.fase_salida, severity...
 */

type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

interface LogFields {
  shipping_code?: string;
  client?: string;
  fase_salida?: string;
  razon?: string;
  ms?: number;
  [key: string]: unknown;
}

function emit(severity: Severity, message: string, fields: LogFields = {}) {
  // Cloud Logging entiende `severity` y `message`; el resto va en jsonPayload.
  const entry = { severity, message, ...fields };
  // ERROR/WARNING a stderr para separar streams; resto a stdout.
  const line = JSON.stringify(entry);
  if (severity === "ERROR" || severity === "WARNING") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  debug: (msg: string, f?: LogFields) => emit("DEBUG", msg, f),
  info: (msg: string, f?: LogFields) => emit("INFO", msg, f),
  warn: (msg: string, f?: LogFields) => emit("WARNING", msg, f),
  error: (msg: string, f?: LogFields) => emit("ERROR", msg, f),
};
