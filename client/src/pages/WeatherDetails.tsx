/**
 * WeatherDetails — Page de prévisions météo ultra-détaillées
 * Sections: prévisions unifiées par jour/heure, carte météo et historique vérifié
 */
import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { MeteoIcon } from "@/components/MeteoIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "@/contexts/LocationContext";
import { usePageWeatherSky } from "@/hooks/usePageWeatherSky";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { ForecastByDaySection } from "@/components/weather/ForecastByDaySection";
import { HourlyHistoricalEvidencePanel } from "@/components/weather/HourlyHistoricalEvidencePanel";
import { BackToTopButton } from "@/components/BackToTopButton";
import { shouldRetryWeatherQuery, WEATHER_QUERY_SLOW_MS, weatherRetryDelay } from "@/lib/weatherQueryRecovery";
import { WindyMap } from "@/components/WindyMap";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { findActiveHourlyForecastIndex } from "@shared/hourlyForecastTime";

// ─── Main Component ─────────────────────────────────────────────────────────

export default function WeatherDetails() {
  const { activeLocation } = useLocation();
  const { user } = useAuth();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const coordsInput = useMemo(() => activeLocation
    ? { lat: activeLocation.lat, lon: activeLocation.lon }
    : undefined, [activeLocation?.lat, activeLocation?.lon]);

  const { data, isLoading, isFetching, isError, error, refetch } = trpc.weather.getDetailedForecast.useQuery({ ...coordsInput, includeExtendedPeriods: false }, {
    retry: shouldRetryWeatherQuery,
    retryDelay: weatherRetryDelay,
    refetchOnWindowFocus: false,
  });
  const { data: forecastProvenance } = trpc.weather.getForecastProvenance.useQuery(coordsInput, { staleTime: 60 * 1000, refetchOnWindowFocus: false });
  const [slowLoad, setSlowLoad] = useState(false);
  const aromeShadow = trpc.weather.compareHondeghemAromeShadow.useMutation();

  const isHondeghem = !activeLocation || (
    Math.abs(activeLocation.lat - 50.7567) < 0.001 && Math.abs(activeLocation.lon - 2.5204) < 0.001
  );
  const bestMatchValueAt = (validAt: string, key: "temp" | "precipitation" | "windSpeed") => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(validAt));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    const hour = `${part("hour")}:${part("minute")}`;
    return hours.find((item: any) => item.date === date && item.hour === hour)?.[key] ?? null;
  };
  const parisDateAt = (validAt: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(validAt));

  useEffect(() => {
    if (!isLoading && !isFetching) {
      setSlowLoad(false);
      return;
    }
    const timeout = window.setTimeout(() => setSlowLoad(true), WEATHER_QUERY_SLOW_MS);
    return () => window.clearTimeout(timeout);
  }, [isLoading, isFetching]);

  const currentHourIdx = useMemo(() => {
    if (!data?.hours) return -1;
    return findActiveHourlyForecastIndex(data.hours, Date.now());
  }, [data?.hours]);
  if (isLoading) {
    return (
      <div className="weather-page-sky min-h-dvh w-full overflow-x-clip bg-[#0d1117]" style={pageSkyStyle}>
        <div className="mx-auto w-full min-w-0 max-w-none space-y-4 px-1 pt-[max(env(safe-area-inset-top),0.25rem)] sm:max-w-2xl sm:px-3 sm:py-4">
          <Skeleton className="h-10 w-48" />
          {slowLoad && <div role="status" className="min-w-0 w-full max-w-full rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-100">La source météo met plus de temps que prévu. MeteoAI réessaie uniquement les erreurs temporaires.</div>}
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const isTimeout = /timeout|délai|aborted/i.test(error?.message ?? "");
    return <div className="weather-page-sky min-h-dvh w-full overflow-x-clip bg-[#0d1117]" style={pageSkyStyle}><div className="mx-auto w-full min-w-0 max-w-none px-1 pt-[max(env(safe-area-inset-top),0.25rem)] sm:max-w-2xl sm:px-3 sm:py-5"><MeteoSurface tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-3 text-center sm:rounded-[24px] sm:p-5"><MeteoIcon name="refresh" size={26} /><h1 className="mt-3 text-base font-semibold text-white">Prévisions temporairement indisponibles</h1><p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-300">{isTimeout ? "Le délai de la source météo a été dépassé après les réessais autorisés." : "La prévision ne peut pas être chargée pour le moment. Aucune donnée n’est remplacée ou inventée."}</p><button type="button" onClick={() => void refetch()} disabled={isFetching} className="mt-4 min-h-10 rounded-xl border border-sky-300/40 bg-sky-300/10 px-4 text-xs font-semibold text-sky-100 disabled:opacity-50">{isFetching ? "Nouvel essai…" : "Réessayer"}</button></MeteoSurface></div><BackToTopButton /></div>;
  }

  const hours = data.hours ?? [];
  const currentHour = hours[currentHourIdx] ?? null;

  return (
    <div className="weather-page-sky forecast-details-page min-h-dvh w-full overflow-x-clip bg-[#061426]" style={pageSkyStyle}>
      <div className="mx-auto w-full min-w-0 max-w-none space-y-3 px-4 pt-[max(env(safe-area-inset-top),0.25rem)] pb-24 sm:max-w-2xl sm:space-y-5 sm:px-3 sm:py-4 sm:pb-28">
        <ForecastByDaySection
          hours={hours}
          dailyDays={data.days ?? []}
          dailySources={data.modelsUsed ?? []}
          activeHourIndex={currentHourIdx}
          hourlyWeighting={data.officialSnapshot?.hourlyWeighting}
        />

        {user?.role === "admin" && <MeteoSurface as="section" tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-violet-300/25 bg-violet-300/[0.045] p-3 sm:rounded-[24px] sm:p-4" aria-labelledby="arome-shadow-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-200/75">Diagnostic manuel · mode shadow</p>
              <h2 id="arome-shadow-title" className="mt-1 text-base font-semibold text-white">AROME officiel ↔ Open-Meteo</h2>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-300">Profil AROME France HD · Hondeghem uniquement. La requête n’est envoyée qu’au clic; aucun résultat ne modifie les prévisions affichées.</p>
            </div>
            <button type="button" onClick={() => aromeShadow.mutate()} disabled={!isHondeghem || aromeShadow.isPending} className="min-h-10 shrink-0 rounded-xl border border-violet-200/35 bg-violet-300/10 px-3 py-2 text-xs font-semibold text-violet-100 disabled:cursor-not-allowed disabled:opacity-50">
              {aromeShadow.isPending ? "Comparaison en cours…" : aromeShadow.data ? "Relancer la comparaison" : "Comparer les runs"}
            </button>
          </div>
          {!isHondeghem && <p className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/[0.05] p-2 text-[10px] text-amber-100">Cette comparaison est limitée à Hondeghem (50,7567° N, 2,5204° E); choisissez ce lieu pour l’activer.</p>}
          {aromeShadow.error && <p role="alert" className="mt-3 rounded-xl border border-rose-300/25 bg-rose-300/[0.06] p-2 text-[10px] text-rose-100">Requête impossible : {aromeShadow.error.message}</p>}
          {aromeShadow.data && <div className="mt-3 space-y-3" role="status">
            <div className={`rounded-xl border p-2 text-[10px] leading-relaxed ${aromeShadow.data.status === "ok" ? "border-emerald-300/25 bg-emerald-300/[0.05] text-emerald-100" : aromeShadow.data.status === "missing-key" || aromeShadow.data.status === "authentication-error" ? "border-amber-300/25 bg-amber-300/[0.05] text-amber-100" : "border-sky-300/20 bg-sky-300/[0.04] text-sky-100"}`}>
              <p className="font-semibold">{aromeShadow.data.status === "missing-key" ? "Clé AROME manquante" : aromeShadow.data.status === "authentication-error" ? "Authentification AROME refusée" : aromeShadow.data.status === "request-impossible" ? "Requête impossible" : aromeShadow.data.status === "partial" ? "Comparaison partielle" : "Comparaison terminée"}</p>
              <p className="mt-0.5">{aromeShadow.data.message}</p>
              {aromeShadow.data.run && <p className="mt-1">Run commun demandé : <strong>{aromeShadow.data.run}</strong> (UTC) · profil {aromeShadow.data.profile} · Open-Meteo {aromeShadow.data.openMeteoModel}, run exact {aromeShadow.data.openMeteoRun} UTC.</p>}
              <p>Référence courante Best Match : run non identifié par Open-Meteo; elle n’est pas présentée comme run équivalent.</p>
              <p>Dernière tentative : {new Date(aromeShadow.data.comparedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (Europe/Paris).</p>
            </div>
            {aromeShadow.data.daily.length > 0 && <div>
              <h3 className="text-[11px] font-semibold text-white">Synthèse journalière sur les heures comparées</h3>
              <div className="mt-2 space-y-2">
                {aromeShadow.data.daily.map((day: any) => <div key={day.date} className="rounded-xl border border-white/10 bg-black/15 p-2">
                  <p className="text-[10px] font-semibold text-slate-100">{day.date} · {day.metrics.temperature.hours} échéance(s) horaires avec valeurs appariées</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {(["temperature", "precipitation", "windSpeed"] as const).map((metric) => {
                      const value = day.metrics[metric];
                      const bestMatchKey = metric === "temperature" ? "temp" : metric;
                      const bestValues = aromeShadow.data.hourly.filter((hour: any) => parisDateAt(hour.validAt) === day.date)
                        .map((hour: any) => bestMatchValueAt(hour.validAt, bestMatchKey))
                        .filter((item: unknown): item is number => typeof item === "number" && Number.isFinite(item));
                      const bestSummary = bestValues.length ? metric === "precipitation" ? `${bestValues.reduce((sum, item) => sum + item, 0).toFixed(1)} mm` : `${(bestValues.reduce((sum, item) => sum + item, 0) / bestValues.length).toFixed(1)} ${metric === "temperature" ? "°C" : "km/h"}` : "—";
                      const label = metric === "temperature" ? "Température moyenne" : metric === "precipitation" ? "Précipitations cumulées" : "Vent moyen";
                      const fmt = (item: number | null) => item == null ? "—" : `${item.toFixed(1)} ${metric === "temperature" ? "°C" : metric === "precipitation" ? "mm" : "km/h"}`;
                      return <div key={metric} className="rounded-lg border border-white/8 bg-white/[0.025] p-2 text-[9px] text-slate-300">
                        <p className="font-semibold text-slate-100">{label} · {value.hours} h avec valeurs</p>
                        <p>AROME WCS: {fmt(value.arome)} · Open-Meteo même run: {fmt(value.openMeteoArome)}</p>
                        <p>Best Match affiché (run inconnu): {bestSummary}</p>
                        <p>Écart AROME WCS − Single Runs: {fmt(value.difference)}</p>
                      </div>;
                    })}
                  </div>
                </div>)}
              </div>
              <details className="mt-2 rounded-xl border border-white/10 bg-black/10 p-2">
                <summary className="cursor-pointer text-[10px] font-semibold text-violet-100">Détail horaire, valeurs et écarts ({aromeShadow.data.hourly.length} échéances UTC)</summary>
                <div className="mt-2 max-h-96 overflow-auto">
                  <table className="w-full border-collapse text-left text-[9px]">
                    <thead className="sticky top-0 bg-slate-950 text-slate-300"><tr><th className="p-1">Validité</th><th className="p-1">Variable</th><th className="p-1">AROME WCS</th><th className="p-1">OM même run</th><th className="p-1">Best Match*</th><th className="p-1">Écart WCS−OM</th></tr></thead>
                    <tbody>{aromeShadow.data.hourly.flatMap((hour: any) => (["temperature", "precipitation", "windSpeed"] as const).map((metric) => {
                      const item = hour.metrics[metric];
                      const bestKey = metric === "temperature" ? "temp" : metric;
                      const unit = metric === "temperature" ? "°C" : metric === "precipitation" ? "mm" : "km/h";
                      const fmt = (value: number | null) => value == null ? "—" : `${value.toFixed(1)} ${unit}`;
                      const label = metric === "temperature" ? "Température" : metric === "precipitation" ? "Précipitations" : "Vent";
                      return <tr key={`${hour.validAt}-${metric}`} className="border-t border-white/8 text-slate-200"><td className="whitespace-nowrap p-1">{hour.validAt.replace("T", " ").replace(":00.000Z", "Z")}</td><td className="p-1">{label}</td><td className="p-1">{fmt(item.arome)}</td><td className="p-1">{fmt(item.openMeteoArome)}</td><td className="p-1">{fmt(bestMatchValueAt(hour.validAt, bestKey))}</td><td className="p-1">{fmt(item.difference)}{item.issue ? <span className="block text-amber-200">{item.issue}</span> : null}</td></tr>;
                    }))}</tbody>
                  </table>
                </div>
                <p className="mt-2 text-[9px] text-slate-400">* Best Match reprend les valeurs déjà affichées par l’application. Son run n’est pas identifié; seuls AROME WCS et Single Runs sont comparés comme runs équivalents.</p>
              </details>
            </div>}
            {aromeShadow.data.missing.length > 0 && <div className="rounded-xl border border-amber-200/20 bg-amber-200/[0.04] p-2 text-[9px] text-amber-100"><p className="font-semibold">Manquants et limites détectés</p><ul className="mt-1 list-inside list-disc">{aromeShadow.data.missing.map((message: string, index: number) => <li key={`${index}-${message}`}>{message}</li>)}</ul></div>}
          </div>}
          <p className="mt-2 text-[9px] text-slate-500">Appel externe authentifié côté serveur uniquement; l’authentification live n’est pas testée dans l’environnement de développement. Open-Meteo Best Match, les fusions journalières et la Vigilance restent inchangés.</p>
        </MeteoSurface>}

        {/* ═══ SECTION : CARTE MÉTÉO ANIMÉE ═══ */}
        <MeteoSurface as="section" tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-white/10 bg-[rgba(26,48,70,0.56)] p-2 sm:rounded-[26px] sm:p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-2xl border border-sky-200/20 bg-sky-300/10 text-lg">🌍</span>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-100/55">Temps réel</p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-white">Carte météorologique</h2>
            </div>
          </div>
          {activeLocation ? (
            <WindyMap lat={activeLocation.lat} lon={activeLocation.lon} locationName={activeLocation.name} />
          ) : (
            <p className="text-xs text-slate-400">Sélectionnez un lieu favori pour afficher la carte météo.</p>
          )}
        </MeteoSurface>

        <MeteoSurface as="section" tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-emerald-400/35 bg-emerald-400/[0.06] p-2 shadow-[0_0_24px_rgba(52,211,153,0.08)] sm:rounded-[24px] sm:p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full border border-emerald-300/25 bg-emerald-400/10"><MeteoIcon name="calendar" size={15} /></span><h2 className="text-sm font-semibold text-white">Historique des prévisions</h2></div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">Graphiques, observations archivées et comparaisons par modèle.</p>
            </div>
            <Link href="/history" className="shrink-0 rounded-xl border border-emerald-300/70 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/20 active:scale-[0.97]">Ouvrir <span aria-hidden="true">→</span></Link>
          </div>
        </MeteoSurface>

        {/* ═══ SECTION 6: FIABILITÉ HISTORIQUE QUALIFIÉE ═══ */}
        <MeteoSurface as="section" tone="subtle" className="min-w-0 w-full max-w-full rounded-2xl border border-white/8 bg-black/20 p-2 sm:rounded-[24px] sm:p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
              <MeteoIcon name="confidence" size={18} />
              Fiabilité historique face aux observations
            </h2>
            <HourlyHistoricalEvidencePanel
                variableWeightings={currentHour?.forecastWeighting?.variableWeightings ?? []}
                horizonBucket={currentHour?.forecastWeighting?.horizonBucket}
                horizonUnavailableReason={currentHour?.forecastWeighting?.unavailableReason}
              />
        </MeteoSurface>

      </div>
      <BackToTopButton />
    </div>
  );
}
