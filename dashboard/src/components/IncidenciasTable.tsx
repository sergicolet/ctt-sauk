"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Incidencia } from "@/lib/types";

interface Props {
  incidencias: Incidencia[];
}

export function IncidenciasTable({ incidencias }: Props) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Envío</TableHead>
            <TableHead>Pedido</TableHead>
            <TableHead>Tienda</TableHead>
            <TableHead>Incidencia</TableHead>
            <TableHead className="text-right">H reparto</TableHead>
            <TableHead>Avisos</TableHead>
            <TableHead>Tipo email</TableHead>
            <TableHead>Daño</TableHead>
            <TableHead>Procesado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {incidencias.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                Sin incidencias registradas
              </TableCell>
            </TableRow>
          )}
          {incidencias.map((inc) => (
            <TableRow key={inc.id} className={inc.dano ? "bg-red-50" : ""}>
              <TableCell className="font-mono text-xs">{inc.numero_envio}</TableCell>
              <TableCell className="text-xs">{inc.numero_pedido}</TableCell>
              <TableCell>
                <Badge variant="outline">{inc.tienda}</Badge>
              </TableCell>
              <TableCell className="text-sm">{inc.incidencia}</TableCell>
              <TableCell className="text-right tabular-nums">
                {inc.delivery_hours > 0 ? (
                  <span className={inc.delivery_hours > 24 ? "text-red-600 font-semibold" : ""}>
                    {inc.delivery_hours}h
                  </span>
                ) : "—"}
              </TableCell>
              <TableCell>
                <span className={inc.numero_avisos > 1 ? "text-orange-600 font-semibold" : ""}>
                  {inc.numero_avisos}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={inc.tipo_email === "internal" ? "secondary" : "default"}>
                  {inc.tipo_email}
                </Badge>
              </TableCell>
              <TableCell>
                {inc.dano ? <Badge variant="destructive">Sí</Badge> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{inc.fecha_procesado}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
