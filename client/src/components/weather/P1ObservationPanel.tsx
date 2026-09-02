import { CalendarCheck2, CheckCircle2, CircleDashed, ShieldAlert, TimerReset } from "lucide-react";

type ObservationVerdict = "OBSERVING" | "VALIDABLE" | "EXTEND" | "FAILED";

type ObservationDay = {
  id: number;
  observationDate: string;
  dailySourceCount: number;
  hourlySourceCount: number;
  expectedSourceCount: number;
  writeSuccessRate: number;
  contractIntegrityRate: number;
  coverageGatePassed: number;
  writeSuccessGatePassed: number;
  idempotenceGatePassed: number;
  isolationGatePassed: number;
  contractGatePassed: number;
  verdict: string;
  reasons: unknown;
};

type ObservationWindow = {
  requiredDays: number;
  completedDays: number;
  remainingDays: number;
  verdict: ObservationVerdict;
  reasons: string[];
  history: ObservationDay[];
};

const VERDICT_STYLE: Record<ObservationVerdict, { label: string; tone: string; Icon: typeof CircleDashed }> = {
  OBSERVING: { label: "Observation en cours", tone: "border-sky-300/25 bg-sky-300/10 text-sky-100", Icon: CircleDashed },
  VALIDABLE: { label: "P1 validable", tone: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100", Icon: CheckCircle2 },
  EXTEND: { label: "À prolonger", tone: "border-amber-300/25 bg-amber-300/10 text-amber-100", Icon: TimerReset },
  FAILED: { label: "Échec sécurité", tone: "border-red-300/25 bg-red-300/10 text-red-100", Icon: ShieldAlert },
};

function Gate({ passed, label }: { passed: boolean; label: string }) {
  return <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${passed ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100" : "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"}`}>{label} {passed ? "✓" : "—"}</span>;
}

export function P1ObservationPanel({ window }: { window: ObservationWindow }) {
  const verdict = VERDICT_STYLE[window.verdict];
  const latest = window.history[0] ?? null;
  const progress = Math.min(100, Math.round((window.completedDays / Math.max(1, window.requiredDays)) * 100));
  const reasons = window.reasons.length > 0 ? window.reasons : ["Aucun motif bloquant enregistré."];

  return <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.045] p-4" aria-labelledby="p1-observation-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2"><CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-200/75">P1.6 · Contrôle de sécurité</p><h2 id="p1-observation-title" className="text-sm font-semibold text-slate-100">Observation shadow sur sept jours</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Chaque bilan mesure la couverture, l’intégrité, l’idempotence et l’isolation. Il ne peut pas promouvoir P1 automatiquement.</p></div></div>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold ${verdict.tone}`}><verdict.Icon className="h-3 w-3" />{verdict.label}</span>
    </div>

    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3">
      <div className="flex items-center justify-between gap-3 text-[10px]"><span className="font-semibold text-cyan-100">Fenêtre P1.6</span><span className="text-slate-300">{window.completedDays}/{window.requiredDays} jours</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${progress}%` }} /></div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{reasons.join(" ")}</p>
    </div>

    {latest ? <details className="mt-3 rounded-xl border border-white/10 bg-slate-950/20 p-3">
      <summary className="cursor-pointer text-[10px] font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Dernier bilan · {latest.observationDate}</summary>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg border border-white/10 p-2"><p className="text-slate-500">Quotidien</p><p className="font-semibold text-slate-100">{latest.dailySourceCount}/{latest.expectedSourceCount} flux</p></div><div className="rounded-lg border border-white/10 p-2"><p className="text-slate-500">Horaire</p><p className="font-semibold text-slate-100">{latest.hourlySourceCount}/{latest.expectedSourceCount} flux</p></div><div className="rounded-lg border border-white/10 p-2"><p className="text-slate-500">Runs SUCCESS</p><p className="font-semibold text-slate-100">{(latest.writeSuccessRate * 100).toFixed(1)}%</p></div><div className="rounded-lg border border-white/10 p-2"><p className="text-slate-500">Intégrité</p><p className="font-semibold text-slate-100">{(latest.contractIntegrityRate * 100).toFixed(1)}%</p></div></div>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Critères du dernier bilan P1.6"><Gate label="Couverture" passed={latest.coverageGatePassed === 1} /><Gate label="Runs" passed={latest.writeSuccessGatePassed === 1} /><Gate label="Idempotence" passed={latest.idempotenceGatePassed === 1} /><Gate label="Isolation" passed={latest.isolationGatePassed === 1} /><Gate label="Contrat" passed={latest.contractGatePassed === 1} /></div>
    </details> : <p className="mt-3 rounded-xl border border-dashed border-white/10 p-3 text-[10px] text-slate-400">Le premier bilan sera enregistré après un cycle v8 contenant les écritures quotidienne et horaire shadow.</p>}

    {window.history.length > 0 && <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Historique quotidien P1.6">{window.history.slice(0, 14).map(day => <span key={day.id} className={`shrink-0 rounded-lg border px-2 py-1.5 text-[9px] ${day.verdict === "VALIDABLE" ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100" : day.verdict === "FAILED" ? "border-red-300/20 bg-red-300/[0.06] text-red-100" : "border-amber-300/20 bg-amber-300/[0.06] text-amber-100"}`}>{day.observationDate.slice(5)} · {day.verdict}</span>)}</div>}
  </section>;
}
