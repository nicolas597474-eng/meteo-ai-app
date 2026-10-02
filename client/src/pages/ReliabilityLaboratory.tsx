import { useMemo, useState } from "react";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { WeatherStatusBadge } from "@/components/weather/WeatherStatusBadge";
import { BackToTopButton } from "@/components/BackToTopButton";
import { useLocation } from "@/contexts/LocationContext";
import { usePageWeatherSky } from "@/hooks/usePageWeatherSky";
import { trpc } from "@/lib/trpc";

type PeriodId = "24h" | "7d" | "30d" | "90d" | "365d";
type HorizonId = "0-6h" | "6-24h" | "24-48h" | "2-3d" | "4-7d" | "8-10d" | "11-15d";

const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: "24h", label: "24 h" },
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "365d", label: "365 jours" },
];

const HORIZONS: Array<{ id: HorizonId; label: string }> = [
  { id: "0-6h", label: "0–6 h" },
  { id: "6-24h", label: "6–24 h" },
  { id: "24-48h", label: "24–48 h" },
  { id: "2-3d", label: "2–3 jours" },
  { id: "4-7d", label: "4–7 jours" },
  { id: "8-10d", label: "8–10 jours" },
  { id: "11-15d", label: "11–15 jours" },
];

function metric(value: number | null | undefined, unit = "", digits = 2) {
  return value == null || !Number.isFinite(Number(value)) ? "—" : `${Number(value).toFixed(digits)}${unit}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "qualified": return "Seuil d’évidence atteint";
    case "insufficient_evidence": return "Données insuffisantes";
    case "incomplete_metrics": return "Métriques incomplètes";
    case "history_unavailable": return "Historique indisponible";
    case "horizon_not_stored": return "Horizon non archivé séparément";
    default: return "Aucune preuve archivée";
  }
}

function statusTone(status: string): "success" | "warning" | "neutral" | "danger" {
  if (status === "qualified") return "success";
  if (status === "insufficient_evidence" || status === "incomplete_metrics") return "warning";
  if (status === "history_unavailable") return "danger";
  return "neutral";
}

function formatTrend(row: any) {
  const trend = row.trend;
  if (!trend) return "Évolution indisponible : horizon non archivé séparément.";
  if (trend.status === "history_unavailable") return "Évolution indisponible : historique non lisible.";
  if (trend.status === "no_evidence") return "Évolution indisponible : une fenêtre n’a pas de preuves complètes.";
  if (trend.status !== "qualified" || !trend.delta) return "Évolution non qualifiée : les deux fenêtres n’atteignent pas le seuil.";
  const delta = trend.delta;
  const sign = (value: number) => value > 0 ? "+" : "";
  return `Δ MAE ${sign(delta.mae)}${delta.mae.toFixed(2)} · RMSE ${sign(delta.rmse)}${delta.rmse.toFixed(2)} · biais ${sign(delta.bias)}${delta.bias.toFixed(2)} ${row.unit}; récent ${trend.recentWindowStart}–${trend.recentWindowEnd}, précédent ${trend.previousWindowStart}–${trend.previousWindowEnd}.`;
}

export default function ReliabilityLaboratory() {
  const { activeLocation } = useLocation();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [horizon, setHorizon] = useState<HorizonId>("6-24h");
  const locationName = activeLocation?.name ?? "Hondeghem";
  const input = useMemo(() => ({
    lat: activeLocation?.lat ?? 50.7567,
    lon: activeLocation?.lon ?? 2.5204,
    period,
    horizon,
  }), [activeLocation?.lat, activeLocation?.lon, period, horizon]);
  const { data, isLoading, isError } = trpc.weather.getReliabilityLaboratory.useQuery(input, { staleTime: 2 * 60 * 1000 });

  return <main className="weather-page-sky min-h-screen bg-[#080a0f] pb-28" style={pageSkyStyle}>
    <div className="mx-auto max-w-7xl space-y-4 px-3 pt-3 sm:px-5 sm:pt-5">
      <header className="rounded-2xl border border-sky-500/15 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_40%),linear-gradient(135deg,#101827,#090d15)] p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.17em] text-sky-300">Laboratoire · observations physiques</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Fiabilité historique, sans note globale</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">MAE, RMSE, biais, effectifs, dates et évolution par modèle × variable × horizon exact. Best Match et agrégateurs sont exclus. L’accord inter-modèles décrit une dispersion de prévisions et n’est pas une mesure de fiabilité.</p>
        <p className="mt-2 text-xs font-medium text-slate-300">{locationName} · fuseau Europe/Paris · unité conservée pour chaque variable</p>
      </header>

      <MeteoSurface tone="lab" className="rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-semibold text-slate-200">Fenêtre d’évidence et horizon</p><p className="mt-0.5 text-[11px] text-slate-500">Aucune échéance voisine ni période extérieure n’est utilisée en repli.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-700 bg-[#090d14] p-1 [scrollbar-width:none]">{PERIODS.map((choice) => <button type="button" key={choice.id} onClick={() => setPeriod(choice.id)} aria-pressed={period === choice.id} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${period === choice.id ? "bg-sky-600 text-white" : "text-slate-400"}`}>{choice.label}</button>)}</div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#090d14] px-3 py-2 text-[11px] text-slate-400">Horizon<select value={horizon} onChange={(event) => setHorizon(event.target.value as HorizonId)} className="bg-transparent font-semibold text-slate-100 outline-none">{HORIZONS.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
          </div>
        </div>
      </MeteoSurface>

      {isLoading ? <div className="h-80 animate-pulse rounded-2xl bg-slate-900" /> : isError || !data ? <MeteoSurface tone="lab" className="rounded-2xl p-5"><p className="text-sm font-semibold text-white">Laboratoire indisponible</p><p className="mt-1 text-xs text-slate-400">L’historique réel ne peut pas être lu. Aucune métrique n’est estimée.</p></MeteoSurface> : <>
        <section className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.045] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-slate-100">Porte d’évidence</h2><p className="mt-1 max-w-4xl text-[11px] leading-relaxed text-slate-400">Qualification du classement : au moins {data.evidence.minimumComparisons} comparaisons et {data.evidence.minimumComparableDays} jours comparables pour la même maille. Les valeurs brutes restent visibles sous ce seuil avec le statut « données insuffisantes »; ce seuil n’est ni un score ni une calibration.</p><p className="mt-1 text-[10px] text-slate-500">Métriques : {data.period.startDate}–{data.period.endDate} · évolution : fenêtres 30 j récentes et précédentes, archive consultée depuis {data.trendWindowStartDate} · horizon {data.selectedHorizon?.label ?? horizon} · {data.evidence.expectedModelCount} modèles horaires officiels · Best Match inclus : non.</p></div>
            <WeatherStatusBadge compact tone={data.evidence.status === "available" ? "success" : "danger"} label="Archive horaire" value={data.evidence.status === "available" ? "Lisible" : "Indisponible"} description={data.evidence.status === "available" ? "Lecture de l’archive de scores modèle-variable-horizon réussie." : "La table d’historique est illisible ou indisponible; ce statut n’est pas interprété comme absence de comparaisons."} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p className="rounded-xl border border-white/10 bg-black/15 p-3 text-[10px] leading-relaxed text-slate-300">Agrégation documentée : MAE et biais sont pondérés par le sampleSize stocké; RMSE = racine de la moyenne des RMSE² pondérés par ce même effectif. Les jours évalués sont comptés distinctement.</p>
            <p className="rounded-xl border border-white/10 bg-black/15 p-3 text-[10px] leading-relaxed text-slate-300">Évolution : comparaison entre deux fenêtres de 30 jours; affichée uniquement si chacune atteint le seuil d’évidence. Aucun delta n’est calculé entre fenêtres insuffisantes.</p>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">{data.availability.dailyHorizon} {data.availability.selectedHorizon}.</p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d131d]" aria-labelledby="historical-evidence-title">
          <div className="border-b border-slate-800 p-4"><h2 id="historical-evidence-title" className="text-sm font-semibold text-slate-100">Fiabilité historique · modèle × variable × horizon</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Chaque ligne est indépendante. Une cellule « — » signifie non disponible, pas zéro. Best Match/agrégateurs, modèles candidats et autres horizons ne sont jamais utilisés comme substituts.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] text-[10px] sm:text-xs">
              <thead className="bg-black/20 text-slate-400"><tr><th className="p-2 text-left">Modèle</th><th className="p-2 text-left">Variable · unité</th><th className="p-2 text-right">MAE</th><th className="p-2 text-right">RMSE</th><th className="p-2 text-right">Biais</th><th className="p-2 text-right">n · jours</th><th className="p-2 text-left">Dates des scores</th><th className="p-2 text-left">Évolution 30 j</th><th className="p-2 text-left">Disponibilité</th></tr></thead>
              <tbody>{data.metrics.map((row) => <tr key={`${row.modelId}-${row.variable}-${row.horizonId}`} className="border-t border-slate-800/70 align-top">
                <td className="p-2 font-semibold text-slate-200">{row.modelName}<span className="mt-0.5 block font-mono text-[9px] text-slate-500">{row.modelId}</span></td>
                <td className="p-2 text-slate-300">{row.variableLabel}<span className="ml-1 text-slate-500">({row.unit})</span></td>
                <td className="p-2 text-right font-mono text-orange-100">{metric(row.metrics?.mae, ` ${row.unit}`)}</td>
                <td className="p-2 text-right font-mono text-amber-100">{metric(row.metrics?.rmse, ` ${row.unit}`)}</td>
                <td className="p-2 text-right font-mono text-sky-100">{metric(row.metrics?.bias, ` ${row.unit}`)}</td>
                <td className="p-2 text-right font-mono text-slate-300">{row.metrics ? `${row.metrics.comparisonCount} · ${row.metrics.evaluatedDays}` : "—"}<span className="mt-0.5 block text-[9px] text-slate-500">seuil {row.minimumComparisons} · {row.minimumComparableDays} j</span></td>
                <td className="p-2 text-slate-400">{row.firstScoreDate ?? "—"}<span className="block">→ {row.latestScoreDate ?? "—"}</span>{row.latestComputedAt && <span className="mt-0.5 block text-[9px] text-slate-500">calcul {new Date(row.latestComputedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</span>}{row.incompleteMetricRows > 0 && <span className="mt-0.5 block text-amber-200">{row.incompleteMetricRows} ligne(s) incomplète(s) exclue(s)</span>}</td>
                <td className="max-w-[290px] p-2 leading-relaxed text-slate-400">{formatTrend(row)}</td>
                <td className="p-2"><WeatherStatusBadge compact tone={statusTone(row.status)} label="Statut" value={statusLabel(row.status)} description={row.reason ?? "Valeurs brutes disponibles; le seuil d’évidence documente seulement l’admissibilité au classement."} />{row.reason && <p className="mt-1 max-w-[210px] text-[9px] leading-relaxed text-slate-500">{row.reason}</p>}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="border-t border-slate-800 px-4 py-3 text-[10px] leading-relaxed text-slate-500">Source : archive immuable des évaluations horaires qualifiées contre observations physiques. Le MAE/RMSE/biais historique ne mesure pas la dispersion entre modèles; cette dernière est présentée séparément sous « accord inter-modèles ».</p>
        </section>
      </>}
    </div>
    <BackToTopButton />
  </main>;
}
