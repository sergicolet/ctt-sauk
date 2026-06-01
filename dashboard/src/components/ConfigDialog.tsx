"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Settings, Save, Play, Loader2, Clock } from "lucide-react";

interface BatchSettings {
  enabled: boolean;
  schedule: Record<string, number[]>; // horas por día (1=Lun..7=Dom)
  clients_enabled: string[]; send_emails: boolean; dry_run: boolean;
  run_days?: number[]; run_hours?: number[]; // legacy
}
const DEFAULTS: BatchSettings = {
  enabled: true,
  schedule: { "1": [17, 20], "2": [17, 20], "3": [17, 20], "4": [17, 20], "5": [17, 20] },
  clients_enabled: ["48630", "47352", "47685", "45416"], send_emails: false, dry_run: true,
};

/** Normaliza un doc (posible legacy run_days×run_hours) a schedule por día. */
function toSchedule(d: Partial<BatchSettings>): Record<string, number[]> {
  if (d.schedule && Object.keys(d.schedule).length > 0) return d.schedule;
  const days = d.run_days ?? [1, 2, 3, 4, 5];
  const hours = d.run_hours ?? [17, 20];
  const sch: Record<string, number[]> = {};
  for (const day of days) sch[String(day)] = [...hours];
  return sch;
}
const DAYS = [{ v: 1, l: "Lun" }, { v: 2, l: "Mar" }, { v: 3, l: "Mié" }, { v: 4, l: "Jue" }, { v: 5, l: "Vie" }, { v: 6, l: "Sáb" }, { v: 7, l: "Dom" }];
const CLIENTS = [{ c: "48630", n: "HAMINOS" }, { c: "47352", n: "SNAPPY" }, { c: "47685", n: "MIESTERY" }, { c: "45416", n: "KULTUDENDA" }];

export function ConfigDialog({
  userEmail,
  open: controlledOpen,
  onOpenChange,
}: {
  userEmail?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = (o: boolean) => (isControlled ? onOpenChange?.(o) : setInternalOpen(o));
  const [s, setS] = useState<BatchSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [runMsg, setRunMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true); setMsg(""); setRunMsg("");
      try {
        const snap = await getDoc(doc(db, "config", "batch_settings"));
        if (snap.exists()) {
          const data = snap.data() as Partial<BatchSettings>;
          setS({ ...DEFAULTS, ...data, schedule: toSchedule(data) });
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [open]);

  const toggleS = (a: string[], v: string) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);

  const toggleHora = (day: number, hour: number) => {
    setS((prev) => {
      const key = String(day);
      const cur = prev.schedule[key] || [];
      const next = cur.includes(hour) ? cur.filter((h) => h !== hour) : [...cur, hour].sort((a, b) => a - b);
      const sch = { ...prev.schedule };
      if (next.length) sch[key] = next; else delete sch[key];
      return { ...prev, schedule: sch };
    });
  };

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      await setDoc(doc(db, "config", "batch_settings"), {
        enabled: s.enabled,
        schedule: s.schedule,
        clients_enabled: s.clients_enabled,
        send_emails: s.send_emails,
        dry_run: s.dry_run,
        _updated_at: new Date().toISOString(),
        _updated_by: userEmail ?? "",
      }, { merge: true });
      setMsg("Guardado correctamente.");
    } catch (e) { setMsg("Error al guardar: " + String(e)); }
    setSaving(false);
  };

  const runNow = async () => {
    setRunning(true); setRunMsg("");
    try {
      const res = await fetch(`/api/batch/run`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const j = await res.json();
      if (j.success) setRunMsg(j.message || "Batch lanzado en la nube.");
      else setRunMsg("Error: " + j.error);
    } catch { setRunMsg("No se pudo lanzar el batch."); }
    setRunning(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger render={<Button variant="outline" className="font-semibold text-slate-600" />}>
          <Settings className="mr-2 h-4 w-4" /> Configuración
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuración del robot CTT</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <Clock className="h-3.5 w-3.5" /> Las horas son en <b>hora española (Madrid)</b>.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-5 py-2">
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">Robot activado</span>
              <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="h-4 w-4" />
            </label>

            <div>
              <p className="mb-1 text-sm font-medium">Horario por día <span className="text-xs text-slate-400">(pulsa las horas de cada día)</span></p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-center">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="sticky left-0 z-10 bg-slate-50 px-2 py-1 text-left text-[10px] font-bold uppercase text-slate-400">Día</th>
                      {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                        <th key={h} className="px-0.5 py-1 text-[9px] font-medium text-slate-400">{String(h).padStart(2, "0")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((d) => {
                      const horas = s.schedule[String(d.v)] || [];
                      return (
                        <tr key={d.v} className="border-t border-slate-100">
                          <td className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-xs font-semibold text-slate-600">{d.l}</td>
                          {Array.from({ length: 24 }, (_, h) => h).map((h) => {
                            const on = horas.includes(h);
                            return (
                              <td key={h} className="p-0.5">
                                <button
                                  onClick={() => toggleHora(d.v, h)}
                                  className={`h-5 w-5 rounded text-[9px] transition-colors ${on ? "bg-primary text-white font-bold" : "bg-slate-100 hover:bg-slate-200"}`}
                                  title={`${d.l} ${String(h).padStart(2, "0")}:00`}
                                >
                                  {on ? "●" : ""}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-slate-400">Ejemplo: lunes 08, 17 y 20; resto 17 y 20.</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Tiendas activas</p>
              <div className="flex flex-wrap gap-1.5">
                {CLIENTS.map((c) => (
                  <button key={c.c} onClick={() => setS({ ...s, clients_enabled: toggleS(s.clients_enabled, c.c) })}
                    className={`rounded-lg px-3 py-1 text-xs font-medium ${s.clients_enabled.includes(c.c) ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>{c.n}</button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">Enviar emails de verdad <span className="text-xs text-slate-400">(off = no envía)</span></span>
              <input type="checkbox" checked={s.send_emails} onChange={(e) => setS({ ...s, send_emails: e.target.checked })} className="h-4 w-4" />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">Modo prueba <span className="text-xs text-slate-400">(on = no guarda en base de datos)</span></span>
              <input type="checkbox" checked={s.dry_run} onChange={(e) => setS({ ...s, dry_run: e.target.checked })} className="h-4 w-4" />
            </label>

            <div className="flex items-center gap-3 border-t pt-4">
              <Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" /> {saving ? "Guardando…" : "Guardar"}</Button>
              <Button variant="outline" onClick={runNow} disabled={running}><Play className="mr-2 h-4 w-4" /> {running ? "Ejecutando…" : "Ejecutar ahora"}</Button>
            </div>
            {msg && <p className="text-sm text-slate-600">{msg}</p>}
            {runMsg && <p className="text-sm text-slate-600">{runMsg}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
