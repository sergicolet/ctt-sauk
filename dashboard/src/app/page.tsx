"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Ejecucion, Incidencia, Historial } from "@/lib/types";
import { StatsCards } from "@/components/StatsCards";
import { EjecucionesTable } from "@/components/EjecucionesTable";
import { IncidenciasTable } from "@/components/IncidenciasTable";
import { HistorialTable } from "@/components/HistorialTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Dashboard() {
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [historial, setHistorial] = useState<Historial[]>([]);
  const [tiendaFiltro, setTiendaFiltro] = useState("TODAS");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ejSnap, incSnap, histSnap] = await Promise.all([
          getDocs(query(collection(db, "ejecuciones"), orderBy("fecha_procesado", "desc"), limit(500))),
          getDocs(query(collection(db, "incidencias"), orderBy("fecha_procesado", "desc"), limit(200))),
          getDocs(query(collection(db, "historial"), orderBy("fecha", "desc"), limit(200))),
        ]);
        setEjecuciones(ejSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Ejecucion)));
        setIncidencias(incSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Incidencia)));
        setHistorial(histSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Historial)));
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
  }, []);

  const tiendas = ["TODAS", ...Array.from(new Set(ejecuciones.map((e) => e.tienda)))];

  const termino = busqueda.trim().toLowerCase();

  function coincideBusqueda(envio: string, pedido: string) {
    if (!termino) return true;
    return envio.toLowerCase().includes(termino) || pedido.toLowerCase().includes(termino);
  }

  const filtrarEjecuciones = ejecuciones
    .filter((e) => tiendaFiltro === "TODAS" || e.tienda === tiendaFiltro)
    .filter((e) => coincideBusqueda(e.numero_envio, e.numero_pedido));

  const filtrarIncidencias = incidencias
    .filter((i) => tiendaFiltro === "TODAS" || i.tienda === tiendaFiltro)
    .filter((i) => coincideBusqueda(i.numero_envio, i.numero_pedido));

  const filtrarHistorial = historial
    .filter((h) => tiendaFiltro === "TODAS" || h.tienda === tiendaFiltro)
    .filter((h) => coincideBusqueda(h.numero_envio, h.numero_pedido));

  return (
    <main className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CTT Dashboard</h1>
          <p className="text-sm text-muted-foreground">Seguimiento de envíos e incidencias</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Buscar por pedido o envío..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-64"
          />
          <Select value={tiendaFiltro} onValueChange={(v) => setTiendaFiltro(v ?? "TODAS")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tiendas.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando datos...</p>
      ) : (
        <>
          <StatsCards ejecuciones={filtrarEjecuciones} incidencias={filtrarIncidencias} />

          <Tabs defaultValue="ejecuciones">
            <TabsList>
              <TabsTrigger value="ejecuciones">
                Ejecuciones ({filtrarEjecuciones.length})
              </TabsTrigger>
              <TabsTrigger value="incidencias">
                Incidencias ({filtrarIncidencias.length})
              </TabsTrigger>
              <TabsTrigger value="historial">
                Historial IA ({filtrarHistorial.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ejecuciones" className="mt-4">
              <EjecucionesTable ejecuciones={filtrarEjecuciones} />
            </TabsContent>
            <TabsContent value="incidencias" className="mt-4">
              <IncidenciasTable incidencias={filtrarIncidencias} />
            </TabsContent>
            <TabsContent value="historial" className="mt-4">
              <HistorialTable historial={filtrarHistorial} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </main>
  );
}
