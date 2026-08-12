import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { MeteoIcon } from "@/components/MeteoIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "@/contexts/LocationContext";

function formatSnapshot(snapshot: any) {
  const date = new Date(snapshot.computedAt);
  const timestamp = Number.isNaN(date.getTime())
    ? snapshot.date
    : date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });
  return `${timestamp} · confiance ${snapshot.confidenceScore == null ? "indisponible" : `${Math.round(snapshot.confidenceScore)}%`}`;
}

const PARAMETER_META = {
  temperature: { label: "Température", icon: "temperature", color: "text-orange-300", bar: "bg-orange-400" },
  precipitation: { label: "Précipitations", icon: "precipitation", color: "text-blue-300", bar: "bg-blue-400" },
  wind: { label: "Vent", icon: "wind_param", color: "text-cyan-300", bar: "bg-cyan-400" },
} as const;

export default function WeightComparison() {
  const { activeLocation } = useLocation();
  const coords = useMemo(
    () => activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : undefined,
    [activeLocation?.lat, activeLocation?.lon]
  );
  const { data: history = [], isLoading: historyLoading } = trpc.weather.getWeightTraceHistory.useQuery(coords);
  const [selectedBefore, setSelectedBefore] = useState<number | null>(null);
  const [selectedAfter, setSelectedAfter] = useState<number | null>(null);

  const afterId = selectedAfter ?? history[0]?.id ?? null;
  const beforeId = selectedBefore ?? history.find((snapshot) => snapshot.id !== afterId)?.id ?? null;
  const canCompare = beforeId != null && afterId != null && beforeId !== afterId;
  const comparisonInput = {
    lat: coords?.lat,
    lon: coords?.lon,
    beforeId: beforeId ?? 1,
    afterId: afterId ?? 1,
  };
  const { data: comparison, isLoading: comparisonLoading } = trpc.weather.compareWeightSnapshots.useQuery(comparisonInput, {
    enabled: canCompare,
  });

  const totalChanges = comparison?.parameters.reduce((total, parameter) =>
    total + parameter.sourceChanges.filter((source) => Math.abs(source.delta) > 0.0001).length, 0
  ) ?? 0;

  return (
    <main className="min-h-screen bg-[#0d1117] text-foreground">
      <div className="mx-auto max-w-2xl px-3 pb-24 pt-4 sm:px-6 sm:pt-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Traçabilité MeteoAI</p>
            <h1 className="mt-1 text-xl font-bold text-white">Comparer les pondérations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeLocation?.name ?? "Localisation par défaut"} · évolution réelle entre deux snapshots.
            </p>
          </div>
          <Link href="/details" className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-sky-300">
            Détails météo
          </Link>
        </div>

        {historyLoading ? (
          <div className="space-y-3"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-72 w-full rounded-2xl" /></div>
        ) : history.length < 2 ? (
          <section className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-5 text-sm text-muted-foreground">
            Deux snapshots traçables sont nécessaires pour afficher une comparaison. Les prochaines collectes officielles enrichiront cet historique.
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-white">Snapshots à comparer</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  Prévision précédente
                  <select
                    value={beforeId ?? ""}
                    onChange={(event) => setSelectedBefore(Number(event.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-sky-500"
                  >
                    {history.filter((snapshot) => snapshot.id !== afterId).map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{formatSnapshot(snapshot)}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Prévision la plus récente
                  <select
                    value={afterId ?? ""}
                    onChange={(event) => setSelectedAfter(Number(event.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-sky-500"
                  >
                    {history.filter((snapshot) => snapshot.id !== beforeId).map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{formatSnapshot(snapshot)}</option>)}
                  </select>
                </label>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{totalChanges} variation(s) de poids détectée(s) entre les deux calculs.</p>
            </section>

            {comparisonLoading ? (
              <div className="mt-4 space-y-3"><Skeleton className="h-48 w-full rounded-2xl" /><Skeleton className="h-48 w-full rounded-2xl" /></div>
            ) : comparison ? (
              <div className="mt-4 space-y-4">
                {comparison.parameters.map((parameter) => {
                  const meta = PARAMETER_META[parameter.parameter];
                  return (
                    <section key={parameter.parameter} className="rounded-2xl border border-border bg-card p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <MeteoIcon name={meta.icon} size={26} />
                        <h2 className={`text-sm font-semibold ${meta.color}`}>{meta.label}</h2>
                      </div>
                      <div className="space-y-4">
                        {parameter.sourceChanges.map((source) => {
                          const before = source.beforeWeight * 100;
                          const after = source.afterWeight * 100;
                          const delta = source.delta * 100;
                          const deltaClass = delta > 0.005 ? "text-emerald-300" : delta < -0.005 ? "text-rose-300" : "text-muted-foreground";
                          return (
                            <div key={source.name} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="truncate font-medium text-foreground">{source.name}</span>
                                <span className={`shrink-0 font-mono text-xs font-semibold ${deltaClass}`}>{delta > 0 ? "+" : ""}{delta.toFixed(2)} pts</span>
                              </div>
                              <div className="mt-2 grid grid-cols-[58px_1fr_54px] items-center gap-2 text-xs">
                                <span className="text-muted-foreground">Avant</span>
                                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-slate-500" style={{ width: `${Math.min(100, before)}%` }} /></div>
                                <span className="text-right font-mono text-slate-300">{before.toFixed(2)}%</span>
                                <span className="text-muted-foreground">Après</span>
                                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${Math.min(100, after)}%` }} /></div>
                                <span className="text-right font-mono text-foreground">{after.toFixed(2)}%</span>
                              </div>
                              {source.status !== "retained" && <p className="mt-2 text-[11px] text-sky-300">{source.status === "added" ? "Source ajoutée" : "Source retirée"}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <section className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-200">
                La comparaison n’est pas disponible pour cette paire de snapshots.
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
