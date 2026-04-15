"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Ejecucion } from "@/lib/types";
import {
  ExternalLink,
  History,
  Info,
  Mail,
  Store,
  MapPin,
  User,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  FileEdit,
  Package,
  Clock,
  CalendarClock,
} from "lucide-react";
import {
  getShopFromCenter,
  getStatusLabel,
  getActiveHours,
  cleanTracking,
} from "@/lib/status-map";

interface BultoHistorial {
  item_code: string;
  formatted_history: string;
  total_events: number;
}

interface Props {
  ejecuciones: Ejecucion[];
}

const TERMINAL_CODES = ["2500", "2300", "2310"];

function parseBultos(bultos_historial_json?: string, historial_formateado?: string): BultoHistorial[] {
  if (bultos_historial_json) {
    try {
      const parsed = JSON.parse(bultos_historial_json) as BultoHistorial[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fall through */ }
  }
  return historial_formateado
    ? [{ item_code: "bulto_1", formatted_history: historial_formateado, total_events: 0 }]
    : [];
}

function formatEvents(history: string) {
  if (!history) return <p className="text-muted-foreground italic text-sm">Sin eventos disponibles.</p>;
  const events = history.trim().split(/(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
  return (
    <div className="space-y-3 pt-1">
      {events.filter(Boolean).map((event, i) => (
        <div key={i} className="flex gap-3 border-l-2 border-slate-100 pl-3 py-0.5 hover:border-primary/50 transition-colors">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">{event.substring(0, 16)}</span>
            <span className="text-sm font-semibold text-slate-900 leading-snug">{event.substring(18)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BultoHistorialView({ bultos }: { bultos: BultoHistorial[] }) {
  const [activeBulto, setActiveBulto] = useState(0);

  if (bultos.length === 0) {
    return <p className="text-muted-foreground italic text-sm">No hay historial disponible.</p>;
  }

  const label = (b: BultoHistorial, i: number) => {
    const match = b.item_code.match(/(\d{3})$/);
    return match ? `Bulto ${parseInt(match[1], 10)}` : `Bulto ${i + 1}`;
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {bultos.length > 1 && (
        <div className="flex gap-2 flex-wrap shrink-0">
          {bultos.map((b, i) => (
            <button
              key={i}
              onClick={() => setActiveBulto(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                activeBulto === i
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-primary/40"
              }`}
            >
              <Package className="h-3 w-3" />
              {label(b, i)}
              {b.total_events > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeBulto === i ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {b.total_events}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col flex-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm min-h-0">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
              {label(bultos[activeBulto], activeBulto)}
            </span>
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">{bultos[activeBulto].item_code}</span>
          </div>
          {bultos[activeBulto].total_events > 0 && (
            <span className="text-[10px] font-bold text-slate-400">{bultos[activeBulto].total_events} eventos</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-5 bg-white custom-scrollbar">
          {formatEvents(bultos[activeBulto].formatted_history)}
        </div>
      </div>
    </div>
  );
}

export function EjecucionesTable({ ejecuciones }: Props) {
  const [selectedEj, setSelectedEj] = useState<Ejecucion | null>(null);

  function renderStatusBadge(code: string, dano: boolean) {
    const label = getStatusLabel(code);
    const isTerminal = TERMINAL_CODES.includes(code);

    // Terminal siempre tiene prioridad sobre el daño
    if (!isTerminal && dano) {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 px-3 py-1 font-bold gap-1 shadow-none">
          <AlertCircle className="h-3 w-3" />
          Daño Detectado
        </Badge>
      );
    }

    const isError = ["1600", "2400", "2600", "2700", "0600", "2310"].includes(code);
    const isSuccess = ["2000"].includes(code);
    const isWarning = ["2500", "2300"].includes(code);

    if (isError) return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-100 px-3 py-1 font-semibold shadow-none">{label}</Badge>;
    if (isSuccess) return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 px-3 py-1 font-semibold shadow-none">{label}</Badge>;
    if (isWarning) return <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-100 px-3 py-1 font-semibold shadow-none">{label}</Badge>;
    return <Badge variant="secondary" className="bg-slate-50 text-slate-600 border-slate-100 px-3 py-1 font-medium shadow-none">{label}</Badge>;
  }

  function renderTypeBadge(type?: string, forced?: boolean) {
    const t = (type || "").toLowerCase();
    if (t.includes("internal") || forced) {
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 gap-1.5 font-medium px-2 shadow-none">
          <ShieldCheck className="h-3 w-3" />
          Interno
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 gap-1.5 font-medium px-2 shadow-none">
        <FileEdit className="h-3 w-3" />
        Draft CTT
      </Badge>
    );
  }

  return (
    <>
      <div className="rounded-2xl border bg-white shadow-sm overflow-x-auto custom-scrollbar">
        <div className="min-w-[1000px] w-full">
          <Table>
            <TableHeader className="bg-slate-50 border-b">
              <TableRow className="hover:bg-transparent">
                <TableHead className="py-6 px-6 font-bold text-slate-950 uppercase tracking-wider text-[11px]">Envío / Tracking</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px]">Pedido</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px]">Tienda</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px]">Estado</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px]">Canal</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px] text-right">Tiempo Activo</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px]">Notificado</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px] text-right">Fecha Revisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ejecuciones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400 py-24">
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="h-10 w-10 opacity-20" />
                      <p className="text-lg font-medium">No hay ejecuciones registradas</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {ejecuciones.map((ej) => {
                const cleanedCode = cleanTracking(ej.numero_envio);
                const timing = getActiveHours(ej);
                return (
                  <TableRow
                    key={ej.id}
                    className="group cursor-pointer hover:bg-slate-50 transition-colors border-b last:border-0"
                    onClick={() => setSelectedEj(ej)}
                  >
                    <TableCell className="py-6 px-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-950">{cleanedCode}</span>
                        <a href={`https://www.cttexpress.com/localizador-de-envios/?sc=${cleanedCode}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 transition-colors" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="py-6"><span className="text-sm font-bold text-slate-950">{ej.numero_pedido}</span></TableCell>
                    <TableCell className="py-6">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-slate-950" />
                        <span className="text-sm font-bold text-slate-950">{ej.tienda}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6">{renderStatusBadge(ej.estado, ej.dano)}</TableCell>
                    <TableCell className="py-6">{renderTypeBadge(ej.tipo_email, ej.forzado_interno)}</TableCell>
                    <TableCell className="py-6 text-right">
                      {timing.hours > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold ${timing.hours > 24 ? "text-red-600" : "text-slate-900"}`}>{timing.hours}h</span>
                          <span className="text-[10px] uppercase font-bold text-slate-950 tracking-tighter">{timing.label}</span>
                        </div>
                      ) : <span className="text-slate-950">—</span>}
                    </TableCell>
                    <TableCell className="py-6">
                      {ej.email_enviado ? (
                        <div className="flex flex-col items-center gap-0.5 text-center">
                          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700">
                            <Mail className="h-3 w-3 text-blue-600" />
                            {ej.destinatario || "Sin nombre"}
                          </div>
                          <span className="text-[9px] font-bold text-primary uppercase tracking-tight">
                            {(ej.tipo_email || "").toLowerCase().includes("internal") || ej.forzado_interno ? "Alerta Interna" : "Draft CTT"}
                          </span>
                        </div>
                      ) : <div className="flex justify-center"><span className="text-slate-950">—</span></div>}
                    </TableCell>
                    <TableCell className="py-6 text-right">
                      <span className="text-[11px] font-bold text-slate-950">{ej.fecha_procesado}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={!!selectedEj} onOpenChange={(open) => !open && setSelectedEj(null)}>
        <SheetContent className="w-full sm:!max-w-[90vw] overflow-hidden flex flex-col !transition-all p-0">
          {selectedEj && (() => {
            const bultos = parseBultos(selectedEj.bultos_historial_json, selectedEj.historial_formateado);
            const timing = getActiveHours(selectedEj);
            const cleanedCode = cleanTracking(selectedEj.numero_envio);
            const isInternal = (selectedEj.tipo_email || "").toLowerCase().includes("internal") || selectedEj.forzado_interno;

            return (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
                  <SheetHeader className="text-left">
                    <SheetTitle className="text-xl font-extrabold break-all leading-tight flex items-center gap-2">
                      <span className="text-slate-500 font-medium text-base">Envío</span>
                      <span className="text-primary">{cleanedCode}</span>
                      <a href={`https://www.cttexpress.com/localizador-de-envios/?sc=${cleanedCode}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-opacity">
                        <ExternalLink className="h-5 w-5" />
                      </a>
                    </SheetTitle>
                    <SheetDescription className="text-sm font-bold text-slate-600">
                      {selectedEj.numero_pedido} &middot; {selectedEj.tienda}
                    </SheetDescription>
                  </SheetHeader>
                </div>

                {/* Body: two columns */}
                <div className="flex flex-col md:grid md:grid-cols-[280px_1fr] flex-1 min-h-0 overflow-hidden">

                  {/* LEFT — metadata */}
                  <div className="md:border-r border-slate-100 px-5 py-5 space-y-5 overflow-y-auto md:overflow-y-auto custom-scrollbar shrink-0 md:shrink bg-slate-50/40">

                    {/* Estado */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado Actual</p>
                      {renderStatusBadge(selectedEj.estado, selectedEj.dano)}
                    </div>

                    {/* Canal */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Canal Notificación</p>
                      {renderTypeBadge(selectedEj.tipo_email, selectedEj.forzado_interno)}
                    </div>

                    {/* Tiempo activo */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tiempo Activo</p>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span className={`text-sm font-bold ${timing.hours > 24 ? "text-red-600" : "text-slate-900"}`}>
                          {timing.hours}h
                        </span>
                        {timing.label && <span className="text-[10px] text-slate-400 font-bold uppercase">{timing.label}</span>}
                      </div>
                    </div>

                    {/* Destinatario */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Destinatario</p>
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm font-bold text-slate-800">{selectedEj.destinatario || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {selectedEj.email_enviado ? (
                          <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-extrabold rounded-md">NOTIFICADO</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 font-extrabold rounded-md">PENDIENTE</span>
                        )}
                        {isInternal && <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 font-extrabold rounded-md">INTERNO</span>}
                      </div>
                    </div>

                    {/* Centro logístico */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Centro Logístico</p>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <div>
                          <p className="text-sm font-bold text-slate-800">{selectedEj.centro}</p>
                          <p className="text-[11px] text-primary font-bold">{getShopFromCenter(selectedEj.centro)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Fecha revisión */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha Revisión</p>
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm font-bold text-slate-800">{selectedEj.fecha_procesado}</span>
                      </div>
                    </div>

                    {/* Análisis IA */}
                    <div className="space-y-1.5 p-3 bg-white rounded-xl border border-slate-200">
                      <div className="flex items-center gap-1.5 text-primary">
                        <Info className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Análisis IA</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        {selectedEj.razon || "Evaluación automática por sistema de reglas y auditoría de tiempos SLA."}
                      </p>
                    </div>
                  </div>

                  {/* RIGHT — historial de bultos */}
                  <div className="flex flex-col flex-1 min-h-0 px-5 py-5 overflow-hidden">
                    <div className="flex items-center gap-2 mb-4 shrink-0">
                      <History className="h-4 w-4 text-slate-700" />
                      <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">Historial de Bultos</h3>
                      {bultos.length > 1 && (
                        <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary font-bold rounded-full">
                          {bultos.length} bultos
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-h-0">
                      <BultoHistorialView bultos={bultos} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </>
  );
}
