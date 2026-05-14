"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, ArrowLeft, AlertTriangle } from "lucide-react";

export default function Trazabilidad() {
  const { state, logout } = useAuth();
  const router = useRouter();
  const [trazabilidad, setTrazabilidad] = useState<any[]>([]);
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
        const snap = await getDocs(query(collection(db, "trazabilidad_ejecuciones"), orderBy("fecha", "desc"), limit(500)));
        setTrazabilidad(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Error loading trazabilidad:", e);
      }
      setLoading(false);
    }
    load();
  }, [state]);

  const avisarAdmin = async (envio: any) => {
    try {
      await fetch('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envio })
      });
      alert('Alerta enviada al administrador.');
    } catch (e) {
      console.error(e);
      alert('Error al avisar al admin');
    }
  };

  if (state.status === "loading" || state.status !== "authenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50/50 p-2 md:p-6 space-y-6 w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-2xl shadow-sm border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/')} className="px-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Trazabilidad <span className="text-primary">v2.1</span></h1>
          </div>
          <p className="text-slate-500 font-medium">Auditoría completa del flujo de vida de envíos en el sistema</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
            <div className="px-3 py-1 bg-white rounded-md shadow-sm text-sm font-semibold text-primary">Admin</div>
            <div className="px-3 py-1 text-sm text-slate-500 font-medium">{state.user.displayName}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="text-slate-400 hover:text-destructive transition-colors">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Historial de Ejecuciones</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Envío</th>
                <th className="px-4 py-3">Fase Salida</th>
                <th className="px-4 py-3">Razón</th>
                <th className="px-4 py-3">Run ID</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">Cargando...</td></tr>
              ) : trazabilidad.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">No hay datos de trazabilidad</td></tr>
              ) : (
                trazabilidad.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-600">{new Date(item.fecha).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium">{item.shipping_code}</td>
                    <td className="px-4 py-3">
                      <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-semibold">
                        {item.fase_salida}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[300px]" title={item.razon}>{item.razon}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{item.ejecucion_id}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => avisarAdmin(item)} className="text-orange-600 hover:bg-orange-50">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        Avisar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
