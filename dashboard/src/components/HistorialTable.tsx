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
import { Historial } from "@/lib/types";
import { 
  History, 
  Cpu, 
  FileText, 
  ExternalLink
} from "lucide-react";
import { cleanTracking } from "@/lib/status-map";

interface Props {
  historial: Historial[];
}

export function HistorialTable({ historial }: Props) {
  const [selectedHist, setSelectedHist] = useState<Historial | null>(null);

  return (
    <>
      <div className="rounded-2xl border bg-white shadow-sm overflow-x-auto custom-scrollbar">
        <div className="min-w-[1000px] w-full">
          <Table>
            <TableHeader className="bg-slate-50 border-b">
              <TableRow className="hover:bg-transparent">
                <TableHead className="py-5 px-6 font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Fecha / Hora</TableHead>
                <TableHead className="py-5 font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Envío</TableHead>
                <TableHead className="py-5 font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Pedido</TableHead>
                <TableHead className="py-5 font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Tienda</TableHead>
                <TableHead className="py-5 font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Tipo Notif.</TableHead>
                <TableHead className="py-5 font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Destinatario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-24">
                    <div className="flex flex-col items-center gap-2">
                      <History className="h-10 w-10 opacity-20" />
                      <p className="text-lg font-medium">El Log de Auditoría IA está vacío</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {historial.map((h) => {
                const cleanedCode = cleanTracking(h.numero_envio);
                return (
                  <TableRow 
                    key={h.id} 
                    className="group cursor-pointer hover:bg-slate-50 transition-colors border-b last:border-0"
                    onClick={() => setSelectedHist(h)}
                  >
                    <TableCell className="py-5 px-6">
                      <span className="text-xs font-semibold text-slate-400">{h.fecha}</span>
                    </TableCell>
                    <TableCell className="py-5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">{cleanedCode}</span>
                        <a 
                          href={`https://www.cttexpress.com/localizador-de-envios/?sc=${cleanedCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="py-5">
                      <span className="text-sm font-medium text-slate-500">{h.numero_pedido}</span>
                    </TableCell>
                    <TableCell className="py-5">
                      <Badge variant="outline" className="font-semibold border-slate-200">{h.tienda}</Badge>
                    </TableCell>
                    <TableCell className="py-5">
                      <span className="text-xs font-bold uppercase text-slate-400">{h.tipo_email || "—"}</span>
                    </TableCell>
                    <TableCell className="py-5">
                      <span className="text-sm font-medium text-slate-600 truncate max-w-[150px] inline-block" title={h.email_destinatario}>
                        {h.email_destinatario || "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={!!selectedHist} onOpenChange={(open) => !open && setSelectedHist(null)}>
        <SheetContent className="sm:max-w-[800px] overflow-y-auto p-0 border-l shadow-2xl">
          {selectedHist && (
            <div className="flex flex-col h-full bg-white">
              <SheetHeader className="p-8 bg-slate-900 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Cpu className="h-6 w-6 text-primary" />
                  <SheetTitle className="text-2xl font-bold tracking-tight text-white uppercase italic">Traza Bruta IA</SheetTitle>
                </div>
                <SheetDescription className="text-slate-400 font-medium text-base">
                  Auditoría completa para envío #{cleanTracking(selectedHist.numero_envio)}
                </SheetDescription>
              </SheetHeader>
              
              <div className="p-8 space-y-10">
                {/* Context Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <FileText className="h-5 w-5" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">Contexto Enviado</h3>
                  </div>
                  <div className="bg-slate-50 border rounded-2xl shadow-sm overflow-hidden p-6">
                    <pre className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {selectedHist.contexto}
                    </pre>
                  </div>
                </div>

                {/* AI Output Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Cpu className="h-5 w-5" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">Respuesta en Bruto</h3>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
                    <pre className="text-sm text-emerald-400 leading-relaxed whitespace-pre-wrap">
                      {selectedHist.ia_output}
                    </pre>
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
