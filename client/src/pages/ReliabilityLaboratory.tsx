import { useMemo, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { BackToTopButton } from "@/components/BackToTopButton";
import { ReliabilityTrendChart } from "@/components/weather/ReliabilityTrendChart";
import { YesterdayVerificationPanel } from "@/components/weather/YesterdayVerificationPanel";
import {
  ReliabilityNotesSummary,
  HorizonEvidenceSection,
  VariableEvidenceSection,
  type ReliabilityMetricRow,
  type VerificationPair,
} from "@/components/weather/ReliabilityEvidenceSections";
import {
  LargestErrorsSection,
  MethodologySection,
  ModelComparisonSection,
} from "@/components/weather/ReliabilityComparisonSections";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { useLocation } from "@/contexts/LocationContext";
import { usePageWeatherSky } from "@/hooks/usePageWeatherSky";
import { trpc } from "@/lib/trpc";

type PeriodId = "24h" | "7d" | "30d" | "90d" | "365d";
type HorizonId =
  | "0-6h"
  | "6-24h"
  | "24-48h"
  | "2-3d"
  | "4-7d"
  | "8-10d"
  | "11-15d";

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

function DataUnavailableCard({ isError }: { isError: boolean }) {
  return (
    <MeteoSurface
      tone="lab"
      as="section"
      className="rounded-2xl p-5"
      role="status"
    >
      <p className="text-sm font-semibold text-white">
        {isError
          ? "Laboratoire momentanément indisponible"
          : "Préparation de l’audit"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {isError
          ? "L’historique réel ne peut pas être lu. Aucune métrique n’est estimée."
          : "Lecture des preuves archivées pour le lieu et la période sélectionnés…"}
      </p>
    </MeteoSurface>
  );
}

export default function ReliabilityLaboratory() {
  const { activeLocation } = useLocation();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const [period, setPeriod] = useState<PeriodId>("7d");
  const [horizon, setHorizon] = useState<HorizonId>("6-24h");
  const [selectedVariable, setSelectedVariable] = useState("temperature");
  const locationName = activeLocation?.name ?? "Hondeghem";
  const radiusKm =
    activeLocation?.radiusKm != null &&
    activeLocation.radiusKm >= 5 &&
    activeLocation.radiusKm <= 50
      ? activeLocation.radiusKm
      : 20;

  const input = useMemo(
    () => ({
      lat: activeLocation?.lat ?? 50.7567,
      lon: activeLocation?.lon ?? 2.5204,
      period,
      horizon,
    }),
    [activeLocation?.lat, activeLocation?.lon, period, horizon]
  );
  const overviewInput = useMemo(
    () => ({
      lat: activeLocation?.lat ?? 50.7567,
      lon: activeLocation?.lon ?? 2.5204,
      periodDays: 7 as const,
      radiusKm,
    }),
    [activeLocation?.lat, activeLocation?.lon, radiusKm]
  );
  const yesterdayInput = useMemo(
    () => ({
      lat: activeLocation?.lat ?? 50.7567,
      lon: activeLocation?.lon ?? 2.5204,
    }),
    [activeLocation?.lat, activeLocation?.lon]
  );

  const { data, isLoading, isError } =
    trpc.weather.getReliabilityLaboratory.useQuery(input, {
      staleTime: 2 * 60 * 1000,
    });
  const {
    data: overviewData,
    isLoading: overviewLoading,
    isError: overviewError,
  } = trpc.weather.getStationReliabilityOverview.useQuery(overviewInput, {
    staleTime: 2 * 60 * 1000,
  });
  const {
    data: yesterdayData,
    isLoading: yesterdayLoading,
    isError: yesterdayError,
  } = trpc.weather.getYesterdayForecastObservation.useQuery(yesterdayInput, {
    staleTime: 2 * 60 * 1000,
  });
  const verificationPairs = useMemo(
    () => (yesterdayData?.pairs ?? []) as VerificationPair[],
    [yesterdayData?.pairs]
  );

  return (
    <main
      className="weather-page-sky min-h-screen bg-[#080a0f] pb-28"
      style={pageSkyStyle}
    >
      <div className="mx-auto max-w-6xl space-y-4 px-3 pt-3 sm:space-y-5 sm:px-5 sm:pt-5">
        <header className="weather-surface-hero overflow-hidden rounded-[1.7rem] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-sky-300/25 bg-sky-300/10">
              <ShieldCheck
                className="h-5 w-5 text-sky-200"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                Bulletin d’audit · observations physiques
              </p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Fiabilité historique, vérifiée sur observations
              </h1>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400 sm:text-sm">
                Compare les prévisions archivées au temps réellement observé,
                modèle par modèle. Les mesures restent en unités physiques, avec
                leur horizon, leur période et leur niveau de preuve.
              </p>
            </div>
          </div>
        </header>

        <MeteoSurface
          tone="inset"
          as="section"
          className="rounded-2xl p-3 sm:p-4"
          aria-labelledby="evidence-controls-title"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="evidence-controls-title"
                  className="text-sm font-semibold text-slate-100"
                >
                  Fenêtre d’évidence et horizon
                </h2>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  Aucune échéance voisine ni période extérieure n’est utilisée
                  en repli.
                </p>
              </div>
              <span className="hidden shrink-0 rounded-full border border-slate-700/70 bg-slate-950/30 px-2.5 py-1 text-[9px] text-slate-500 sm:inline-flex">
                {locationName} · Europe/Paris
              </span>
            </div>
            <div>
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Période
              </p>
              <div
                className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-700/75 bg-slate-950/45 p-1 scrollbar-hide"
                role="group"
                aria-label="Période des métriques de fiabilité"
              >
                {PERIODS.map(choice => (
                  <button
                    type="button"
                    key={choice.id}
                    onClick={() => setPeriod(choice.id)}
                    aria-pressed={period === choice.id}
                    className={`min-h-9 shrink-0 rounded-xl px-3 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${period === choice.id ? "bg-sky-400/15 text-sky-100 ring-1 ring-sky-400/25" : "text-slate-400 hover:text-slate-100"}`}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Horizon comparé
              </p>
              <div
                className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide"
                role="group"
                aria-label="Horizon exact des métriques"
              >
                {HORIZONS.map(choice => (
                  <button
                    type="button"
                    key={choice.id}
                    onClick={() => setHorizon(choice.id)}
                    aria-pressed={horizon === choice.id}
                    className={`min-h-9 shrink-0 rounded-full border px-3 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${horizon === choice.id ? "border-sky-300/45 bg-sky-300/12 text-sky-100" : "border-slate-700/75 bg-slate-950/25 text-slate-400 hover:text-slate-100"}`}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </MeteoSurface>

        {data ? (
          <>
            <ReliabilityNotesSummary
              data={data}
              hourlyPoints={overviewData?.comparison24h ?? []}
              dailyPoints={overviewData?.comparison7d ?? []}
            />
            <VariableEvidenceSection
              rows={data.metrics as ReliabilityMetricRow[]}
              expectedModelCount={data.evidence.expectedModelCount}
              horizonArchived={Boolean(data.selectedHorizon?.storageBucket)}
              evidenceAvailable={
                data.evidence.status === "available" &&
                Boolean(data.selectedHorizon?.storageBucket)
              }
            />
          </>
        ) : (
          <DataUnavailableCard isError={isError} />
        )}

        <ReliabilityTrendChart
          hourlyPoints={overviewData?.comparison24h ?? []}
          dailyPoints={overviewData?.comparison7d ?? []}
          isLoading={overviewLoading}
          isError={overviewError}
        />

        {data ? (
          <>
            <HorizonEvidenceSection
              data={data}
              selectedHorizon={horizon}
              onSelectHorizon={setHorizon}
            />
            <LargestErrorsSection
              pairs={verificationPairs}
              isLoading={yesterdayLoading}
              isError={yesterdayError}
              emptyMessage={
                yesterdayData?.reason ??
                "Aucune paire complète ne peut être comparée pour hier."
              }
            />
            <ModelComparisonSection
              rows={data.metrics as ReliabilityMetricRow[]}
              selectedVariable={selectedVariable}
              onSelectVariable={setSelectedVariable}
            />
            <MethodologySection data={data} />
          </>
        ) : null}

        <details className="group rounded-2xl border border-slate-800/80 bg-slate-950/25 p-3.5 sm:p-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
            <span>Détail des comparaisons d’hier et de leurs sources</span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-3">
            <YesterdayVerificationPanel
              data={yesterdayData}
              locationName={locationName}
              isLoading={yesterdayLoading}
              isError={yesterdayError}
            />
          </div>
        </details>
      </div>
      <BackToTopButton />
    </main>
  );
}
