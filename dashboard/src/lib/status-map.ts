import { Ejecucion, Incidencia } from "./types";

export const STATUS_LABELS: Record<string, string> = {
  "0000": "Manifestado",
  "0030": "Manifestado",
  "0500": "Envío recogido",
  "500":  "Envío recogido",
  "0600": "Recogida fallida",
  "600":  "Recogida fallida",
  "0900": "En tránsito",
  "900":  "En tránsito",
  "1000": "Delegación de tránsito",
  "1200": "Delegación destino",
  "1500": "En reparto",
  "20":   "En proceso",
  "1600": "Reparto fallido",
  "1700": "Envío estacionado",
  "1800": "Estacionado ubicado",
  "1900": "Pendiente de extracción",
  "2000": "Entregado",
  "2300": "Disponible en Punto CTT",
  "2310": "Pendiente de nuevos datos",
  "2400": "Reparto fallido (Incidencia)",
  "2500": "En devolución",
  "2600": "Incidencia (Dirección)",
  "2700": "Incidencia (Destinatario)",
  "71_INAT": "Nueva fecha de entrega",
  "6_INCT": "Daño detectado",
  "0": "Draft",
  "none": "Sin estado",
};

export interface StatusTheme {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

export const STATUS_THEMES: Record<string, StatusTheme> = {
  // Green - Success
  "2000": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  "2300": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  
  // Amber / Orange - Active / Transit
  "0900": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  "900":  { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  "1000": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  "1200": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  "1500": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  "20":   { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  
  // Red - Failure / Incident
  "0600": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  "600":  { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  "1600": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  "2400": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  "2600": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-600" },
  "2700": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-600" },
  "6_INCT": { bg: "bg-red-100", text: "text-red-800", border: "border-red-300", dot: "bg-red-600" },
  
  // Slate / Blue - Admin / Others
  "0000": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  "0030": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  "0500": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  "500":  { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  "1700": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", dot: "bg-slate-400" },
  "1800": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", dot: "bg-slate-400" },
  "1900": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", dot: "bg-slate-500" },
  "2310": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" }, // Pendiente nuevos datos
  "2500": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" }, // En devolución
  "71_INAT": { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" }, // Nueva fecha
};

const DEFAULT_THEME: StatusTheme = { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-300" };

export function getStatusTheme(code: string): StatusTheme {
  if (!code) return DEFAULT_THEME;
  const theme = STATUS_THEMES[code];
  if (theme) return theme;

  const padded = String(code).padStart(4, '0');
  const paddedTheme = STATUS_THEMES[padded];
  if (paddedTheme) return paddedTheme;

  return DEFAULT_THEME;
}

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
