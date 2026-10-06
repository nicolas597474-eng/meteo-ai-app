import { useEffect, useMemo, useRef, useState } from "react";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { HourlyWeightingNotice } from "@/components/weather/HourlyWeightingNotice";
import { HourlySelectedDetailsPanel } from "@/components/weather/HourlySelectedDetailsPanel";
import { getModelCountCoverageLabel, getModelCountCoverageLevel } from "@shared/modelCoverageConfidence";
import { formatHourlyDisplay } from "@/lib/hourlyDisplay";
import { getWeatherLandscapeImage } from "@/lib/weatherImages";
import { buildHourlySelectedDetails } from "@/lib/hourlySelectedDetails";
import { HourlyMiniHistogram } from "@/components/weather/HourlyMiniHistogram";
import { buildHourlyHistogramSeries, getHourlyHistogramStartValidAt, type HourlyHistogramSeries, type IndexedHourlyHistogramHour } from "@/lib/hourlyMiniHistogram";
import {
  buildForecastDisplayDays,
  getDailyExtremesDisplayLabel,
  getDailyForecastDisplayMetrics,
  getDailyReferenceSourceLabels,
  getForecastDateKey,
  getNextForecastDateKey,
  OFFICIAL_FORECAST_TIME_ZONE,
  type DailyForecastPoint,
  type DailyForecastDisplayMetric,
  type ForecastDisplayDay,
} from "@/lib/forecastDayDisplay";
import {
  formatOptionalForecastValue,
  getInitialForecastTimelineSelection,
  getSelectedForecastHourIndex,
  groupOfficialHourlyForecastByDate,
  selectForecastHour,
  type ForecastTimelineSelection,
  type IndexedForecastHour,
} from "@/lib/forecastTimeline";
import type { DailyForecastEvidenceStatus, DailyOfficialFusionDisplay, DailyForecastSourceDiagnostic, DailyFusionMetricDiagnostic } from "@shared/dailyForecast";

type PrecipitationMetrics = {
  thresholdMm?: number | null;
  rainModelCount?: number | null;
  availableModelCount?: number | null;
};

type ForecastHour = {
  date?: string | null;
  hour?: string | null;
  validAt?: number | null;
  temp?: number | null;
  apparentTemp?: number | null;
  condition?: string | null;
  weatherCode?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  windGust?: number | null;
  windDirection?: number | null;
  humidity?: number | null;
  dewPoint?: number | null;
  cloudCover?: number | null;
  cloudLow?: number | null;
  cloudMid?: number | null;
  cloudHigh?: number | null;
  pressure?: number | null;
  uvIndex?: number | null;
  visibility?: number | null;
  solarRadiation?: number | null;
  precipType?: string | null;
  precipIntensity?: string | null;
  multiModelMetrics?: { source?: string; bestMatchIncluded?: boolean; expectedModelCount?: number; precipitation?: PrecipitationMetrics | null } | null;
};

type DetailRow = {
  key: string;
  time: string;
  value: string;
  note?: string;
  chartValue: number | null;
  chartValueLabel: string;
};
type DetailCategory = {
  key: string;
  title: string;
  icon: string;
  summary: string;
  unit: string;
  cadence: "hourly" | "daily";
  validAt?: number | null;
  rows: DetailRow[];
  hourlyHistogramSeries?: HourlyHistogramSeries<ForecastHour>[];
};

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function dateLabel(date: string, today: string, tomorrow: string): string {
  if (date === today) return "Aujourd’hui";
  if (date === tomorrow) return "Demain";
  return dateText(date);
}

function dateText(date: string): string {
  const value = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: OFFICIAL_FORECAST_TIME_ZONE,
  }).format(new Date(`${date}T12:00:00.000Z`));
  return value.length ? value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1) : value;
}

const CONDITION_LABELS: Record<string, string> = {
  sunny: "Ensoleillé", stable: "Temps stable", summer_heat: "Canicule",
  few_clouds: "Peu nuageux", partly_cloudy: "Partiellement nuageux", overcast: "Ciel couvert",
  cloudy: "Nuageux", cloud_cover: "Ciel couvert", variable: "Temps variable",
  showers: "Averses", rainy: "Pluie", heavy_rain: "Pluie forte", thunderstorm: "Orages",
  storm: "Tempête", snow: "Neige", freezing_rain: "Pluie verglaçante", sleet: "Neige fondue",
  frost: "Gel", deep_frost: "Gel intense", clear_night: "Ciel dégagé", fog: "Brouillard",
  wind_moderate: "Vent modéré", windy: "Vent fort",
};

const CONDITION_ICONS: Record<string, string> = {
  sunny: "sunny", stable: "sunny", summer_heat: "sunny", few_clouds: "few_clouds",
  partly_cloudy: "partly_cloudy", overcast: "overcast", cloudy: "overcast", cloud_cover: "overcast",
  variable: "variable", showers: "showers", rainy: "rainy", heavy_rain: "heavy_rain",
  thunderstorm: "thunderstorm", storm: "storm", snow: "snow", freezing_rain: "freezing_rain",
  sleet: "sleet", frost: "frost", deep_frost: "deep_frost", clear_night: "clear_night",
  fog: "fog", wind_moderate: "wind_moderate", windy: "windy",
};

function conditionDescription(condition: string | null | undefined): string {
  const sourceLabel = condition?.trim();
  if (!sourceLabel) return "";
  return CONDITION_LABELS[sourceLabel.toLowerCase()] ?? sourceLabel;
}

function conditionIconName(condition: string | null | undefined): string {
  const key = condition?.trim().toLowerCase() ?? "";
  if (CONDITION_ICONS[key]) return CONDITION_ICONS[key];
  if (/(soleil|ensoleill|dégagé|nuage|couvert|pluie|pluv|averse|bruine|orage|neige|brouillard|brume|vergla|vent|gel|givre|canicule|chaleur)/i.test(key)) {
    return getIconNameFromCondition(condition);
  }
  return "calendar";
}

function shortWeekday(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: OFFICIAL_FORECAST_TIME_ZONE })
    .format(new Date(`${date}T12:00:00.000Z`));
}

function windDirectionLabel(degrees: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return directions[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

function centerWithinHorizontalStrip(strip: HTMLDivElement | null, item: HTMLButtonElement | null) {
  if (!strip || !item) return;
  const stripBounds = strip.getBoundingClientRect();
  const itemBounds = item.getBoundingClientRect();
  const left = strip.scrollLeft + itemBounds.left - stripBounds.left - (strip.clientWidth - itemBounds.width) / 2;
  strip.scrollTo({ left, behavior: "smooth" });
}

function hourTime(entry: IndexedForecastHour<ForecastHour>, allHours: readonly ForecastHour[]): string {
  const display = formatHourlyDisplay(entry.hour, allHours);
  return `${display.hourLabel}${display.offsetLabel ? ` · ${display.offsetLabel}` : ""}`;
}

function formatUtcTimestamp(value: string | number | null | undefined): string {
  const timestamp = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return "indisponible";
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "indisponible";
}

function buildHourlyDetailCategories(
  entry: IndexedForecastHour<ForecastHour>,
  allHours: readonly ForecastHour[],
  indexedHours: readonly IndexedHourlyHistogramHour<ForecastHour>[],
  startValidAt: number | null,
): DetailCategory[] {
  return buildHourlySelectedDetails(entry.hour, hourTime(entry, allHours)).flatMap((detail) => {
    if (!detail.histogramCategory) return [];
    const hourlyHistogramSeries = buildHourlyHistogramSeries(detail.histogramCategory, indexedHours, startValidAt);
    if (hourlyHistogramSeries.length === 0) return [];
    return [{
      key: detail.histogramCategory,
      title: `Tendance · ${detail.title}`,
      icon: detail.icon,
      summary: detail.summary,
      unit: "",
      cadence: "hourly" as const,
      validAt: detail.validAt,
      rows: [{
        key: `${detail.key}-${entry.index}`,
        time: detail.timeLabel,
        value: detail.value,
        note: detail.note,
        chartValue: null,
        chartValueLabel: "—",
      }],
      hourlyHistogramSeries,
    }];
  });
}

function evidenceStatusLabel(status: DailyForecastEvidenceStatus): string {
  if (status === "CALIBRATED") return "preuves historiques qualifiées";
  if (status === "PARTIALLY_CALIBRATED") return "calibration historique partielle";
  if (status === "UNCALIBRATED_ROBUST") return "valeurs disponibles · pondération robuste non calibrée";
  return "aucune valeur disponible pour la calibration historique";
}

function diagnosticStatusLabel(diagnostic: DailyFusionMetricDiagnostic): string {
  if (diagnostic.availabilityStatus === "UNAVAILABLE" || diagnostic.contributingModelCount === 0) return "aucune valeur admissible reçue pour cette variable et cette validTime";
  if (diagnostic.availabilityStatus === "SINGLE_MODEL" || diagnostic.contributingModelCount === 1) return diagnostic.calibrationStatus === "CALIBRATED"
    ? "prévision single-model · preuve historique qualifiée"
    : "prévision single-model · valeur conservée avec calibration robuste non qualifiée";
  if (diagnostic.calibrationStatus === "CALIBRATED") return "fusion des modèles disponibles · preuves historiques qualifiées";
  if (diagnostic.calibrationStatus === "PARTIALLY_CALIBRATED") return "fusion des valeurs disponibles · calibration partielle et repli robuste";
  return "fusion robuste des valeurs disponibles · non calibrée historiquement";
}

function sourceAvailabilityTime(value: number | null): string {
  return value == null ? "heure indisponible" : new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris",
  }).format(value);
}

function sourceTraceDescription(source: DailyForecastSourceDiagnostic): string {
  const raw = source.rawWeight == null ? "poids brut indisponible" : `brut ${source.rawWeight.toFixed(3)}`;
  const fallback = source.robustFallbackWeight == null ? "" : ` · facteur robuste ${source.robustFallbackWeight.toFixed(3)}`;
  const horizon = source.horizonBucket ?? "horizon non classé";
  const run = source.runId ? ` · run ${source.runId}` : "";
  const evidence = source.comparisonCount == null ? "preuve non qualifiée" : `${source.comparisonCount} comparaisons / ${source.evaluatedDays ?? "?"} jours`;
  return `${source.modelName} · ${source.calibrationStatus} · poids final ${(source.finalWeight * 100).toFixed(1)} % (${raw}${fallback}) · disponible ${sourceAvailabilityTime(source.availableAt)} · validTime ${source.validTime == null ? "indisponible" : new Date(source.validTime).toISOString()} · ${horizon} · ${evidence}${run}`;
}

function biasDescription(source: DailyForecastSourceDiagnostic, unit: string): string {
  if (source.signedBias == null) return `${source.modelName} · biais signé indisponible`;
  const bias = source.signedBias.toLocaleString("fr-FR", { signDisplay: "always", maximumFractionDigits: 1 });
  const sample = source.sampleSize == null ? "n inconnu" : `n=${source.sampleSize} jours`;
  const comparisons = source.comparisonCount == null ? "comparaisons inconnues" : `${source.comparisonCount} comparaisons`;
  const freshness = source.latestScoreDate ? `dernier score ${source.latestScoreDate}` : "fraîcheur inconnue";
  return `${source.modelName} · biais signé ${bias}${unit} (${sample}, ${comparisons}, ${freshness})`;
}

function DailyFusionDiagnostics({ day, sourceLabels }: { day: DailyForecastPoint; sourceLabels: string[] }) {
  const fusion = day.officialFusion;
  if (!fusion) return <p className="pb-2 leading-relaxed">Provenance de fusion quotidienne indisponible.</p>;
  const variables: Array<{ label: string; key: keyof DailyOfficialFusionDisplay["sourcesByVariable"]; status: DailyForecastEvidenceStatus; unit: string }> = [
    { label: "Température maximale", key: "tempMax", status: fusion.calibrationStatus.tempMax, unit: "°C" },
    { label: "Température minimale", key: "tempMin", status: fusion.calibrationStatus.tempMin, unit: "°C" },
    { label: "Précipitations", key: "precipitation", status: fusion.calibrationStatus.precipitation, unit: " mm" },
    { label: "Vent maximal", key: "windSpeed", status: fusion.calibrationStatus.windSpeed, unit: " km/h" },
    { label: "Rafales maximales", key: "windGust", status: fusion.calibrationStatus.windGust, unit: " km/h" },
  ];
  const agreement = day.modelAgreement;
  const availability = agreement ? [
    `Tmax ${agreement.tempMax.availableModelCount}/${agreement.expectedModelCount}`,
    `Tmin ${agreement.tempMin.availableModelCount}/${agreement.expectedModelCount}`,
    `pluie ${agreement.precipitation.availableModelCount}/${agreement.expectedModelCount}`,
    `vent ${agreement.windSpeed.availableModelCount}/${agreement.expectedModelCount}`,
    `rafales ${agreement.windGust.availableModelCount}/${agreement.expectedModelCount}`,
  ].join(" · ") : "effectifs indisponibles";
  const reference = day.bestMatchReference;
  return (
    <div className="space-y-2 pb-3 leading-relaxed">
      <p>Availability → sélection par variable/validTime/horizon/run → fiabilité historique exacte si qualifiée → pondération robuste sinon → renormalisation → fusion. Chaque valeur admissible reste utilisable même sans preuve suffisante; aucun biais historique n’est appliqué aux valeurs futures.</p>
      <p>Émission de collecte : {fusion.issuedAt} · horizon : {fusion.horizonBucket ?? "indisponible"}.</p>
      <div className="space-y-1">
        {variables.map(({ label, key, status, unit }) => {
          const sources = fusion.sourcesByVariable[key];
          const diagnostic = fusion.diagnosticsByVariable?.[key];
          const contributingModelCount = diagnostic?.contributingModelCount
            ?? sources.filter((source) => source.finalWeight > 0).length;
          const coverageLevel = getModelCountCoverageLevel(contributingModelCount);
          const coverageLabel = getModelCountCoverageLabel(coverageLevel);
          const calibrationStatus = diagnostic?.calibrationStatus ?? status;
          return <div key={key} className="space-y-1">
            <p><strong className="text-slate-100">{label} :</strong> {diagnostic ? diagnosticStatusLabel(diagnostic) : evidenceStatusLabel(status)}{sources.length > 0 && <span className="block pl-2 text-slate-400">{sources.map(sourceTraceDescription).join("; ")}</span>}{sources.length > 0 && <span className="block pl-2 text-slate-400">{sources.map((source) => biasDescription(source, unit)).join("; ")}</span>}</p>
            <div className="pl-2 text-slate-400">
              <p><strong>Nombre de modèles contributeurs :</strong> {coverageLabel} ({contributingModelCount} modèle{contributingModelCount === 1 ? "" : "s"}). Cette couverture décrit uniquement l’effectif des modèles pour cette variable; elle n’évalue pas la couverture/qualité des observations physiques. Incertitude statistique : non mesurée dans cette vue. Statut de calibration historique, distinct : {calibrationStatus}.</p>
              {diagnostic && <div className="space-y-1">
              <p>Valeurs réellement disponibles : {diagnostic.availableValueModelCount} · preuves historiques qualifiées : {diagnostic.evidenceEligibleModelCount} · contributeurs effectifs : {diagnostic.contributingModelCount}. Catalogue de référence : {diagnostic.expectedModelCount} modèles; les absences hors portée ne sont pas des échecs et sont exclues des dénominateurs de scoring.</p>
              <p>{diagnostic.reason}</p>
              {diagnostic.availableModels.length > 0 && <p>Modèles avec valeur : {diagnostic.availableModels.join(", ")}.</p>}
              {diagnostic.modelReasons.length > 0 && <details className="mt-1">
                <summary className="cursor-pointer text-sky-100">Motif par modèle ({diagnostic.modelReasons.length})</summary>
                <ul className="list-inside list-disc pl-1">{diagnostic.modelReasons.map(({ modelName, reason: modelReason }) => <li key={`${key}-${modelName}`}>{modelName} — {modelReason}</li>)}</ul>
              </details>}
              </div>}
            </div>
          </div>;
        })}
      </div>
      <p>Les effectifs ci-dessus décrivent la couverture des valeurs et l’admissibilité au calcul; ils ne constituent ni une note de fiabilité ni un pourcentage de confiance. Une couverture plus faible peut être normale selon l’horizon du modèle.</p>
      <p>Biais historique signé (prévision − observation), diagnostic uniquement; une valeur positive indique une surestimation. Sans preuve qualifiée, le biais reste indisponible.</p>
      <p>Dispersion descriptive indisponible : l’heure exacte des runs modèles n’est pas fournie. Effectifs de valeurs reçues, sans assertion de comparabilité : {availability}. Aucun min/max, étendue ni écart-type n’est publié comme incertitude.</p>
      <div className="rounded-lg border border-sky-100/10 bg-black/15 p-2">
        <p className="font-semibold text-sky-100">Best Match · référence dérivée, non contributeur officiel</p>
        {reference ? <p>{formatOptionalForecastValue(reference.tempMax, 1, "°")} / {formatOptionalForecastValue(reference.tempMin, 1, "°")} · pluie {formatOptionalForecastValue(reference.precipitation, 1, " mm")} · vent {formatOptionalForecastValue(reference.windSpeed, 0, " km/h")} · rafales {formatOptionalForecastValue(reference.windGust, 0, " km/h")}</p> : <p>Référence non disponible pour cette date.</p>}
      </div>
      <p>Sources quotidiennes réellement reçues : {sourceLabels.length ? sourceLabels.join(" · ") : "aucune"}.</p>
    </div>
  );
}

function buildDailyDetailCategories(day: DailyForecastPoint): DetailCategory[] {
  const makeCategory = (key: string, title: string, icon: string, unit: string, value: string, chartValue: number | null, note?: string): DetailCategory => ({
    key, title, icon, summary: value || "—", unit, cadence: "daily",
    rows: value ? [{ key: `${key}-${day.date ?? "date"}`, time: "Journée", value, note, chartValue, chartValueLabel: chartValue == null ? "—" : `${chartValue}${unit ? ` ${unit}` : ""}` }] : [],
  });
  const categories: DetailCategory[] = [];
  if (isFiniteValue(day.precipitation)) {
    const consensus = day.precipitationConsensus;
    const hasCounts = isFiniteValue(consensus?.rainModelCount) && isFiniteValue(consensus?.availableModelCount);
    const note = hasCounts
      ? `${consensus.rainModelCount}/${consensus.availableModelCount} modèles au seuil${isFiniteValue(consensus.thresholdMm) ? ` ≥ ${formatOptionalForecastValue(consensus.thresholdMm, 1, " mm")}` : ""} · fréquence brute descriptive, pas une probabilité`
      : "Cumul quotidien issu de la fusion officielle pondérée par preuves qualifiées.";
    categories.push(makeCategory("precipitation", "Précipitations", "precipitation", "mm", formatOptionalForecastValue(day.precipitation, 1, " mm"), day.precipitation, note));
  }
  const windParts = [
    isFiniteValue(day.windSpeed) ? `Vent max. ${formatOptionalForecastValue(day.windSpeed, 0, " km/h")}` : null,
    isFiniteValue(day.windGust) ? `Rafales max. ${formatOptionalForecastValue(day.windGust, 0, " km/h")}` : null,
    isFiniteValue(day.windDirection) ? `Direction dominante ${windDirectionLabel(day.windDirection)}` : null,
  ].filter((value): value is string => value != null);
  if (windParts.length) categories.push(makeCategory("wind", "Vent", "wind_param", "km/h", windParts.join(" · "), isFiniteValue(day.windSpeed) ? day.windSpeed : null));
  const humidityParts = [
    isFiniteValue(day.humidity) ? `Humidité ${formatOptionalForecastValue(day.humidity, 0, "%")}` : null,
    isFiniteValue(day.cloudCover) ? `Nuages ${formatOptionalForecastValue(day.cloudCover, 0, "%")}` : null,
  ].filter((value): value is string => value != null);
  if (humidityParts.length) categories.push(makeCategory("humidity", "Humidité et nuages", "humidity", "%", humidityParts.join(" · "), isFiniteValue(day.humidity) ? day.humidity : isFiniteValue(day.cloudCover) ? day.cloudCover : null));
  if (isFiniteValue(day.uvIndex)) categories.push(makeCategory("uv", "Indice UV quotidien", "sunny", "indice", formatOptionalForecastValue(day.uvIndex, 1), day.uvIndex, "Valeur quotidienne disponible."));
  const feelsLikeParts = [
    isFiniteValue(day.feelsLikeMax) ? `Max. ${formatOptionalForecastValue(day.feelsLikeMax, 1, "°")}` : null,
    isFiniteValue(day.feelsLikeMin) ? `Min. ${formatOptionalForecastValue(day.feelsLikeMin, 1, "°")}` : null,
  ].filter((value): value is string => value != null);
  if (feelsLikeParts.length) categories.push(makeCategory("feels-like", "Température ressentie", "thermometer", "°C", feelsLikeParts.join(" · "), null));
  const sunParts = [day.sunrise ? `Lever ${day.sunrise}` : null, day.sunset ? `Coucher ${day.sunset}` : null].filter((value): value is string => value != null);
  if (sunParts.length) categories.push(makeCategory("sun", "Soleil", "sunny", "", sunParts.join(" · "), null));
  return categories.filter(({ rows }) => rows.length > 0);
}

function formatDailyMetricValue(metric: DailyForecastDisplayMetric): string {
  if (typeof metric.value === "number" && Number.isFinite(metric.value)) {
    const value = metric.value.toLocaleString("fr-FR", { maximumFractionDigits: metric.precision });
    return metric.key === "windDirection"
      ? `${windDirectionLabel(metric.value)} · ${value}°`
      : `${value}${metric.unit ? ` ${metric.unit}` : ""}`;
  }
  if (typeof metric.value === "string" && metric.value.trim()) {
    return metric.key === "condition" ? conditionDescription(metric.value) : metric.value.trim();
  }
  return "Indisponible dans le payload quotidien";
}

function dailyMetricSourceDescription(day: DailyForecastPoint, metric: DailyForecastDisplayMetric): string {
  if (!day.officialFusion) return "Provenance par métrique non fournie.";
  if (!metric.sourceKey) return "Aucune provenance par métrique n’est fournie pour ce champ.";
  const sources = day.officialFusion.sourcesByVariable[metric.sourceKey] ?? [];
  const names = Array.from(new Set(sources.map(({ modelName }) => modelName).filter(Boolean)));
  return names.length
    ? `Sources quotidiennes : ${names.join(" · ")}`
    : "Aucune source n’est indiquée pour ce champ dans les diagnostics disponibles.";
}

function DailyForecastMetricsPanel({ day, sourceLabels }: { day: DailyForecastPoint; sourceLabels: string[] }) {
  const metrics = getDailyForecastDisplayMetrics(day);
  const consensus = day.precipitationConsensus;
  const hasConsensusCounts = isFiniteValue(consensus?.rainModelCount)
    && isFiniteValue(consensus?.availableModelCount);
  const bestMatch = day.bestMatchReference;
  const formatReference = (value: number | null, unit: string, precision: number) =>
    isFiniteValue(value)
      ? `${value.toLocaleString("fr-FR", { maximumFractionDigits: precision })}${unit ? ` ${unit}` : ""}`
      : "Indisponible";

  return (
    <div className="space-y-2 border-t border-sky-100/10 py-3" aria-label={`Valeurs quotidiennes du ${day.date}`}>
      <div>
        <h3 className="text-xs font-semibold text-sky-100">Toutes les valeurs quotidiennes · {day.date}</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Champs du payload quotidien, dans le fuseau actuellement déclaré par le contrat ({OFFICIAL_FORECAST_TIME_ZONE}); le contrat ne fournit pas de fuseau propre à chaque lieu. Aucune mesure horaire n’est transformée en agrégat journalier.</p>
      </div>
      {day.officialFusion
        ? <p className="text-[10px] leading-relaxed text-slate-300">Métadonnées de fusion quotidienne présentes; les preuves et statuts sont détaillés dans « Provenance et disponibilité des champs ».</p>
        : <p className="text-[10px] leading-relaxed text-slate-300">Provenance quotidienne non fournie pour ces champs; aucune fusion ni calibration n’est affirmée.{sourceLabels.length ? ` Sources signalées sans attribution par métrique : ${sourceLabels.join(" · ")}.` : ""}</p>}
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {metrics.map((metric) => (
          <div key={metric.key} className="rounded-lg border border-sky-100/10 bg-black/15 p-2">
            <dt className="text-[10px] text-slate-400">{metric.label}</dt>
            <dd className="mt-0.5 break-words text-xs font-semibold tabular-nums text-slate-100">{formatDailyMetricValue(metric)}</dd>
            <p className="mt-0.5 break-words text-[9px] leading-relaxed text-slate-500">{dailyMetricSourceDescription(day, metric)}</p>
          </div>
        ))}
      </dl>
      {consensus && hasConsensusCounts && (
        <p className="text-[10px] leading-relaxed text-slate-300">Pluie annoncée par {consensus.rainModelCount}/{consensus.availableModelCount} modèles au seuil {isFiniteValue(consensus.thresholdMm) ? `≥ ${formatOptionalForecastValue(consensus.thresholdMm, 1, " mm")}` : "indisponible"} · fréquence brute descriptive, jamais une probabilité calibrée.</p>
      )}
      <p className="text-[10px] leading-relaxed text-slate-400">Non exposés dans le contrat quotidien actuel : pression, pluie/averses/neige séparées, probabilité de précipitations, couverture nuageuse par couche, durée d’ensoleillement, rayonnement et code météo quotidien. Le payload renvoie aussi sans valeur la direction du vent, la condition météo, l’indice UV et les ressentis quotidiens; ces champs restent indisponibles et ne sont pas reconstruits depuis l’horaire.</p>
      {bestMatch && (
        <div className="rounded-lg border border-sky-100/10 bg-black/15 p-2 text-[10px] leading-relaxed text-slate-300">
          <p className="font-semibold text-sky-100">{bestMatch.source} · référence dérivée distincte, non contributrice officielle</p>
          <p>Tmax {formatReference(bestMatch.tempMax, "°C", 1)} · Tmin {formatReference(bestMatch.tempMin, "°C", 1)} · précipitations {formatReference(bestMatch.precipitation, "mm", 1)} · vent max. {formatReference(bestMatch.windSpeed, "km/h", 0)} · rafales max. {formatReference(bestMatch.windGust, "km/h", 0)}.</p>
        </div>
      )}
    </div>
  );
}

function DayDetailsAccordion({ category, allHours = [] }: { category: DetailCategory; allHours?: readonly ForecastHour[] }) {
  const notes = category.rows.filter(({ note }) => Boolean(note));
  return (
    <details className="group border-t border-sky-100/10 first:border-t-0">
      <summary className="grid min-h-[4rem] cursor-pointer list-none grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 sm:flex sm:gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-300/10 text-cyan-100"><MeteoIcon name={category.icon} size={16} /></span>
        <span className="flex min-w-0 items-start justify-between gap-x-2 gap-y-1 sm:flex-1 sm:items-center">
          <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-slate-100">{category.title}</span>
          <span className="min-w-0 max-w-[62%] whitespace-normal break-words text-right text-xs leading-relaxed tabular-nums text-slate-300 sm:max-w-[58%]">{category.summary}</span>
          <span aria-hidden="true" className="shrink-0 text-xl leading-none text-sky-100/75 transition-transform group-open:rotate-180">⌄</span>
        </span>
      </summary>
      <div className="pb-4 pl-12 pr-1 sm:pl-14">
        {category.cadence === "hourly" ? (
          <>
            <div className="space-y-1 text-xs leading-relaxed text-slate-300">
              <p>Valeur de l’échéance sélectionnée · {category.rows[0]?.time ?? "heure indisponible"}.</p>
              <p className="break-words font-medium text-slate-100">{category.rows[0]?.value ?? "—"}</p>
              <p>validTime UTC : {formatUtcTimestamp(category.validAt)}</p>
            </div>
            {category.hourlyHistogramSeries?.map((series) => (
              <HourlyMiniHistogram
                key={series.field}
                categoryKey={category.key}
                series={series}
                allHours={allHours}
              />
            ))}
          </>
        ) : (
          <dl className="space-y-1 text-sm text-slate-100">
            {category.rows.map((row) => <div key={row.key} className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt className="text-slate-400">{row.time}</dt><dd className="text-right font-medium tabular-nums">{row.value}</dd></div>)}
          </dl>
        )}
        {notes.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-sky-100/10 pt-2 text-xs leading-relaxed text-slate-300">
            {notes.map((row) => <p key={row.key}>{row.time} · {row.note}</p>)}
            {category.key === "precipitation" && <p className="pt-1 text-sky-100">Les comptes de modèles décrivent une fréquence brute, jamais une probabilité de pluie calibrée.</p>}
          </div>
        )}
      </div>
    </details>
  );
}

function AirQualityAccordion() {
  return (
    <details className="group border-t border-sky-100/10">
      <summary className="flex min-h-[3.5rem] cursor-pointer list-none items-center gap-3 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-300/10 text-cyan-100"><MeteoIcon name="cloud_cover" size={16} /></span>
        <span className="min-w-0 flex-1 text-[14px] font-semibold text-slate-100">Qualité de l’air</span>
        <span className="text-xs text-slate-300">Non disponible</span>
        <span aria-hidden="true" className="ml-1 text-xl leading-none text-sky-100/75 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <p className="pb-4 pl-14 pr-2 text-xs leading-relaxed text-slate-300">L’indice de qualité de l’air ne fait pas partie des données renvoyées à cette page. Aucune valeur n’est demandée, déduite ou inventée.</p>
    </details>
  );
}

export function ForecastByDaySection({
  hours,
  dailyDays,
  dailySources,
  activeHourIndex,
  hourlyWeighting,
  officialProvenance,
}: {
  hours: ForecastHour[];
  dailyDays: DailyForecastPoint[];
  dailySources: string[];
  activeHourIndex: number;
  hourlyWeighting?: unknown;
  officialProvenance?: {
    source?: string | null;
    sourceKind?: string | null;
    computedAt?: string | null;
    hourlyComputedAt?: string | null;
  } | null;
}) {
  const grouped = useMemo(() => groupOfficialHourlyForecastByDate(hours), [hours]);
  const today = getForecastDateKey();
  const tomorrow = getNextForecastDateKey(today);
  const displayDays = useMemo(
    () => buildForecastDisplayDays(hours, dailyDays, 15, [today, tomorrow]),
    [hours, dailyDays, today, tomorrow],
  );
  const sourceLabels = useMemo(() => getDailyReferenceSourceLabels(dailySources), [dailySources]);
  const [selection, setSelection] = useState<ForecastTimelineSelection>({ dayDate: null, hourIndex: null, expanded: true });
  const selectedHourRef = useRef<HTMLButtonElement | null>(null);
  const selectedDayRef = useRef<HTMLButtonElement | null>(null);
  const hourStripRef = useRef<HTMLDivElement | null>(null);
  const dayStripRef = useRef<HTMLDivElement | null>(null);
  const indexedHours = useMemo(() => hours.map((hour, index) => ({ index, hour })), [hours]);
  const [clickedHistogramStartAt, setClickedHistogramStartAt] = useState<number | null>(null);
  const histogramStartValidAt = getHourlyHistogramStartValidAt(
    indexedHours,
    activeHourIndex,
    clickedHistogramStartAt,
    Date.now(),
  );
  const initialSelection = useMemo(
    () => getInitialForecastTimelineSelection(grouped.days, activeHourIndex),
    [grouped.days, activeHourIndex],
  );
  const initialDate = initialSelection.dayDate ?? displayDays[0]?.date ?? null;
  const selectedDay = displayDays.find(({ date }) => date === selection.dayDate)
    ?? displayDays.find(({ date }) => date === initialDate);
  const selectedDayDate = selectedDay?.date ?? null;
  const selectedGroup = selectedDay?.hourlyGroup ?? undefined;
  const selectedHourIndex = selectedGroup
    ? getSelectedForecastHourIndex(selection, selectedGroup, activeHourIndex)
    : null;
  const selectedEntry = selectedGroup?.hours.find(({ index }) => index === selectedHourIndex);
  const selectedDaily = selectedDay?.daily ?? null;
  const selectedDateIsTodayOrTomorrow = selectedDay?.date === today || selectedDay?.date === tomorrow;
  const detailCategories = selectedDay?.kind === "official-daily-fusion"
    ? selectedDaily ? buildDailyDetailCategories(selectedDaily) : []
    : [];
  const selectedHourlyDetails = selectedDay?.kind === "official-hourly" && selectedEntry
    ? buildHourlySelectedDetails(selectedEntry.hour, hourTime(selectedEntry, hours))
    : [];
  const hourlyDetailCategories = selectedDay?.kind === "official-hourly" && selectedEntry
    ? buildHourlyDetailCategories(selectedEntry, hours, indexedHours, histogramStartValidAt)
    : [];
  const selectedValidTimeUtc = formatUtcTimestamp(selectedEntry?.hour.validAt);
  const selectedSnapshotTimeUtc = formatUtcTimestamp(officialProvenance?.hourlyComputedAt ?? officialProvenance?.computedAt);
  const selectedSourceLabel = officialProvenance?.source === "open-meteo"
    ? "Open-Meteo"
    : officialProvenance?.source ?? "indisponible";
  const selectedMetrics = selectedEntry?.hour.multiModelMetrics;
  const selectedModelCount = selectedMetrics?.expectedModelCount;
  const selectedMethodLabel = selectedMetrics?.source === "official_seven_models" && selectedMetrics.bestMatchIncluded === false
    ? `Fusion officielle MeteoAI · ${isFiniteValue(selectedModelCount) ? `${selectedModelCount} modèle(s) disponible(s)` : "effectif indisponible"} · Best Match exclu`
    : "Prévision horaire officielle · provenance de fusion non détaillée";
  const selectedConditionSource = selectedEntry?.hour.condition?.trim() ?? selectedDaily?.condition?.trim() ?? "";
  const selectedCondition = conditionDescription(selectedConditionSource);
  const selectedConditionIcon = conditionIconName(selectedConditionSource);
  const sceneStyle = selectedConditionSource && selectedConditionIcon !== "calendar"
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(5, 20, 38, 0.54) 0%, rgba(5, 17, 33, 0.76) 52%, rgba(4, 13, 27, 0.92) 100%), url("${getWeatherLandscapeImage(selectedConditionSource)}")`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }
    : undefined;

  useEffect(() => {
    centerWithinHorizontalStrip(hourStripRef.current, selectedHourRef.current);
  }, [selectedGroup?.date, selectedHourIndex]);

  useEffect(() => {
    centerWithinHorizontalStrip(dayStripRef.current, selectedDayRef.current);
  }, [selectedDayDate]);

  const onDayPress = (day: ForecastDisplayDay<ForecastHour, DailyForecastPoint>) => {
    setClickedHistogramStartAt(null);
    const active = day.hourlyGroup?.hours.find(({ index }) => index === activeHourIndex);
    setSelection({ dayDate: day.date, hourIndex: active?.index ?? day.hourlyGroup?.hours[0]?.index ?? null, expanded: true });
  };
  const onHourPress = (index: number) => {
    if (!selectedGroup) return;
    const clickedHour = selectedGroup.hours.find((entry) => entry.index === index);
    setClickedHistogramStartAt(clickedHour?.hour.validAt ?? null);
    setSelection((previous) => selectForecastHour({
      dayDate: selectedGroup.date,
      hourIndex: previous.dayDate === selectedGroup.date ? previous.hourIndex : selectedHourIndex,
      expanded: true,
    }, selectedGroup, index));
  };

  return (
    <section aria-labelledby="forecast-by-day-title" className="min-w-0 w-full space-y-3">
      {selectedDay ? (
        <>
          <section
            aria-label={`Prévision ${selectedDay.kind === "official-hourly" ? "horaire officielle" : selectedDaily?.officialFusion ? "fusion quotidienne officielle" : "quotidienne"} du ${dateText(selectedDay.date)}`}
            className="relative min-w-0 overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-slate-50 shadow-[0_10px_32px_rgba(2,8,23,0.38)]"
            style={sceneStyle}
          >
            <div className="relative z-10 px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-100/80">
                    {selectedDay.kind === "official-hourly" ? "Prévision horaire officielle" : selectedDaily?.officialFusion ? "Fusion quotidienne officielle" : "Prévision quotidienne"}
                  </p>
                  <h2 id="forecast-by-day-title" className="mt-1 truncate text-lg font-semibold tracking-tight text-white">{dateLabel(selectedDay.date, today, tomorrow) || dateText(selectedDay.date)}</h2>
                </div>
                <span className="shrink-0 rounded-full border border-sky-200/25 bg-slate-950/45 px-2 py-1 text-[9px] font-semibold tracking-wide text-sky-100">MeteoAI</span>
              </div>

              <div className="mt-3 flex items-center gap-3 sm:gap-5">
                {selectedConditionIcon !== "calendar" && <div className="shrink-0 drop-shadow-md"><MeteoIcon name={selectedConditionIcon} size={56} /></div>}
                {selectedDay.kind === "official-hourly" ? (
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-100/75">{selectedEntry ? `Échéance ${hourTime(selectedEntry, hours)}` : "Température horaire"}</p>
                    <p className="mt-0.5 text-[2.8rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-5xl">{formatOptionalForecastValue(selectedEntry?.hour.temp, 1, "°")}</p>
                    {selectedDateIsTodayOrTomorrow && (
                      <p className="mt-1.5 text-[10px] leading-relaxed text-cyan-100">
                        {selectedDaily ? `Extrêmes quotidiens · ${getDailyExtremesDisplayLabel(selectedDaily)}` : "Extrêmes journaliers indisponibles"}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-100/75">{selectedDaily?.officialFusion ? "Max / Min · fusion quotidienne documentée" : "Max / Min quotidien"}</p>
                    <p className="mt-0.5 whitespace-nowrap text-[2rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-4xl">
                      {isFiniteValue(selectedDaily?.tempMax) && isFiniteValue(selectedDaily?.tempMin)
                        ? <>{formatOptionalForecastValue(selectedDaily.tempMax, 1, "°")}<span className="px-1 text-[0.72em] text-sky-100/80">/</span>{formatOptionalForecastValue(selectedDaily.tempMin, 1, "°")}</>
                        : getDailyExtremesDisplayLabel(selectedDaily)}
                    </p>
                  </div>
                )}
                <div className="max-w-[42%] shrink-0 text-right">
                  <p className="text-[13px] font-medium leading-snug text-slate-50">{selectedCondition || "Condition indisponible"}</p>
                  <p className="mt-2 text-[10px] text-slate-300">Ressenti</p>
                  <p className="text-sm font-semibold tabular-nums text-white">
                    {selectedDay.kind === "official-hourly"
                      ? formatOptionalForecastValue(selectedEntry?.hour.apparentTemp, 1, "°")
                      : [
                          isFiniteValue(selectedDaily?.feelsLikeMax) ? `Max ${formatOptionalForecastValue(selectedDaily.feelsLikeMax, 1, "°")}` : null,
                          isFiniteValue(selectedDaily?.feelsLikeMin) ? `Min ${formatOptionalForecastValue(selectedDaily.feelsLikeMin, 1, "°")}` : null,
                        ].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              </div>

              {selectedDay.kind === "official-hourly" && selectedEntry && (
                <HourlySelectedDetailsPanel
                  details={selectedHourlyDetails}
                  describeCondition={conditionDescription}
                  variant="summary"
                  heading={`Données météo de l’échéance sélectionnée · ${hourTime(selectedEntry, hours)}`}
                  provenance={`validTime UTC : ${selectedValidTimeUtc} · Source : ${selectedSourceLabel} · ${selectedMethodLabel} · Snapshot horaire calculé (UTC) : ${selectedSnapshotTimeUtc}`}
                />
              )}

              {selectedDay.kind === "official-daily-fusion" && selectedDaily?.officialFusion && (
                <div className="mt-3 border-t border-sky-100/15 pt-2.5" aria-label="Provenance de la fusion quotidienne">
                  <span className="inline-flex rounded-full border border-cyan-200/40 bg-cyan-300/10 px-2 py-1 text-[10px] font-bold text-cyan-100">Fusion officielle · preuves par variable</span>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-100">Les valeurs sans preuves qualifiées restent indisponibles. Les détails des poids, biais diagnostiques et limites de comparabilité sont ci-dessous.</p>
                </div>
              )}
            </div>

            <div className="relative z-10 border-y border-sky-100/15 bg-slate-950/25 py-2">
              {selectedGroup ? (
                <div ref={hourStripRef} role="group" aria-label="Heures de prévision défilables" className="flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain px-3 pb-0.5 scrollbar-hide touch-pan-x">
                  {selectedGroup.hours.map((entry) => {
                    const display = formatHourlyDisplay(entry.hour, hours);
                    const isHourSelected = entry.index === selectedHourIndex;
                    const isActiveForecast = entry.index === activeHourIndex;
                    const icon = conditionIconName(entry.hour.condition);
                    return (
                      <button
                        key={`${entry.hour.date ?? "date-absente"}-${entry.hour.hour ?? "heure-absente"}-${entry.index}`}
                        type="button"
                        ref={isHourSelected ? selectedHourRef : undefined}
                        aria-pressed={isHourSelected}
                        aria-label={`${display.dateLabel}, ${display.hourLabel}${display.offsetLabel ? `, ${display.offsetLabel}` : ""}, température ${formatOptionalForecastValue(entry.hour.temp, 0, "°")}${isActiveForecast ? ", prévision active" : ""}`}
                        onClick={() => onHourPress(entry.index)}
                        className={`forecast-hour-cell w-[3.45rem] shrink-0 snap-start rounded-xl border px-1 py-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 ${isHourSelected ? "border-cyan-200/75 bg-sky-300/15" : "border-transparent hover:bg-sky-200/[0.06]"}`}
                      >
                        <span className="block min-h-4 text-[12px] font-semibold tabular-nums text-white">{formatOptionalForecastValue(entry.hour.temp, 0, "°")}</span>
                        <MeteoIcon name={icon} size={19} />
                        <span className={`mt-0.5 block text-[10px] tabular-nums ${isHourSelected ? "text-cyan-100" : "text-slate-300"}`}>{display.hourLabel}</span>
                        {display.offsetLabel && <span className="block text-[9px] text-amber-200">{display.offsetLabel}</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="px-4 py-3 text-xs leading-relaxed text-slate-200">Aucune série horaire officielle disponible pour cette date. Les valeurs restent quotidiennes et ne sont pas déclinées heure par heure.</p>
              )}
            </div>
          </section>

          <div ref={dayStripRef} role="group" aria-label="Jours de prévision défilables" className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 scrollbar-hide touch-pan-x">
            {displayDays.map((day) => {
              const first = day.hourlyGroup?.hours[0]?.hour;
              const condition = day.daily?.condition ?? first?.condition;
              const isSelected = selectedDayDate === day.date;
              const hasDailyExtremes = isFiniteValue(day.daily?.tempMax) && isFiniteValue(day.daily?.tempMin);
              const temperatures = hasDailyExtremes
                ? `${formatOptionalForecastValue(day.daily?.tempMax, 1, "°")}/${formatOptionalForecastValue(day.daily?.tempMin, 1, "°")}`
                : getDailyExtremesDisplayLabel(day.daily);
              const dailySourceLabel = day.daily?.officialFusion
                ? "Fusion quotidienne officielle"
                : day.daily
                  ? "Données quotidiennes présentes"
                  : "Données quotidiennes indisponibles";
              const buttonLabel = `${day.kind === "official-hourly" ? "Prévision horaire officielle" : "Prévision quotidienne"} du ${dateText(day.date)}. ${dailySourceLabel}. ${getDailyExtremesDisplayLabel(day.daily)}. ${conditionDescription(condition) || "Condition indisponible"}.`;
              return (
                <button
                  key={day.date}
                  type="button"
                  ref={isSelected ? selectedDayRef : undefined}
                  aria-label={buttonLabel}
                  aria-pressed={isSelected}
                  onClick={() => onDayPress(day)}
                  className={`forecast-day-tile w-[4.25rem] shrink-0 snap-start rounded-2xl border px-1.5 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 ${isSelected ? "border-cyan-200/75 bg-sky-300/15 shadow-[0_0_0_1px_rgba(103,232,249,0.16)]" : "border-sky-100/10 bg-slate-950/35 hover:border-sky-200/25 hover:bg-sky-950/40"}`}
                >
                  <span className="block truncate text-[11px] font-medium text-slate-200">{shortWeekday(day.date)}</span>
                  <span className="my-1 flex justify-center"><MeteoIcon name={conditionIconName(condition)} size={20} /></span>
                  <span className="block min-h-7 whitespace-normal break-words text-[8px] font-semibold leading-tight tabular-nums text-slate-100">{temperatures}</span>
                  {day.daily && <span className="mt-1 block whitespace-nowrap text-[8px] font-bold text-cyan-100">{day.daily.officialFusion ? "Fusion" : "Quotidien"}</span>}
                </button>
              );
            })}
          </div>

          <section aria-label="Détails météo disponibles" className="rounded-2xl border border-sky-300/20 bg-slate-950/35 px-3">
            {selectedDay.kind === "official-hourly" ? (
              <>
                {selectedEntry ? (
                  <div className="space-y-1 border-b border-sky-100/10 py-3 text-[11px] leading-relaxed text-slate-300" aria-label="Validité et provenance de l’heure sélectionnée">
                    <p className="font-semibold text-sky-100">Valeurs pour l’échéance sélectionnée · {hourTime(selectedEntry, hours)}</p>
                    <p>validTime UTC : {selectedEntry.hour.validAt != null && selectedValidTimeUtc !== "indisponible" ? <time dateTime={selectedValidTimeUtc}>{selectedValidTimeUtc}</time> : "indisponible"}</p>
                    <p>Source : {selectedSourceLabel} · {selectedMethodLabel}.</p>
                    <p>Snapshot horaire calculé (UTC) : {selectedSnapshotTimeUtc}.</p>
                  </div>
                ) : <p className="border-b border-sky-100/10 py-3 text-xs text-slate-300">Aucune échéance horaire sélectionnée.</p>}
                <HourlySelectedDetailsPanel details={selectedHourlyDetails} describeCondition={conditionDescription} variant="details" />
                {hourlyDetailCategories.length > 0 && (
                  <details className="border-t border-sky-100/10 px-1 py-2">
                    <summary className="min-h-10 cursor-pointer list-none py-2 text-sm font-semibold text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80">
                      Tendances horaires des mesures
                    </summary>
                    <div className="space-y-1 pb-2">
                      {hourlyDetailCategories.map((category) => <DayDetailsAccordion key={category.key} category={category} allHours={hours} />)}
                    </div>
                  </details>
                )}
                {selectedDateIsTodayOrTomorrow && selectedDaily && <DailyForecastMetricsPanel day={selectedDaily} sourceLabels={sourceLabels} />}
                {selectedDateIsTodayOrTomorrow && !selectedDaily && (
                  <p className="border-t border-sky-100/10 py-3 text-xs leading-relaxed text-amber-100">Payload quotidien indisponible pour cette date : extrêmes journaliers et autres métriques quotidiennes indisponibles. Aucune valeur n’est déduite des heures.</p>
                )}
              </>
            ) : (
              <>
                {selectedDateIsTodayOrTomorrow && selectedDaily
                  ? <DailyForecastMetricsPanel day={selectedDaily} sourceLabels={sourceLabels} />
                  : detailCategories.map((category) => <DayDetailsAccordion key={category.key} category={category} />)}
                <AirQualityAccordion />
              </>
            )}
          </section>

          <details className="group px-1 text-xs text-slate-300">
            <summary className="min-h-10 cursor-pointer list-none py-2 font-medium text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80">Provenance et disponibilité des champs <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span></summary>
            {selectedDay.kind === "official-hourly" && (
              <>
                <p className="pb-2 leading-relaxed">Cette vue utilise uniquement la série horaire officielle à sept modèles, sans Best Match. Les variables sans valeur qualifiée restent indisponibles; les maxima/minima quotidiens ne sont pas reconstitués à partir d’un échantillon horaire incomplet.</p>
                <HourlyWeightingNotice weighting={hourlyWeighting as any} />
              </>
            )}
            {selectedDaily && (selectedDaily.officialFusion
              ? <DailyFusionDiagnostics day={selectedDaily} sourceLabels={sourceLabels} />
              : <p className="pb-2 leading-relaxed">Les métadonnées de provenance par variable ne sont pas fournies dans ce payload quotidien; aucune calibration ni fusion n’est affirmée.{sourceLabels.length ? ` Sources signalées sans attribution par métrique : ${sourceLabels.join(" · ")}.` : ""}</p>)}
            {selectedDay.kind === "official-daily-fusion" && !selectedDaily && <p className="pb-2 leading-relaxed">Payload quotidien indisponible pour cette date.</p>}
          </details>
        </>
      ) : (
        <div className="rounded-2xl border border-sky-300/25 bg-slate-900/75 px-4 py-5 text-sm leading-relaxed text-slate-200" role="status">
          <h2 id="forecast-by-day-title" className="font-semibold text-white">Prévisions</h2>
          <p className="mt-2">Aucune échéance datée n’est disponible dans la série horaire officielle ni dans la fusion quotidienne officielle.</p>
          {grouped.undatedHours > 0 && <p className="mt-1 text-amber-100">{grouped.undatedHours} échéance(s) sans date locale explicite n’ont pas été regroupées; aucune date n’a été déduite de l’horodatage UTC.</p>}
        </div>
      )}
      {displayDays.length > 0 && grouped.undatedHours > 0 && <p className="px-1 text-xs text-amber-100/90">{grouped.undatedHours} échéance(s) sans date locale explicite ne sont pas affichées dans les bandes.</p>}
    </section>
  );
}
