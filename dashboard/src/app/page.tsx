"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, limit, doc, getDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Ejecucion, Incidencia } from "@/lib/types";
import { EjecucionesTable } from "@/components/EjecucionesTable";
import { ConfigDialog } from "@/components/ConfigDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, FilterX, LogOut, Search, SlidersHorizontal, ArrowDownUp, Plus, Loader2, Settings, ChevronDown } from "lucide-react";
import { SHOP_NAMES, getStatusLabel, getStatusTheme, STATUS_FILTER_OPTIONS, getClientCode } from "@/lib/status-map";

export default function Dashboard() {
  const { state, logout } = useAuth();
  const router = useRouter();
  
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [trazabilidad, setTrazabilidad] = useState<any[]>([]);
  
  // Filters
  const [tiendaFiltro, setTiendaFiltro] = useState("TODAS");
  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");
  const [emailFiltro, setEmailFiltro] = useState("TODOS");
  const [tipoFiltro, setTipoFiltro] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [mostrarSoloIncidencias, setMostrarSoloIncidencias] = useState(false);
  const [loading, setLoading] = useState(true);

  // Onboard tracking state
  const [nuevoEnvio, setNuevoEnvio] = useState("");
  const [nuevaTienda, setNuevaTienda] = useState("");
  const [addingEnvio, setAddingEnvio] = useState(false);

  // Lectura manual (consultar un pedido que no está en la lista)
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manualItem, setManualItem] = useState<any>(null);

  // Menú de usuario + diálogo de configuración
  const [configOpen, setConfigOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);


  useEffect(() => {
    if (state.status === "unauthenticated" || state.status === "unauthorized") {
      router.replace("/login");
    }
  }, [state, router]);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    async function load() {
      setLoading(true);
      try {
        const ejColl = "ejecuciones";
        const incColl = "incidencias";
        const trazColl = "trazabilidad_ejecuciones";
        const [ejSnap, incSnap, trazSnap] = await Promise.all([
          getDocs(query(collection(db, ejColl), orderBy("fecha_procesado", "desc"), limit(6000))),
          getDocs(query(collection(db, incColl), orderBy("fecha_procesado", "desc"), limit(6000))),
          getDocs(query(collection(db, trazColl), orderBy("fecha", "desc"), limit(6000))),
        ]);
        setEjecuciones(ejSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            numero_envio: data.numero_envio || data.shipping_code || d.id,
            fecha_procesado: data.fecha_procesado?.toDate?.() ? new Date(data.fecha_procesado.toDate()).toISOString().replace('T', ' ').substring(0, 19) : data.fecha_procesado
          } as Ejecucion;
        }));
        setIncidencias(incSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            numero_envio: data.numero_envio || data.shipping_code || d.id,
            fecha_procesado: data.fecha_procesado?.toDate?.() ? new Date(data.fecha_procesado.toDate()).toISOString().replace('T', ' ').substring(0, 19) : data.fecha_procesado
          } as Incidencia;
        }));
        setTrazabilidad(trazSnap.docs.map((d) => {
          const data = d.data();
          const fechaStr = data.fecha?.toDate?.() 
            ? new Date(data.fecha.toDate()).toISOString().replace('T', ' ').substring(0, 19) 
            : (data.fecha ? new Date(data.fecha).toISOString().replace('T', ' ').substring(0, 19) : "");
          return {
            id: d.id,
            ...data,
            numero_envio: data.shipping_code || "",
            numero_pedido: data.numero_pedido || "",
            fecha_procesado: fechaStr,
          };
        }));
      } catch (e) {
        console.error("Error loading Firestore data:", e);
      }
      setLoading(false);
    }
    load();
  }, [state]);

  const refreshData = async () => {
    if (state.status !== "authenticated") return;
    setLoading(true);
    try {
      const ejColl = "ejecuciones";
      const incColl = "incidencias";
      const trazColl = "trazabilidad_ejecuciones";
      const [ejSnap, incSnap, trazSnap] = await Promise.all([
        getDocs(query(collection(db, ejColl), orderBy("fecha_procesado", "desc"), limit(6000))),
        getDocs(query(collection(db, incColl), orderBy("fecha_procesado", "desc"), limit(6000))),
        getDocs(query(collection(db, trazColl), orderBy("fecha", "desc"), limit(6000))),
      ]);
      setEjecuciones(ejSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          numero_envio: data.numero_envio || data.shipping_code || d.id,
          fecha_procesado: data.fecha_procesado?.toDate?.() ? new Date(data.fecha_procesado.toDate()).toISOString().replace('T', ' ').substring(0, 19) : data.fecha_procesado
        } as Ejecucion;
      }));
      setIncidencias(incSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          numero_envio: data.numero_envio || data.shipping_code || d.id,
          fecha_procesado: data.fecha_procesado?.toDate?.() ? new Date(data.fecha_procesado.toDate()).toISOString().replace('T', ' ').substring(0, 19) : data.fecha_procesado
        } as Incidencia;
      }));
      setTrazabilidad(trazSnap.docs.map((d) => {
        const data = d.data();
        const fechaStr = data.fecha?.toDate?.() 
          ? new Date(data.fecha.toDate()).toISOString().replace('T', ' ').substring(0, 19) 
          : (data.fecha ? new Date(data.fecha).toISOString().replace('T', ' ').substring(0, 19) : "");
        return {
          id: d.id,
          ...data,
          numero_envio: data.shipping_code || "",
          numero_pedido: data.numero_pedido || "",
          fecha_procesado: fechaStr,
        };
      }));
    } catch (e) {
      console.error("Error refreshing Firestore data:", e);
    }
    setLoading(false);
  };

  const refreshSingleItem = async (itemId: string, collectionName: string) => {
    try {
      const docRef = doc(db, collectionName, itemId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        const newData = {
          id: docSnap.id,
          ...data,
          numero_envio: data.numero_envio || data.shipping_code || docSnap.id,
          fecha_procesado: data.fecha_procesado?.toDate?.() ? new Date(data.fecha_procesado.toDate()).toISOString().replace('T', ' ').substring(0, 19) : data.fecha_procesado
        } as any;
        if (collectionName.startsWith("ejecuciones")) {
          setEjecuciones(prev => prev.map(item => item.id === itemId ? newData : item));
        } else {
          setIncidencias(prev => prev.map(item => item.id === itemId ? newData : item));
        }
        return newData;
      }
    } catch (e) {
      console.error("Error refreshing single item:", e);
    }
  };

  const handleAddTracking = async () => {
    if (!nuevoEnvio.trim()) {
      alert("Por favor, introduce un número de envío (tracking).");
      return;
    }
    if (!nuevaTienda) {
      alert("Por favor, selecciona una tienda.");
      return;
    }

    setAddingEnvio(true);
    try {
      const tracking = nuevoEnvio.trim();
      const clientCode = getClientCode(nuevaTienda);
      const collectionName = 'ejecuciones';

      const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || "https://n8n.ctt-lastmile.com/webhook/refresh-tracking";
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping_code: tracking,
          client_code: clientCode,
          collection: collectionName,
          doc_id: tracking
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP status ${res.status}`);
      }

      alert("✅ Envío añadido e historial sincronizado correctamente.");
      setNuevoEnvio("");
      setNuevaTienda("");
      await refreshData();
    } catch (error: any) {
      console.error("Error onboarding tracking:", error);
      alert(`Error al añadir el envío: ${error.message || error}`);
    } finally {
      setAddingEnvio(false);
    }
  };

  // Lee un pedido on-demand desde la ruta API del propio dashboard y lo abre en el panel lateral.
  const consultarManualmente = async () => {
    const codigo = busqueda.trim();
    if (!codigo) return;
    setManualLoading(true); setManualError(""); setManualItem(null);
    try {
      const res = await fetch(`/api/shipment/read`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping_code: codigo }),
      });
      const j = await res.json();
      if (!j.success) { setManualError(j.error || "No se pudo leer el pedido."); }
      else {
        const r = j.result;
        const d = r.decision;
        // ¿El pedido existe? Si CTT no devolvió eventos ni estado, no hay datos reales.
        const tieneDatos = (r.bultos || []).some((b: any) => (b.events?.length || 0) > 0) || !!d?.estado_actual;
        if (!tieneDatos) {
          setManualError(`El pedido "${codigo}" no existe o no tiene datos en CTT.`);
          setManualLoading(false);
          return;
        }
        // Mapear el resultado al formato que entiende el panel lateral (ejecución).
        setManualItem({
          id: r.shipping_code,
          _collection: "ejecuciones",
          numero_envio: r.shipping_code,
          numero_pedido: String(r.meta?.client_reference || ""),
          tienda: r.client_name,
          credencial: r.client_name,
          estado: d.estado_actual,
          tipo_email: d.target_type,
          forzado_interno: d.target_type === "internal",
          destinatario: d.destinatario,
          email_enviado: d.should_notify,
          asunto: d.asunto,
          cuerpo: d.cuerpo,
          razon: d.ai_justification,
          centro: String(r.meta?.client_center_code || ""),
          dano: d.notification_type === "siniestro" || d.estado_actual === "1006",
          numero_avisos: r.numero_avisos_previos,
          bultos_historial_json: JSON.stringify(r.bultos || []),
          fecha_procesado: new Date().toISOString().replace("T", " ").substring(0, 19) + " (Consulta manual)",
        });
      }
    } catch (e: any) {
      setManualError("No se pudo leer el pedido. Inténtalo de nuevo.");
    }
    setManualLoading(false);
  };

  const resetFilters = () => {
    setTiendaFiltro("TODAS");
    setEstadoFiltro("TODOS");
    setEmailFiltro("TODOS");
    setTipoFiltro("TODOS");
    setBusqueda("");
    setFechaInicio(undefined);
    setMostrarSoloIncidencias(false);
  };

  const parseProcessDate = (dateStr: string) => {
    const datePart = dateStr.split(' ')[0];
    const segments = datePart.split('-').map(Number);
    // ISO format: YYYY-MM-DD
    if (segments[0] > 31) return new Date(segments[0], segments[1] - 1, segments[2]);
    // Legacy format: DD-MM-YYYY
    return new Date(segments[2], segments[1] - 1, segments[0]);
  };

  const filteredData = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    
    const filterFn = (item: any, isIncidencia: boolean) => {
      // 1. Busqueda
      const searchMatch = !term || 
        (item.numero_envio || "").toLowerCase().includes(term) || 
        (item.numero_pedido || "").toLowerCase().includes(term);
      if (!searchMatch) return false;

      // 2. Tienda
      if (tiendaFiltro !== "TODAS" && item.tienda !== tiendaFiltro) return false;

      // 3. Estado (Filtro por Nombre, no por codigo)
      if (estadoFiltro !== "TODOS") {
        if (item._collection === 'trazabilidad_ejecuciones') {
          return false;
        } else {
          const itemEstado = isIncidencia ? item.incidencia : item.estado;
          const itemLabel = getStatusLabel(itemEstado);
          if (itemLabel !== estadoFiltro) return false;
        }
      }

      // 4. Email (bool)
      if (emailFiltro !== "TODOS" && !term) {
        const sent = emailFiltro === "SÍ";
        const isNotified = item._collection === 'trazabilidad_ejecuciones'
          ? item.fase_salida === 'notified'
          : (isIncidencia ? item.numero_avisos > 0 : item.email_enviado);
        if (isNotified !== sent) return false;
      }

      // 5. Tipo Notificacion (Draft vs Internal vs Trazabilidad)
      if (tipoFiltro !== "TODOS") {
        if (item._collection === 'trazabilidad_ejecuciones') {
          if (tipoFiltro !== "TRAZABILIDAD") return false;
        } else {
          const itemTipo = String(item.tipo_email || "").toLowerCase();
          if (tipoFiltro === "DRAFT" && !itemTipo.includes("standard")) return false;
          if (tipoFiltro === "INTERNO" && !itemTipo.includes("internal") && !item.forzado_interno) return false;
          if (tipoFiltro === "TRAZABILIDAD") return false;
        }
      }

      // 6. Fecha
      if (fechaInicio && item.fecha_procesado) {
        const itemDate = parseProcessDate(item.fecha_procesado);
        if (format(itemDate, 'yyyy-MM-dd') !== format(fechaInicio, 'yyyy-MM-dd')) return false;
      }

      return true;
    };

    const parseFecha = (f: any): number => {
      if (!f) return 0;
      if (typeof f === 'object' && typeof f.toDate === 'function') return f.toDate().getTime();
      const s = String(f).replace(/\s*\(manual\)/i, '').trim();
      const isoLike = /^\d{4}-\d{2}-\d{2}/.test(s);
      if (isoLike) return new Date(s.replace(' ', 'T')).getTime();
      const [datePart, timePart = ''] = s.split(' ');
      const [d, m, y] = datePart.split('-');
      return new Date(`${y}-${m}-${d}T${timePart}`).getTime();
    };

    const sortByFecha = (a: any, b: any) => parseFecha(b.fecha_procesado) - parseFecha(a.fecha_procesado);

    const ejecucionIds = new Set(ejecuciones.map(e => e.id));

    return {
      ej: (mostrarSoloIncidencias
        ? incidencias.map(i => ({ ...i, estado: i.estado || i.incidencia, h_en_estado: i.h_en_incidencia, email_enviado: i.numero_avisos > 0, _collection: 'incidencias' } as any))
        : [
            ...ejecuciones.map(e => ({ ...e, _collection: 'ejecuciones' } as any)),
            ...incidencias
              .filter(i => !ejecucionIds.has(i.id))
              .map(i => ({
                ...i,
                estado: i.estado || i.incidencia,
                h_en_estado: i.h_en_incidencia,
                email_enviado: i.numero_avisos > 0,
                _collection: 'incidencias'
              } as any)),
            ...trazabilidad.map(t => ({ ...t, _collection: 'trazabilidad_ejecuciones' } as any))
          ].sort(sortByFecha)
      ).filter(e => filterFn(e, e._collection === 'incidencias'))
    };
  }, [ejecuciones, incidencias, trazabilidad, busqueda, tiendaFiltro, estadoFiltro, emailFiltro, tipoFiltro, fechaInicio, mostrarSoloIncidencias]);

  if (state.status === "loading" || state.status !== "authenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium">Iniciando Dashboard...</p>
        </div>
      </div>
    );
  }


  return (
    <main className="min-h-screen bg-slate-50/50 p-2 md:p-6 space-y-6 w-full">
      {/* Header section */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Auditoría CTT <span className="text-primary">v2.1</span></h1>
          <p className="text-sm text-slate-500 font-medium">Panel de respuesta IA y logística unificada</p>
        </div>

        <div className="flex items-center gap-3">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 font-semibold text-slate-600">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {(state.status === "authenticated" ? state.user.displayName || state.user.email || "?" : "?").charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{state.status === "authenticated" ? state.user.displayName || state.user.email : ""}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1.5">
              <div className="px-2.5 py-2 text-xs text-slate-400">
                {state.status === "authenticated" ? state.user.email : ""}
              </div>
              <div className="my-1 h-px bg-slate-100" />
              <button
                onClick={() => { setMenuOpen(false); setConfigOpen(true); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <Settings className="h-4 w-4 text-slate-500" /> Configuración
              </button>
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Diálogo de configuración (se abre desde el menú de usuario) */}
      <ConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        userEmail={state.status === "authenticated" ? state.user.email ?? undefined : undefined}
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* Filters Bar */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border space-y-5">
            {/* Buscador Destacado */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-800 uppercase tracking-wider ml-0.5">Buscar Envíos o Pedidos</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  placeholder="Introduce el número de envío (tracking) o de pedido para filtrar..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-12 !h-12 bg-slate-50/50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all rounded-xl shadow-none text-sm font-medium placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4 pb-1">
              <div className="flex items-center gap-2 text-slate-900">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Filtros Avanzados</h2>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={resetFilters}
                className="text-primary hover:bg-primary/10 gap-2 font-bold px-4 h-8 text-xs"
              >
                <FilterX className="h-3.5 w-3.5" />
                Limpiar filtros
              </Button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Capa Visual</label>
                <Button
                  variant="outline"
                  onClick={() => setMostrarSoloIncidencias(!mostrarSoloIncidencias)}
                  className={`w-full h-11 rounded-xl font-bold transition-all border shadow-none flex items-center justify-between px-4 ${
                    mostrarSoloIncidencias 
                      ? "bg-orange-50 text-orange-600 border-orange-200" 
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-[11px] uppercase tracking-wider">Incidencias</span>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${mostrarSoloIncidencias ? "bg-orange-500" : "bg-slate-300"}`}>
                    <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${mostrarSoloIncidencias ? "left-5" : "left-1"}`} />
                  </div>
                </Button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Tienda</label>
                <Select value={tiendaFiltro} onValueChange={(val) => setTiendaFiltro(val || "")}>
                  <SelectTrigger className="w-full !h-11 bg-slate-50/50 rounded-xl border-slate-200 shadow-none font-medium text-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODAS">Todas</SelectItem>
                    {Object.entries(SHOP_NAMES).map(([id, name]) => (
                      <SelectItem key={id} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Estado</label>
                <Select value={estadoFiltro} onValueChange={(val) => setEstadoFiltro(val || "")}>
                  <SelectTrigger className="w-full !h-11 bg-slate-50/50 rounded-xl border-slate-200 shadow-none font-medium text-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Cualquier Estado</SelectItem>
                    {STATUS_FILTER_OPTIONS.map(({ code, label }) => {
                      const theme = getStatusTheme(code);
                      return (
                        <SelectItem key={code} value={label}>
                          <span className="flex items-center gap-2">
                            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${theme.dot}`} />
                            <span className={`font-medium ${theme.text}`}>{label}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Origen Alerta</label>
                <Select value={tipoFiltro} onValueChange={(val) => setTipoFiltro(val || "")}>
                  <SelectTrigger className="w-full !h-11 bg-slate-50/50 rounded-xl border-slate-200 shadow-none font-medium text-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    <SelectItem value="DRAFT">Draft a CTT</SelectItem>
                    <SelectItem value="INTERNO">Alerta Interna</SelectItem>
                    <SelectItem value="TRAZABILIDAD">Trazabilidad</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Notificado</label>
                <Select value={emailFiltro} onValueChange={(val) => setEmailFiltro(val || "")}>
                  <SelectTrigger className="w-full !h-11 bg-slate-50/50 rounded-xl border-slate-200 shadow-none font-medium text-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Cualquier Log</SelectItem>
                    <SelectItem value="SÍ">Solo Enviados</SelectItem>
                    <SelectItem value="NO">No Enviados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Día</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`w-full !h-11 justify-start text-left font-normal bg-slate-50/50 rounded-xl border-slate-200 shadow-none ${!fechaInicio && "text-muted-foreground"}`}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fechaInicio ? format(fechaInicio, "PPP", { locale: es }) : <span>Elegir fecha</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fechaInicio}
                      onSelect={setFechaInicio}
                      initialFocus
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Ordenar */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Ordenar</label>
                <div className="flex items-center h-11 bg-slate-50/50 border border-slate-200 rounded-xl px-1 gap-1">
                  <button
                    onClick={() => setSortOrder("desc")}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all ${
                      sortOrder === "desc"
                        ? "bg-white shadow-sm text-primary border border-slate-200"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <ArrowDownUp className="h-3 w-3" />
                    Reciente
                  </button>
                  <button
                    onClick={() => setSortOrder("asc")}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all ${
                      sortOrder === "asc"
                        ? "bg-white shadow-sm text-primary border border-slate-200"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <ArrowDownUp className="h-3 w-3 rotate-180" />
                    Antiguo
                  </button>
                </div>
              </div>
            </div>

          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Listado de Ejecuciones ({filteredData.ej.length})
              </h3>
            </div>

            {/* Si buscas un código que no está en la lista → consultarlo en directo a CTT */}
            {busqueda.trim() && filteredData.ej.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                <Search className="h-8 w-8 text-slate-300" />
                <div>
                  <p className="font-semibold text-slate-700">No está en la lista</p>
                  <p className="text-sm text-slate-500">El pedido <span className="font-mono">{busqueda.trim()}</span> no aparece. Puedes consultarlo en directo a CTT.</p>
                </div>
                <Button onClick={consultarManualmente} disabled={manualLoading} className="gap-2">
                  {manualLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Leyendo datos…</> : <><Search className="h-4 w-4" /> Consultar manualmente</>}
                </Button>
                {manualError && <p className="text-sm text-red-600">{manualError}</p>}
              </div>
            )}

            <EjecucionesTable
              ejecuciones={filteredData.ej}
              sortOrder={sortOrder}
              refreshSingleItem={refreshSingleItem}
              injected={manualItem}
              onClearInjected={() => setManualItem(null)}
            />
          </div>
        </>
      )}
    </main>
  );
}
