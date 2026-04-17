# Pedidos detectados con anomalías — 17/04/2026 09:40
> Revisión manual de Firestore. Pendiente verificar tras ejecución de las 17h.

## 🔴 DAÑADOS — Revisar urgente (SNAPPY)
| Envío | Anomalía |
|-------|---------|
| 0080530080539701121339 | dano=true, 3 bultos, uno reexpedido [2600] |
| 0080530080539701079810 | dano=true, delivery_hours=0 (anomalía métricas) |
| 0002070002079700470277 | dano=true, delivery_hours=0 (anomalía métricas) |
| 0002070002079700436855 | dano=true, **419h (~17 días) sin resolver** |

## 🟠 MUY ANTIGUOS — Sin resolver >7 días
| Envío | Tienda | Horas |
|-------|--------|-------|
| 0002070002079700436855 | SNAPPY | 419h (~17.5 días) |
| 0080530080539701110956 | MIESTERY | 391h (~16 días) |
| 0080530080539701096654 | MIESTERY | 287h (~12 días) |
| 0080530080539701112315 | MIESTERY | 183h (~7.6 días) |
| 0080530080539701121279 | MIESTERY | 165h (~7 días) |

## 🟡 MAL CLASIFICADOS — incidencia sin valor semántico
| Envío | Tienda | Valor incidencia |
|-------|--------|-----------------|
| 0080530082909816659446 | MIESTERY | `[1600] Reparto fallido` (raw) |
| 0080530080539701121258 | SNAPPY | `[1600] Reparto fallido` (raw) |
| 0080530082809700002733 | SNAPPY | `[0600]` (raw) |
| 0080530082809700002761 | SNAPPY | `none` |
| 0080530082809700002751 | SNAPPY | `none` (pedido: "dev TEMU PT" — verificar si es real) |

## 🔵 HISTORIAL DESACTUALIZADO — Email enviado con info obsoleta
| Envío | Tienda |
|-------|--------|
| 0080530080539701088799 | MIESTERY |
| 0080530080539701113202 | MIESTERY |
| 0080530080539701105484 | MIESTERY |
| 0080530080539701097681 | MIESTERY |
| 0002070002079700446229 | SNAPPY |

## ℹ️ RESTO (~35 docs)
Devoluciones con `numero_avisos` corrupto (111.111.115–116).
Clasificación correcta, solo el contador estaba mal. Se corrige automáticamente en próxima ejecución.
