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
import { Incidencia } from "@/lib/types";
import { 
  ExternalLink, 
  History, 
  Info, 
  Mail, 
  Store, 
  MapPin, 
  User,
  AlertCircle
} from "lucide-react";
import { 
  getShopFromCenter, 
  getStatusLabel, 
  getActiveHours, 
  cleanTracking 
} from "@/lib/status-map";

interface Props {
  incidencias: Incidencia[];
}

export function IncidenciasTable({ incidencias }: Props) {
  const [selectedInc, setSelectedInc] = useState<Incidencia | null>(null);

  function formatHistory(history?: string) {
    if (!history) return <p className="text-muted-foreground italic">No hay historial disponible.</p>;
    const events = history.split(/(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    return (
      <div className="space-y-4 pt-2">
        {events.map((event, i) => (
          <div key={i} className="flex gap-4 border-l-2 border-slate-100 pl-4 py-1 hover:border-primary/50 transition-colors">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-950 whitespace-nowrap">{event.substring(0, 16)}</span>
              <span className="text-sm font-semibold text-slate-950 leading-snug">{event.substring(18)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderStatusBadge(code: string, dano: boolean) {
    const label = getStatusLabel(code);
    
    if (dano) {
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

    if (isError) {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-600 border-red-100 px-3 py-1 font-semibold shadow-none">
          {label}
        </Badge>
      );
    }

    if (isSuccess) {
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 px-3 py-1 font-semibold shadow-none">
          {label}
        </Badge>
      );
    }

    if (isWarning) {
      return (
        <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-100 px-3 py-1 font-semibold shadow-none">
          {label}
        </Badge>
      );
    }
    
    return (
      <Badge variant="secondary" className="bg-slate-50 text-slate-600 border-slate-100 px-3 py-1 font-medium shadow-none">
        {label}
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
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px]">Estado Actual</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px]">Notificación</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px] text-right">Tiempo Activo</TableHead>
                <TableHead className="py-6 font-bold text-slate-950 uppercase tracking-wider text-[11px] text-right">Fecha Revisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidencias.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-400 py-24">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-10 w-10 opacity-20" />
                      <p className="text-lg font-medium">No se han encontrado incidencias</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {incidencias.map((inc) => {
                const cleanedCode = cleanTracking(inc.numero_envio);
                const timing = getActiveHours(inc);

                return (
                  <TableRow 
                    key={inc.id} 
                    className={`group cursor-pointer hover:bg-slate-50 transition-colors border-b last:border-0 ${inc.dano ? "bg-red-50/20" : ""}`}
                    onClick={() => setSelectedInc(inc)}
                  >
                    <TableCell className="py-6 px-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-950">{cleanedCode}</span>
                        <a 
                          href={`https://www.cttexpress.com/localizador-de-envios/?sc=${cleanedCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="py-6">
                      <span className="text-sm font-bold text-slate-950">{inc.numero_pedido}</span>
                    </TableCell>
                    <TableCell className="py-6">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-slate-950" />
                        <span className="text-sm font-bold text-slate-950">{inc.tienda}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6">{renderStatusBadge(inc.incidencia, inc.dano)}</TableCell>
                    <TableCell className="py-6">
                      <div className="flex flex-col gap-0.5">
                         <div className="flex items-center gap-1.5 text-xs font-bold text-slate-950">
                            <Mail className="h-3 w-3 text-blue-600" />
                            {inc.destinatario || "Sin nombre"}
                         </div>
                        <span className="text-[9px] font-bold text-primary uppercase tracking-tight">
                          {(inc.tipo_email || "").toLowerCase().includes("internal") || inc.forzado_interno ? "alertas@sergi.com" : "Draft CTT"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 text-right">
                      {timing.hours > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold ${timing.hours > 24 ? "text-red-700" : "text-slate-950"}`}>
                            {timing.hours}h
                          </span>
                          <span className="text-[10px] uppercase font-bold text-slate-950 tracking-tighter">{timing.label}</span>
                        </div>
                      ) : (
                        <span className="text-slate-950">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-6 text-right">
                      <span className="text-[11px] font-bold text-slate-950">{inc.fecha_procesado}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={!!selectedInc} onOpenChange={(open) => !open && setSelectedInc(null)}>
        <SheetContent className="w-full sm:!max-w-[80vw] overflow-y-auto !transition-all">
          {selectedInc && (
            <div className="space-y-8 pt-6 px-4">
              <SheetHeader className="text-left">
                <SheetTitle className="text-xl md:text-3xl font-extrabold break-all leading-tight flex items-center gap-3">
                  <AlertCircle className="h-6 w-6 text-primary shrink-0" />
                  Envío <span className="text-primary">{cleanTracking(selectedInc.numero_envio)}</span>
                  <a 
                    href={`https://www.cttexpress.com/localizador-de-envios/?sc=${cleanTracking(selectedInc.numero_envio)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 transition-opacity"
                  >
                    <ExternalLink className="h-6 w-6" />
                  </a>
                </SheetTitle>
                <SheetDescription className="text-base font-bold text-slate-950">
                  Incidencia de Pedido {selectedInc.numero_pedido} &middot; {selectedInc.tienda}
                </SheetDescription>
              </SheetHeader>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-8 py-2 border-y border-slate-100 py-6">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-950 uppercase tracking-wider">Gravedad</p>
                  <div className="flex">{renderStatusBadge(selectedInc.incidencia, selectedInc.dano)}</div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-950 uppercase tracking-wider">Notificación</p>
                  <p className="text-sm font-bold text-slate-950">
                    {(selectedInc.tipo_email || "").toLowerCase().includes("internal") || selectedInc.forzado_interno ? "Alerta Interna" : "Draft CTT"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-950 uppercase tracking-wider">Tiempo Abierto</p>
                  <p className="text-sm font-bold text-slate-950">{getActiveHours(selectedInc).hours}h</p>
                </div>
              </div>

              <div className="space-y-3 p-6 bg-slate-50 rounded-xl border">
                <div className="flex items-center gap-2 text-primary">
                  <Info className="h-4 w-4" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Justificación Auditoría</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed font-medium italic">
                  &ldquo;{selectedInc.razon}&rdquo;
                </p>
              </div>

              <div className="grid grid-cols-2 gap-12">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-950">
                    <MapPin className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Centro Logístico</span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-950">{selectedInc.centro}</p>
                    <p className="text-xs text-primary font-bold">{getShopFromCenter(selectedInc.centro)}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-950">
                    <User className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Destinatario Alerta</span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-950 truncate">{selectedInc.destinatario || "—"}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-950 font-bold">Avisos:</span>
                      <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-900 font-extrabold rounded-md uppercase border border-blue-200">
                        {selectedInc.numero_avisos} Enviados
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-2 text-slate-950">
                  <History className="h-5 w-5" />
                  <h3 className="text-sm font-extrabold uppercase tracking-wider">Historial Completo</h3>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="max-h-[350px] overflow-y-auto p-6 bg-white custom-scrollbar">
                    {formatHistory(selectedInc.historial_formateado)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
