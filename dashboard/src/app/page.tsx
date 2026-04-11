"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Ejecucion, Incidencia, Historial } from "@/lib/types";
import { StatsCards } from "@/components/StatsCards";
import { EjecucionesTable } from "@/components/EjecucionesTable";
import { IncidenciasTable } from "@/components/IncidenciasTable";
import { HistorialTable } from "@/components/HistorialTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, FilterX, LogOut, Search, SlidersHorizontal } from "lucide-react";
import { SHOP_NAMES, getStatusLabel } from "@/lib/status-map";

export default function Dashboard() {
  const { state, logout } = useAuth();
  const router = useRouter();
  
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [historial, setHistorial] = useState<Historial[]>([]);
  
  // Filters
  const [tiendaFiltro, setTiendaFiltro] = useState("TODAS");
  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");
  const [emailFiltro, setEmailFiltro] = useState("TODOS");
  const [tipoFiltro, setTipoFiltro] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(true);

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
        const [ejSnap, incSnap, histSnap] = await Promise.all([
          getDocs(query(collection(db, "ejecuciones"), orderBy("fecha_procesado", "desc"), limit(1000))),
          getDocs(query(collection(db, "incidencias"), orderBy("fecha_procesado", "desc"), limit(1000))),
          getDocs(query(collection(db, "historial"), orderBy("fecha", "desc"), limit(500))),
        ]);
        setEjecuciones(ejSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Ejecucion)));
        setIncidencias(incSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Incidencia)));
        setHistorial(histSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Historial)));
      } catch (e) {
        console.error("Error loading Firestore data:", e);
      }
      setLoading(false);
    }
    load();
  }, [state]);

  const resetFilters = () => {
    setTiendaFiltro("TODAS");
    setEstadoFiltro("TODOS");
    setEmailFiltro("TODOS");
    setTipoFiltro("TODOS");
    setBusqueda("");
    setFechaInicio(undefined);
  };

  const parseProcessDate = (dateStr: string) => {
    const parts = dateStr.split(' ');
    const [d, m, y] = parts[0].split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const filteredData = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    
    const filterFn = (item: Ejecucion | Incidencia, isIncidencia: boolean) => {
      // 1. Busqueda
      const searchMatch = !term || 
        (item.numero_envio || "").toLowerCase().includes(term) || 
        (item.numero_pedido || "").toLowerCase().includes(term);
      if (!searchMatch) return false;

      // 2. Tienda
      if (tiendaFiltro !== "TODAS" && item.tienda !== tiendaFiltro) return false;

      // 3. Estado (Filtro por Nombre, no por codigo)
      if (estadoFiltro !== "TODOS") {
        const itemEstado = isIncidencia ? (item as Incidencia).incidencia : (item as Ejecucion).estado;
        const itemLabel = getStatusLabel(itemEstado);
        if (itemLabel !== estadoFiltro) return false;
      }

      // 4. Email (bool)
      if (emailFiltro !== "TODOS") {
        const sent = emailFiltro === "SÍ";
        const isNotified = isIncidencia 
          ? (item as Incidencia).numero_avisos > 0 
          : (item as Ejecucion).email_enviado;
        if (isNotified !== sent) return false;
      }

      // 5. Tipo Notificacion (Draft vs Internal)
      if (tipoFiltro !== "TODOS") {
        const itemTipo = (item.tipo_email || "").toLowerCase();
        if (tipoFiltro === "DRAFT" && !itemTipo.includes("standard")) return false;
        if (tipoFiltro === "INTERNO" && !itemTipo.includes("internal") && !item.forzado_interno) return false;
      }

      // 6. Fecha
      if (fechaInicio && item.fecha_procesado) {
        const itemDate = parseProcessDate(item.fecha_procesado);
        if (format(itemDate, 'yyyy-MM-dd') !== format(fechaInicio, 'yyyy-MM-dd')) return false;
      }

      return true;
    };

    return {
      ej: ejecuciones.filter(e => filterFn(e, false)),
      inc: incidencias.filter(i => filterFn(i, true)),
      hist: historial.filter(h => {
        const searchMatch = !term || 
          (h.numero_envio || "").toLowerCase().includes(term) || 
          (h.numero_pedido || "").toLowerCase().includes(term);
        if (!searchMatch) return false;
        if (tiendaFiltro !== "TODAS" && h.tienda !== tiendaFiltro) return false;
        return true;
      })
    };
  }, [ejecuciones, incidencias, historial, busqueda, tiendaFiltro, estadoFiltro, emailFiltro, tipoFiltro, fechaInicio]);

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

  // Get Unique Labels for filter, not Codes
  const allLabels = Array.from(new Set([
    ...ejecuciones.map(e => getStatusLabel(e.estado)),
    ...incidencias.map(i => getStatusLabel(i.incidencia))
  ])).filter(Boolean).sort();

  return (
    <main className="min-h-screen bg-slate-50/50 p-2 md:p-6 space-y-6 w-full">
      {/* Header section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-2xl shadow-sm border">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Auditoría CTT <span className="text-primary">v2.1</span></h1>
          <p className="text-slate-500 font-medium">Panel de respuesta IA y logística unificada</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
            <div className="px-3 py-1 bg-white rounded-md shadow-sm text-sm font-semibold text-primary">Admin</div>
            <div className="px-3 py-1 text-sm text-slate-500 font-medium">
              {state.status === "authenticated" ? state.user.displayName : ""}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="text-slate-400 hover:text-destructive transition-colors">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <StatsCards ejecuciones={filteredData.ej} incidencias={filteredData.inc} />

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-slate-900">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider">Filtros de Auditoría</h2>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={resetFilters}
                className="text-primary hover:bg-primary/10 gap-2 font-bold px-4"
              >
                <FilterX className="h-4 w-4" />
                Limpiar filtros
              </Button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Búsqueda</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Envío o pedido..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="pl-9 !h-11 bg-slate-50/50 border-slate-200 focus:bg-white focus:ring-1 focus:ring-primary/20 transition-all rounded-xl shadow-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Tienda</label>
                <Select value={tiendaFiltro} onValueChange={(val) => setTiendaFiltro(val || "")}>
                  <SelectTrigger className="w-full !h-11 bg-slate-50/50 rounded-xl border-slate-200 shadow-none">
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
                  <SelectTrigger className="w-full !h-11 bg-slate-50/50 rounded-xl border-slate-200 shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Cualquier Estado</SelectItem>
                    {allLabels.map(label => (
                      <SelectItem key={label} value={label}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Origen Alerta</label>
                <Select value={tipoFiltro} onValueChange={(val) => setTipoFiltro(val || "")}>
                  <SelectTrigger className="w-full !h-11 bg-slate-50/50 rounded-xl border-slate-200 shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    <SelectItem value="DRAFT">Draft a CTT</SelectItem>
                    <SelectItem value="INTERNO">Alerta Interna</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Notificado</label>
                <Select value={emailFiltro} onValueChange={(val) => setEmailFiltro(val || "")}>
                  <SelectTrigger className="w-full !h-11 bg-slate-50/50 rounded-xl border-slate-200 shadow-none">
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
            </div>
            

          </div>

          <Tabs defaultValue="ejecuciones" className="w-full">
            <div className="flex items-center justify-between mb-4 overflow-x-auto no-scrollbar">
              <TabsList className="bg-white p-1 rounded-xl shadow-sm border w-fit">
                <TabsTrigger value="ejecuciones" className="px-6 rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-primary font-bold">
                  Ejecuciones ({filteredData.ej.length})
                </TabsTrigger>
                <TabsTrigger value="incidencias" className="px-6 rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-primary font-bold">
                  Incidencias ({filteredData.inc.length})
                </TabsTrigger>
                <TabsTrigger value="historial" className="px-6 rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-primary font-bold">
                  Logs IA ({filteredData.hist.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="ejecuciones" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <EjecucionesTable ejecuciones={filteredData.ej} />
            </TabsContent>
            
            <TabsContent value="incidencias" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <IncidenciasTable incidencias={filteredData.inc} />
            </TabsContent>
            
            <TabsContent value="historial" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <HistorialTable historial={filteredData.hist} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </main>
  );
}
