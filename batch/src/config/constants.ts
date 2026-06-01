/** Códigos de estado CTT y umbrales SLA. Espejo de la lógica de main.json / route.ts. */

export const TERMINAL_CODES = new Set(["2000", "2100", "2300", "2310", "3000"]);
export const INCIDENT_CODES = new Set(["1600", "2400", "2600", "2700", "0600"]);
export const RESOLUTION_CODES = new Set(["1500", "2000", "2100"]);

/** Umbral genérico de horas para considerar una fase como incidencia. */
export const SLA_HOURS = 24;
/** Delegación destino [1200] tiene un umbral más alto. */
export const SLA_HOURS_DELEGACION = 48;

/** Ventana de búsqueda de envíos y tamaño de página (espejo de "Edit Fields" en n8n). */
export const DAYS_RANGE = 30;
export const PAGE_LIMIT = 20;

/** Concurrencia del batch. */
export const SHIPMENT_CONCURRENCY = 15; // envíos procesados en paralelo
export const BULTO_CONCURRENCY = 5; // historiales de bulto en paralelo por envío
