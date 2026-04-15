import { Ejecucion, Incidencia } from "./types";

export const STATUS_LABELS: Record<string, string> = {
  "0000": "Manifestado",
  "0030": "Manifestado",
  "0500": "Envío recogido",
  "500":  "Envío recogido", // Add numerical alias
  "0600": "Recogida fallida",
  "600":  "Recogida fallida",  // Add numerical alias
  "0900": "En tránsito",
  "900":  "En tránsito",      // Add numerical alias
  "1000": "Delegación de tránsito",
  "1200": "Delegación destino",
  "1500": "En reparto",
  "20":   "En proceso", // Mapping 20 to En proceso / En reparto logic
  "1600": "Reparto fallido",
  "1700": "Envío estacionado",
  "1800": "Estacionado ubicado",
  "1900": "Pendiente de extracción",
  "2000": "Entregado",
  "2300": "Disponible en Punto CTT",
  "2310": "Pendiente de nuevos datos",
  "2400": "Reparto fallido (Incidencia)",
  "2500": "Devolución en proceso",
  "2600": "Incidencia (Dirección)",
  "2700": "Incidencia (Destinatario)",
  "71_INAT": "Nueva fecha de entrega",
  "6_INCT": "Daño detectado",
};

export const SHOP_NAMES: Record<string, string> = {
  "48630": "HAMINOS",
  "47685": "MIESTERY",
  "45416": "KULTUDENDA",
  "47352": "SNAPPY",
};

export function getShopName(clientCode: string): string {
  return SHOP_NAMES[clientCode] || "DESCONOCIDO";
}

export function getShopFromCenter(centerCode: string): string {
  if (!centerCode) return "N/A";
  const prefix = String(centerCode).substring(0, 5);
  return SHOP_NAMES[prefix] || "N/A";
}

// Normalize free-text values the AI occasionally writes instead of codes
const FREE_TEXT_NORMALIZE: Record<string, string> = {
  "reparto fallido": "Reparto fallido",
  "en reparto": "En reparto",
  "en tránsito": "En tránsito",
  "en transito": "En tránsito",
  "entregado": "Entregado",
  "devolucion en proceso": "Devolución en proceso",
  "devolución en proceso": "Devolución en proceso",
  "incidencia": "Reparto fallido (Incidencia)",
  "ninguna": "Sin estado",
  "none": "Sin estado",
  "sin estado": "Sin estado",
};

export function getStatusLabel(code: string): string {
  if (!code) return "Sin estado";
  const label = STATUS_LABELS[code];
  if (label) return label;

  // Clean variations like 0500 vs 500
  const padded = String(code).padStart(4, '0');
  const paddedLabel = STATUS_LABELS[padded];
  if (paddedLabel) return paddedLabel;

  // Normalize free-text written by AI
  const normalized = FREE_TEXT_NORMALIZE[String(code).trim().toLowerCase()];
  if (normalized) return normalized;

  // Unknown code — return as-is so it stays visible but won't pollute the filter
  return code;
}

export function getActiveHours(item: Ejecucion | Incidencia): { hours: number; label: string } {
  const estado = 'estado' in item ? item.estado : ('incidencia' in item ? item.incidencia : '');
  const padded = String(estado).padStart(4, '0');
  
  // Logic for Transition/Fases
  const isTransit = ["0900", "1000"].includes(padded);
  const isDelivery = ["1200", "1500", "1600", "2400", "2600", "2700"].includes(padded);
  const isStationary = ["1700", "1800"].includes(padded);
  const isManifest = ["0000", "0030"].includes(padded);

  if (isDelivery && (item.delivery_hours ?? 0) > 0) return { hours: item.delivery_hours!, label: "Reparto" };
  if (isTransit && (item.transit_hours ?? 0) > 0) return { hours: item.transit_hours!, label: "Tránsito" };
  if (isStationary && (item.stationary_hours ?? 0) > 0) return { hours: item.stationary_hours!, label: "Estacionado" };
  if (isManifest && (item.manifest_hours ?? 0) > 0) return { hours: item.manifest_hours!, label: "Grabación" };

  const h_en_estado = 'h_en_estado' in item ? item.h_en_estado : ('h_en_incidencia' in item ? item.h_en_incidencia : 0);
  if (h_en_estado > 0) return { hours: h_en_estado, label: "Activo" };

  return { hours: 0, label: "" };
}

export function cleanTracking(code: any): string {
  if (!code) return "";
  return String(code).replace(/^"+|"+$/g, '').trim();
}
