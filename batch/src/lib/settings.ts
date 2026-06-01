/**
 * Configuración editable desde el dashboard: documento Firestore `config/batch_settings`.
 * El batch lo lee al arrancar y se auto-regula (días, horas, clientes, flags).
 * Así se cambia el comportamiento SIN redesplegar ni tocar gcloud.
 */

import { getDb } from "./firestore.js";
import { log } from "./logger.js";

export interface BatchSettings {
  enabled: boolean;
  /** Horas por día (ISO 1=Lun..7=Dom) en Europe/Madrid. Ej: { "1": [8,17,20], "2": [17,20] } */
  schedule: Record<string, number[]>;
  clients_enabled: string[]; // client_code permitidos
  send_emails: boolean;
  dry_run: boolean;
  // Legacy (compat): si no hay `schedule`, se construye con run_days × run_hours.
  run_days?: number[];
  run_hours?: number[];
}

export const DEFAULT_SETTINGS: BatchSettings = {
  enabled: true,
  schedule: { "1": [17, 20], "2": [17, 20], "3": [17, 20], "4": [17, 20], "5": [17, 20] },
  clients_enabled: ["48630", "47352", "47685", "45416"],
  send_emails: false,
  dry_run: true,
};

const COLLECTION = "config";
const DOC = "batch_settings";

/** Lee el doc de config; si no existe, devuelve defaults (no lo crea aquí). */
export async function getSettings(): Promise<BatchSettings> {
  try {
    const snap = await getDb().collection(COLLECTION).doc(DOC).get();
    if (!snap.exists) {
      log.warn("config/batch_settings no existe — usando defaults");
      return { ...DEFAULT_SETTINGS };
    }
    const d = snap.data() as Partial<BatchSettings>;
    // Construye schedule: usa el nuevo campo, o lo deriva del legacy run_days×run_hours.
    let schedule = d.schedule;
    if (!schedule || Object.keys(schedule).length === 0) {
      const days = d.run_days ?? DEFAULT_SETTINGS.run_days ?? [];
      const hours = d.run_hours ?? DEFAULT_SETTINGS.run_hours ?? [];
      schedule = {};
      for (const day of days) schedule[String(day)] = [...hours];
    }
    return {
      enabled: d.enabled ?? DEFAULT_SETTINGS.enabled,
      schedule,
      clients_enabled: d.clients_enabled ?? DEFAULT_SETTINGS.clients_enabled,
      send_emails: d.send_emails ?? DEFAULT_SETTINGS.send_emails,
      dry_run: d.dry_run ?? DEFAULT_SETTINGS.dry_run,
    };
  } catch (e) {
    log.error("No se pudo leer config/batch_settings — usando defaults", { razon: String(e) });
    return { ...DEFAULT_SETTINGS };
  }
}

/** Día (ISO 1-7) y hora actuales en Europe/Madrid. */
export function nowInMadrid(): { day: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { day: map[wd] ?? 1, hour: parseInt(hourStr) % 24 };
}

/**
 * ¿Debe ejecutarse ahora según la config?
 * `bypassTime` (modo prueba, p.ej. LIMIT>0) ignora el filtro de día/hora.
 */
export function shouldRunNow(s: BatchSettings, bypassTime: boolean): { run: boolean; reason: string } {
  if (!s.enabled) return { run: false, reason: "deshabilitado en config" };
  if (bypassTime) return { run: true, reason: "bypass de tiempo (prueba)" };
  const { day, hour } = nowInMadrid();
  const horasDelDia = s.schedule[String(day)] || [];
  if (!horasDelDia.includes(hour)) return { run: false, reason: `día ${day} hora ${hour} no programada` };
  return { run: true, reason: `día ${day} hora ${hour} OK` };
}
