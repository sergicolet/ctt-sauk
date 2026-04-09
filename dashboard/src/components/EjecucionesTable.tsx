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
import { Ejecucion } from "@/lib/types";

const ESTADO_LABELS: Record<string, string> = {
  "0000": "Manifestado",
  "0500": "Recogido",
  "0900": "En tránsito",
  "1000": "Delegación tránsito",
  "1200": "Delegación destino",
  "1500": "En reparto",
  "1600": "Reparto fallido",
  "1700": "Estacionado",
  "2000": "Entregado",
  "2300": "Punto CTT",
  "2500": "Devolución",
};

function estadoBadge(estado: string, dano: boolean) {
  if (dano) return <Badge variant="destructive">DAÑO</Badge>;
  const problemas = ["1600", "1700", "1800", "2400", "2600", "2700"];
  const ok = ["2000"];
  if (ok.includes(estado)) return <Badge className="bg-green-500">{ESTADO_LABELS[estado] ?? estado}</Badge>;
  if (problemas.includes(estado)) return <Badge variant="destructive">{ESTADO_LABELS[estado] ?? estado}</Badge>;
  return <Badge variant="secondary">{ESTADO_LABELS[estado] ?? estado}</Badge>;
}

interface Props {
  ejecuciones: Ejecucion[];
}

export function EjecucionesTable({ ejecuciones }: Props) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Envío</TableHead>
            <TableHead>Pedido</TableHead>
            <TableHead>Tienda</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">H reparto</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Procesado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ejecuciones.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Sin datos
              </TableCell>
            </TableRow>
          )}
          {ejecuciones.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono text-xs">{e.numero_envio}</TableCell>
              <TableCell className="text-xs">{e.numero_pedido}</TableCell>
              <TableCell>
                <Badge variant="outline">{e.tienda}</Badge>
              </TableCell>
              <TableCell>{estadoBadge(e.estado, e.dano)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {e.delivery_hours > 0 ? (
                  <span className={e.delivery_hours > 24 ? "text-red-600 font-semibold" : ""}>
                    {e.delivery_hours}h
                  </span>
                ) : "—"}
              </TableCell>
              <TableCell>
                {e.email_enviado ? (
                  <Badge className="bg-blue-500">Sí</Badge>
                ) : (
                  <Badge variant="secondary">No</Badge>
                )}
              </TableCell>
              <TableCell className="text-xs">{e.tipo_email ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{e.fecha_procesado}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
