"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Ejecucion as BaseEjecucion } from "@/lib/types";

// Unified type for merged display
interface Ejecucion extends BaseEjecucion {
  _collection?: 'ejecuciones' | 'incidencias' | 'trazabilidad_ejecuciones';
  fase_salida?: string;
  ejecucion_id?: string;
  ai_justification?: string;
  estado_final?: string;
  numero_avisos?: number;
}
import {
  ExternalLink,
  History,
  Info,
  Mail,
  Store,
  MapPin,
  User,
  CheckCircle2,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  FileEdit,
  Package,
  Clock,
  CalendarClock,
  ArrowDown,
  ArrowUp,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  RefreshCcw,
  Loader2,
  Send,
} from "lucide-react";
import {
  getShopFromCenter,
  getStatusLabel,
  getActiveHours,
  cleanTracking,
  getStatusTheme,
  getClientCode,
} from "@/lib/status-map";

interface BultoHistorial {
  item_code: string;
  formatted_history: string;
  total_events: number;
}

interface Props {
  ejecuciones: Ejecucion[];
  sortOrder: "desc" | "asc";
  refreshSingleItem?: (id: string, col: "ejecuciones" | "incidencias") => Promise<any>;
  /** Pedido leído manualmente para abrir el panel lateral desde fuera. */
  injected?: Ejecucion | null;
  onClearInjected?: () => void;
}

const TERMINAL_CODES = ["2500", "2300", "2310", "3000"];
const PAGE_SIZE = 50;

/** Devuelve { fecha: "dd-mm-yyyy", hora: "HH:mm" } a partir del string almacenado. */
function splitFecha(f?: string): { fecha: string; hora: string } {
  if (!f) return { fecha: "—", hora: "" };
  const s = String(f).replace(/\(.*?\)/g, "").trim();
  const [datePart, timePart = ""] = s.split(" ");
  const seg = datePart.split("-");
  let fecha = datePart;
  if (seg.length === 3) {
    fecha = seg[0].length === 4 ? `${seg[2]}-${seg[1]}-${seg[0]}` : datePart; // yyyy-mm-dd → dd-mm-yyyy
  }
  return { fecha, hora: timePart.substring(0, 5) };
}

function parseBultos(bultos_historial_json?: string, historial_formateado?: string): BultoHistorial[] {
  if (bultos_historial_json) {
    try {
      const parsed = JSON.parse(bultos_historial_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => ({
          item_code: item.item_code || "Unknown",
          formatted_history: item.history || item.formatted_history || "",
          total_events: item.total_events || 0
        }));
      }
    } catch { /* fall through */ }
  }
  return historial_formateado
    ? [{ item_code: "bulto_1", formatted_history: historial_formateado, total_events: 0 }]
    : [];
}

function extractPuntoNombre(item: Ejecucion): string | null {
  const rawHistory = (() => {
    if (item.bultos_historial_json) {
      try {
        const parsed = JSON.parse(item.bultos_historial_json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return String(parsed[0].history || parsed[0].formatted_history || "");
        }
      } catch { /* fall through */ }
    }
    return String(item.historial_formateado || "");
  })();

  const eventStr = rawHistory.replace(/^Item:\s*\S+\s*/, '');
  const events = eventStr.trim().split(/(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);

  for (const event of events) {
    if (/\[(2300|2310)\]/.test(event)) {
      const afterCode = event.replace(/^.*\[(2300|2310)\]\s*/, '').trim();
      return afterCode.replace(/^Punto CTT\s*[-–]\s*/i, '').trim() || null;
    }
  }
  return null;
}

function formatEvents(history: any) {
  const h = String(history || "");
  if (!h) return <p className="text-muted-foreground italic text-sm">Sin eventos disponibles.</p>;
  
  // Limpiar el inicio
  const eventString = h.replace(/^Item:\s*\S+\s*/, '');
  const events = eventString.trim().split(/(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
  
  return (
    <div className="relative pt-4 pb-6 space-y-3 before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px before:w-0.5 before:bg-slate-200 before:rounded-full">
      {events.filter(Boolean).map((event, i) => {
        const str = event.trim();
        const dateMatch = str.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
        const dateStr = dateMatch ? dateMatch[1] : "";
        
        let desc = str.substring(dateStr.length).replace(/^ \| /, '').trim();
        
        const codeMatch = desc.match(/^\[([A-Za-z0-9_]+)\]/);
        let finalTitle = "";
        let code = "";
        if (codeMatch) {
          code = codeMatch[1];
          desc = desc.replace(codeMatch[0], '').trim();
          finalTitle = getStatusLabel(code);
          
          // Remove redundant label name from description
          const labelLower = finalTitle.toLowerCase();
          if (desc.toLowerCase().startsWith(labelLower)) {
            desc = desc.substring(labelLower.length).trim();
            if (desc.startsWith('-')) {
              desc = desc.substring(1).trim();
            }
          }
        } else {
          finalTitle = desc.split(' - ')[0] || "Evento";
        }
        
        desc = desc.replace(/^- /, '').trim();
        const isLast = i === events.filter(Boolean).length - 1;
        const theme = code ? getStatusTheme(code) : getStatusTheme("");
        
        return (
          <div key={i} className="relative flex items-center gap-4 group py-0.5">
            <div className={`flex items-center justify-center w-5 h-5 rounded-full border-[3px] border-white z-10 shrink-0 ${theme.dot} shadow-sm group-hover:scale-125 transition-transform`} />
            
            <div className={`flex-1 flex items-center justify-between gap-3 p-2.5 rounded-xl border ${theme.bg} ${theme.border} ${isLast ? "shadow-md ring-1 ring-primary/20 scale-[1.01]" : "shadow-sm"} transition-all`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-extrabold uppercase tracking-tight ${theme.text}`}>
                   {finalTitle}
                </span>
                {desc && (
                  <span className="text-[11px] text-slate-600 font-medium">
                    &bull; {desc}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold text-slate-900 bg-white/80 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                 {dateStr ? `${dateStr.substring(8, 10)}-${dateStr.substring(5, 7)}-${dateStr.substring(2, 4)} ${dateStr.substring(11, 16)}` : ""}
              </span>
            </div>
          </div>
        );
      })}
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

export function EjecucionesTable({ ejecuciones, sortOrder, refreshSingleItem, injected, onClearInjected }: Props) {
  const [selectedEj, setSelectedEj] = useState<Ejecucion | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Abrir el Sheet cuando llega un pedido leído manualmente desde fuera.
  useEffect(() => {
    if (injected) setSelectedEj(injected);
  }, [injected]);

  const handleRefresh = async (item: Ejecucion) => {
    try {
      setIsRefreshing(true);
      const isTestCollection = item._collection && item._collection.includes('_test');

      let res;
      if (isTestCollection) {
        res = await fetch("/api/test/refresh-tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipping_code: item.numero_envio,
            client_code: getClientCode(item.credencial)
          })
        });
      } else {
        const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || "https://n8n.ctt-lastmile.com/webhook/refresh-tracking";
        res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipping_code: item.numero_envio,
            client_code: getClientCode(item.credencial),
            collection: item._collection || 'ejecuciones',
            doc_id: item.id
          })
        });
      }
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP status ${res.status}`);
      }
      
      if (refreshSingleItem && item._collection !== 'trazabilidad_ejecuciones') {
        const updated = await refreshSingleItem(item.id, item._collection as "ejecuciones" | "incidencias");
        if (updated) {
          setSelectedEj(updated);
        }
      }
      alert("✅ Historial actualizado");
    } catch (error: any) {
      console.error("Manual refresh error:", error);
      alert(`Error al actualizar el historial: ${error.message || error}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when data changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [ejecuciones, sortOrder]);

  // Infinite scroll
  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting) {
      setVisibleCount(prev => prev + PAGE_SIZE);
    }
  }, []);

  const [isUpdating, setIsUpdating] = useState(false);
  const [sendingDraft, setSendingDraft] = useState(false);

  const handleSendDraft = async (item: Ejecucion) => {
    setSendingDraft(true);
    try {
      const sendDraftUrl = process.env.NEXT_PUBLIC_N8N_SEND_DRAFT_URL || "https://haminos-ecom-n8n.5pbmxd.easypanel.host/webhook/send-draft";
      await fetch(sendDraftUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_envio: item.numero_envio,
          tienda: item.tienda,
          asunto: item.asunto || item.email_subject || "",
          cuerpo: item.cuerpo || item.email_body || "",
          destinatario: item.destinatario,
        }),
      });
      const collectionName = item._collection || 'ejecuciones';
      const docRef = doc(db, collectionName, item.id);
      await updateDoc(docRef, { draft_enviado: true, draft_sent_at: new Date().toISOString() });
      if (selectedEj && selectedEj.id === item.id) {
        setSelectedEj({ ...selectedEj, draft_enviado: true });
      }
    } catch (error) {
      console.error("Error sending draft:", error);
      alert("Error al enviar el email.");
    } finally {
      setSendingDraft(false);
    }
  };

  const handleUpdateStatus = async (item: Ejecucion, ok: boolean) => {
    try {
      setIsUpdating(true);
      const collectionName = item._collection || 'ejecuciones';
      const docRef = doc(db, collectionName, item.id);
      await updateDoc(docRef, { isEjecucionOk: ok });
      if (selectedEj && selectedEj.id === item.id) {
        setSelectedEj({ ...selectedEj, isEjecucionOk: ok });
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const sorted = sortOrder === "desc" ? ejecuciones : [...ejecuciones].reverse();
  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect, hasMore]);

  function renderStatusBadge(rawCode: string, dano: boolean) {
    const code = String(rawCode || "").replace(/^"+|"+$/g, "").trim();
    const label = getStatusLabel(code);
    const theme = getStatusTheme(code);
    const isTerminal = TERMINAL_CODES.includes(code);

    if (!isTerminal && dano) {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 px-2.5 py-0.5 font-bold gap-1 shadow-none text-xs">
          <AlertCircle className="h-3 w-3" />
          Daño Detectado
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className={`${theme.bg} ${theme.text} ${theme.border} px-2.5 py-0.5 font-bold shadow-none text-xs`}>
        {label}
      </Badge>
    );
  }

  function renderTypeBadge(type?: string, forced?: boolean) {
    const t = String(type || "").toLowerCase();
    if (t === "none") return null;
    if (t.includes("internal") || forced) {
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 gap-1.5 font-medium px-2 shadow-none text-xs">
          <ShieldCheck className="h-3 w-3" />
          Interno
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 gap-1.5 font-medium px-2 shadow-none text-xs">
        <FileEdit className="h-3 w-3" />
        Draft CTT
      </Badge>
    );
  }

  function renderTrazabilidadBadge(fase: string) {
    const f = String(fase || "").toLowerCase();
    switch (f) {
      case 'notified':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-2.5 py-0.5 font-bold shadow-none text-xs">Notificado</Badge>;
      case 'ai_no_notify':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-2.5 py-0.5 font-bold shadow-none text-xs">IA: No Notificar</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 px-2.5 py-0.5 font-bold shadow-none text-xs">Error</Badge>;
      case 'skipped_processed_today':
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 px-2.5 py-0.5 font-bold shadow-none text-xs">Ya Procesado (Hoy)</Badge>;
      case 'skipped_all_terminal_bultos':
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 px-2.5 py-0.5 font-bold shadow-none text-xs">Bultos Terminales</Badge>;
      default:
        return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 px-2.5 py-0.5 font-bold shadow-none text-xs">{fase}</Badge>;
    }
  }

  return (
    <>
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        {/* Table toolbar */}
        <div className="flex items-center px-5 py-2.5 border-b bg-slate-50/60">
          <span className="text-xs font-semibold text-slate-400">
            {ejecuciones.length === 0 ? "Sin registros" : `${visible.length} de ${ejecuciones.length} ejecuciones`}
          </span>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[960px] w-full">
            <Table>
              <TableHeader className="bg-slate-50 border-b">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="py-3 px-5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Fecha</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Envío / Tracking</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Pedido</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Tienda</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Estado</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Canal</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-slate-500 uppercase tracking-wider text-[10px] text-right">T. Activo</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Notificado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ejecuciones.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-slate-400 py-20">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-9 w-9 opacity-20" />
                        <p className="text-sm font-medium">No hay ejecuciones registradas</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((ej) => {
                  const isTrace = ej._collection === 'trazabilidad_ejecuciones';
                  const cleanedCode = cleanTracking(ej.numero_envio);
                  const timing = getActiveHours(ej);
                  const f = splitFecha(ej.fecha_procesado);
                  return (
                    <TableRow
                      key={`${ej._collection}-${ej.id}`}
                      className="group cursor-pointer hover:bg-slate-50/80 transition-colors border-b last:border-0"
                      onClick={() => setSelectedEj(ej)}
                    >
                      <TableCell className="py-3.5 px-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-800 tabular-nums">{f.fecha}</span>
                          {f.hora && <span className="text-[10px] font-medium text-slate-400 tabular-nums">{f.hora}</span>}
                        </div>
                      </TableCell>
                       <TableCell className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          {!isTrace && (
                            <>
                              {ej.isEjecucionOk === true && (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                              )}
                              {ej.isEjecucionOk === false && (
                                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                              )}
                              {ej.isEjecucionOk === undefined && (
                                <div className="h-4 w-4 rounded-full border border-slate-200 border-dashed shrink-0" />
                              )}
                            </>
                          )}
                          <span className="text-sm font-bold text-slate-900">{cleanedCode}</span>
                          <a
                            href={`https://www.cttexpress.com/localizador-de-envios/?sc=${cleanedCode}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 px-3">
                        <span className="text-sm text-slate-700 font-medium">{ej.numero_pedido || "—"}</span>
                      </TableCell>
                      <TableCell className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <Store className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-sm font-semibold text-slate-800">{ej.tienda}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 px-3">
                        {isTrace ? renderTrazabilidadBadge(ej.fase_salida || "") : renderStatusBadge(ej.estado, ej.dano)}
                      </TableCell>
                      <TableCell className="py-3.5 px-3">
                        {isTrace ? (
                          <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50 gap-1.5 font-medium px-2 shadow-none text-xs font-bold">
                            Trazabilidad
                          </Badge>
                        ) : renderTypeBadge(ej.tipo_email, ej.forzado_interno)}
                      </TableCell>
                      <TableCell className="py-3.5 px-3 text-right">
                        {!isTrace && timing.hours > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className={`text-sm font-bold ${timing.hours > 24 ? "text-red-600" : "text-slate-800"}`}>{timing.hours}h</span>
                            <span className="text-[9px] uppercase font-semibold text-slate-400 tracking-tight">{timing.label}</span>
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="py-3.5 px-3">
                        {isTrace ? (
                          ej.fase_salida === 'notified' ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                <Mail className="h-3 w-3 text-blue-500 shrink-0" />
                                {ej.destinatario || "Sin nombre"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 truncate max-w-[150px] font-medium block" title={ej.razon}>{ej.razon}</span>
                          )
                        ) : ej.email_enviado ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                              <Mail className="h-3 w-3 text-blue-500 shrink-0" />
                              {ej.destinatario || "Sin nombre"}
                            </div>
                            <span className="text-[9px] font-bold text-primary uppercase tracking-tight">
                              {String(ej.tipo_email || "").toLowerCase().includes("internal") || ej.forzado_interno ? "Alerta Interna" : "Draft CTT"}
                            </span>
                          </div>
                        ) : <span className="text-slate-300 text-sm">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className="py-4 flex justify-center">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Cargando más...
            </div>
          </div>
        )}
        {!hasMore && ejecuciones.length > PAGE_SIZE && (
          <div className="py-3 text-center text-xs text-slate-300 font-medium border-t">
            — {ejecuciones.length} registros totales —
          </div>
        )}
      </div>

      <Sheet open={!!selectedEj} onOpenChange={(open) => { if (!open) { setSelectedEj(null); onClearInjected?.(); } }}>
        <SheetContent className="w-full sm:!max-w-[90vw] overflow-hidden flex flex-col !transition-all p-0">
          {selectedEj && (() => {
            const bultos = parseBultos(selectedEj.bultos_historial_json, selectedEj.historial_formateado);
            const timing = getActiveHours(selectedEj);
            const cleanedCode = cleanTracking(selectedEj.numero_envio);
            const isInternal = String(selectedEj.tipo_email || "").toLowerCase().includes("internal") || selectedEj.forzado_interno;

            return (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
                  <SheetHeader className="text-left">
                    <SheetTitle className="text-xl font-extrabold break-all leading-tight flex items-center gap-2">
                      <span className="text-slate-500 font-medium text-base">
                        {selectedEj._collection === 'incidencias' ? 'Incidencia' : (selectedEj._collection === 'trazabilidad_ejecuciones' ? 'Trazabilidad' : 'Envío')}
                      </span>
                      <span className="text-primary">{cleanedCode}</span>
                      <a href={`https://www.cttexpress.com/localizador-de-envios/?sc=${cleanedCode}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-opacity">
                        <ExternalLink className="h-5 w-5" />
                      </a>
                    </SheetTitle>
                    <SheetDescription className="text-sm font-bold text-slate-600">
                      {selectedEj.numero_pedido || "—"} &middot; {selectedEj.tienda}
                    </SheetDescription>
                  </SheetHeader>
                </div>

                {/* Body */}
                {selectedEj._collection === 'trazabilidad_ejecuciones' ? (
                  <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-slate-50/40">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-2xl border shadow-sm">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-black uppercase tracking-wider">Fase de Salida</p>
                        {renderTrazabilidadBadge(selectedEj.fase_salida || "")}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-black uppercase tracking-wider">Run ID (Ejecución n8n)</p>
                        <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded border text-slate-600 block w-fit font-medium">{selectedEj.ejecucion_id}</span>
                      </div>

                      <div className="space-y-1.5 col-span-2">
                        <p className="text-[10px] font-bold text-black uppercase tracking-wider">Razón de Salida</p>
                        <p className="text-xs text-slate-700 bg-slate-50/50 p-4 rounded-xl border font-medium leading-relaxed">
                          {selectedEj.razon}
                        </p>
                      </div>

                      {selectedEj.ai_justification && (
                        <div className="space-y-1.5 col-span-2">
                          <p className="text-[10px] font-bold text-black uppercase tracking-wider">Justificación de la IA</p>
                          <p className="text-xs text-slate-700 bg-slate-50/50 p-4 rounded-xl border font-medium leading-relaxed">
                            {selectedEj.ai_justification}
                          </p>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-black uppercase tracking-wider">Estado Final CTT</p>
                        <span className="text-xs font-bold text-slate-800 bg-slate-100/70 px-2.5 py-1 rounded border block w-fit">{selectedEj.estado_final || "—"}</span>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-black uppercase tracking-wider">Número de Avisos</p>
                        <span className="text-xs font-bold text-slate-800 bg-slate-100/70 px-2.5 py-1 rounded border block w-fit">{selectedEj.numero_avisos ?? 0}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col md:grid md:grid-cols-2 flex-1 min-h-0 overflow-hidden">

                    {/* LEFT — metadata */}
                    <div className="md:border-r border-slate-100 px-5 py-5 space-y-5 overflow-y-auto md:overflow-y-auto custom-scrollbar shrink-0 md:shrink bg-slate-50/40">

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-black uppercase tracking-wider">Estado Actual</p>
                      {renderStatusBadge(selectedEj.estado, selectedEj.dano)}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-black uppercase tracking-wider">Canal Notificación</p>
                      {renderTypeBadge(selectedEj.tipo_email, selectedEj.forzado_interno)}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-black uppercase tracking-wider">Destinatario</p>
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

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-black uppercase tracking-wider">Centro Logístico</p>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <div>
                          <p className="text-sm font-bold text-slate-800">{selectedEj.centro}</p>
                          <p className="text-[11px] text-primary font-bold">{getShopFromCenter(selectedEj.centro)}</p>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const puntoNombre = extractPuntoNombre(selectedEj);
                      if (!puntoNombre) return null;
                      return (
                        <div className="flex items-start gap-2.5 p-3 bg-blue-50 rounded-xl border border-blue-200">
                          <MapPin className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-0.5">Punto CTT</p>
                            <p className="text-sm font-bold text-blue-900">{puntoNombre}</p>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-black uppercase tracking-wider">Validación de Auditoría</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(selectedEj, true)}
                          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-bold transition-all border ${
                            selectedEj.isEjecucionOk === true
                               ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                               : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-600"
                           }`}
                         >
                           <ThumbsUp className="h-3 w-3" />
                           ES CORRECTO
                         </button>
                         <button
                           disabled={isUpdating}
                           onClick={() => handleUpdateStatus(selectedEj, false)}
                           className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-bold transition-all border ${
                             selectedEj.isEjecucionOk === false
                               ? "bg-red-500 text-white border-red-500 shadow-sm"
                               : "bg-white text-slate-600 border-slate-200 hover:border-red-300 hover:text-red-600"
                           }`}
                         >
                           <ThumbsDown className="h-3 w-3" />
                           ANÁLISIS ERROR
                         </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-black uppercase tracking-wider">Fecha Revisión</p>
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm font-bold text-slate-800">{selectedEj.fecha_procesado}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 p-3 bg-white rounded-xl border border-slate-200">
                      <div className="flex items-center gap-1.5 text-primary">
                        <Info className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Análisis IA</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        {selectedEj.razon || "Evaluación automática por sistema de reglas y auditoría de tiempos SLA."}
                      </p>
                    </div>

                    {(() => {
                      const asuntoText = selectedEj.asunto || selectedEj.email_subject || "";
                      const cuerpoText = selectedEj.cuerpo || selectedEj.email_body || "";
                      
                      const hasContent = !!(asuntoText || cuerpoText);
                      
                      return (
                        <div className="space-y-2.5 p-3 bg-blue-50/50 rounded-xl border border-blue-100 mt-2">
                          <div className="flex items-center gap-1.5 text-blue-600">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Detalles del Email / Alerta</span>
                          </div>
                          {!hasContent ? (
                            <p className="text-xl text-slate-300 font-medium">—</p>
                          ) : (
                            <>
                              {asuntoText && (
                                <div className="space-y-1">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Asunto</p>
                                  <p className="text-xs font-bold text-slate-800 leading-snug">{asuntoText}</p>
                                </div>
                              )}
                              {cuerpoText && (
                                <div className="space-y-1">
                                  <p className="text-[9px] font-bold text-black uppercase tracking-tight">Cuerpo</p>
                                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                                    {cuerpoText}
                                  </p>
                                </div>
                              )}
                              {String(selectedEj.tipo_email || "").toLowerCase() === "standard" && (
                                <div className="pt-2 border-t border-blue-100">
                                  {selectedEj.draft_enviado ? (
                                    <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-bold">
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      Email enviado correctamente
                                    </div>
                                  ) : (
                                    <button
                                      disabled={sendingDraft}
                                      onClick={() => handleSendDraft(selectedEj)}
                                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold transition-all border w-full justify-center ${
                                        sendingDraft
                                          ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                          : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm active:scale-95"
                                      }`}
                                    >
                                      {sendingDraft ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Send className="h-3.5 w-3.5" />
                                      )}
                                      {sendingDraft ? "Enviando..." : "Enviar Email (Draft → Enviado)"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* RIGHT — historial de bultos */}
                  <div className="flex flex-col flex-1 min-h-0 px-5 py-5 overflow-hidden">
                    <div className="flex items-center gap-2 mb-4 shrink-0">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-slate-700" />
                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">Historial de Bultos</h3>
                        {bultos.length > 1 && (
                          <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary font-bold rounded-full">
                            {bultos.length} bultos
                          </span>
                        )}
                      </div>
                      <button
                        disabled={isRefreshing}
                        onClick={() => handleRefresh(selectedEj)}
                        className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight transition-all ${
                          isRefreshing 
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                            : "bg-primary text-white hover:bg-primary/90 shadow-sm active:scale-95"
                        }`}
                      >
                        {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                        {isRefreshing ? "Actualizando" : "Actualizar"}
                      </button>
                    </div>
                    <div className="flex-1 min-h-0">
                      <BultoHistorialView bultos={bultos} />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
          })()}
        </SheetContent>
      </Sheet>
    </>
  );
}
