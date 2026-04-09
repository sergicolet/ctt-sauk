"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Historial } from "@/lib/types";

interface Props {
  historial: Historial[];
}

export function HistorialTable({ historial }: Props) {
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Envío</TableHead>
            <TableHead>Pedido</TableHead>
            <TableHead>Tienda</TableHead>
            <TableHead>Tipo email</TableHead>
            <TableHead>Destinatario</TableHead>
            <TableHead>Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {historial.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                Sin historial
              </TableCell>
            </TableRow>
          )}
          {historial.map((h) => (
            <React.Fragment key={h.id}>
              <TableRow
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setExpandido(expandido === h.id ? null : h.id)}
              >
                <TableCell className="text-xs text-muted-foreground">{h.fecha}</TableCell>
                <TableCell className="font-mono text-xs">{h.numero_envio}</TableCell>
                <TableCell className="text-xs">{h.numero_pedido}</TableCell>
                <TableCell>
                  <Badge variant="outline">{h.tienda}</Badge>
                </TableCell>
                <TableCell className="text-xs">{h.tipo_email ?? "—"}</TableCell>
                <TableCell className="text-xs">{h.email_destinatario ?? "—"}</TableCell>
                <TableCell className="text-xs text-blue-600">
                  {expandido === h.id ? "▲ cerrar" : "▼ ver"}
                </TableCell>
              </TableRow>
              {expandido === h.id && (
                <TableRow key={`${h.id}-detalle`}>
                  <TableCell colSpan={7} className="bg-muted/30 p-4 space-y-4">
                    {h.contexto && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">CONTEXTO PREPARADO</p>
                        <pre className="text-xs whitespace-pre-wrap bg-background border rounded p-3 max-h-48 overflow-auto">
                          {h.contexto}
                        </pre>
                      </div>
                    )}
                    {h.ia_output && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">OUTPUT IA</p>
                        <pre className="text-xs whitespace-pre-wrap bg-background border rounded p-3 max-h-48 overflow-auto">
                          {h.ia_output}
                        </pre>
                      </div>
                    )}
                    {h.email_cuerpo && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">
                          EMAIL ENVIADO — {h.email_asunto}
                        </p>
                        <pre className="text-xs whitespace-pre-wrap bg-background border rounded p-3 max-h-48 overflow-auto">
                          {h.email_cuerpo}
                        </pre>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
