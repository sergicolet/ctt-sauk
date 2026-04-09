"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ejecucion, Incidencia } from "@/lib/types";

interface Props {
  ejecuciones: Ejecucion[];
  incidencias: Incidencia[];
}

export function StatsCards({ ejecuciones, incidencias }: Props) {
  const totalEjecuciones = ejecuciones.length;
  const emailsEnviados = ejecuciones.filter((e) => e.email_enviado).length;
  const conDano = ejecuciones.filter((e) => e.dano).length;
  const incidenciasActivas = incidencias.length;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Ejecuciones hoy</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{totalEjecuciones}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Emails enviados</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-blue-600">{emailsEnviados}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Incidencias activas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-orange-500">{incidenciasActivas}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Con daño</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-red-600">{conDano}</p>
        </CardContent>
      </Card>
    </div>
  );
}
