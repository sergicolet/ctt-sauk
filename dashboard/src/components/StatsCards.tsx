"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ejecucion, Incidencia } from "@/lib/types";

interface Props {
  ejecuciones: Ejecucion[];
  incidencias: Incidencia[];
}

export function StatsCards({ ejecuciones, incidencias }: Props) {
  const allItems = [...ejecuciones, ...incidencias];
  const totalEjecuciones = ejecuciones.length;
  const emailsEnviados = allItems.filter((e) => e.email_enviado).length;
  const incidenciasActivas = incidencias.length;

  // Split between Draft CTT and Internal
  const draftCtt = allItems.filter((e) => (e.tipo_email || "").toLowerCase().includes("standard")).length;
  const interno = allItems.filter((e) => (e.tipo_email || "").toLowerCase().includes("internal") || e.forzado_interno).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card className="rounded-2xl shadow-sm border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ejecuciones hoy</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-slate-900">{totalEjecuciones}</p>
        </CardContent>
      </Card>
      
      <Card className="rounded-2xl shadow-sm border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Drafts CTT</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-blue-600">{draftCtt}</p>
            <span className="text-xs font-medium text-slate-400">Envíos</span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Alertas Internas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-amber-600">{interno}</p>
            <span className="text-xs font-medium text-slate-400">Auditoría</span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Incidencias CTT</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-orange-500">{incidenciasActivas}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Notificado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-bold text-emerald-600">{emailsEnviados}</p>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex-1 max-w-[60px]">
              <div 
                className="h-full bg-emerald-500" 
                style={{ width: `${(emailsEnviados / (allItems.length || 1)) * 100}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
