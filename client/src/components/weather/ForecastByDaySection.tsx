import { useEffect, useMemo, useRef, useState } from "react";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { HourlyWeightingNotice } from "@/components/weather/HourlyWeightingNotice";
import { getModelCountCoverageLabel, getModelCountCoverageLevel } from "@shared/modelCoverageConfidence";
import { dailyConditionFromWmoWeatherCode } from "@shared/dailyWeatherCode";
import { formatHourlyDisplay } from "@/lib/hourlyDisplay";
import { getDailyWeatherCodeIconName } from "@/lib/dailyWeatherIcon";
import { getWeatherLandscapeImage } from "@/lib/weatherImages";
import { buildHourlySelectedDetails } from "@/lib/hourlySelectedDetails";
import { filterDailyMetricsForOfficialHourlyCard, filterOfficialHourlyCardDetails, findNextOfficialHourlyConditionChange, getOfficialHourlyCondition } from "@/lib/officialHourlyCard";
import { getExtremeTemperatureTone } from "@/lib/extremeTemperatureTone";
import { getTemperatureTone } from "@/lib/chartTemperatureTone";
import { HourlyMiniHistogram } from "@/components/weather/HourlyMiniHistogram";
import { buildHourlyHistogramSeries, getHourlyHistogramStartValidAt, HOURLY_HISTOGRAM_PALETTE, type HourlyHistogramCategoryKey, type HourlyHistogramSeries, type IndexedHourlyHistogramHour } from "@/lib/hourlyMiniHistogram";
import {
  buildForecastDisplayDays,
  formatDailyTemperature,
  getDailyExtremesDisplayLabel,
  getDailyForecastDisplayMetrics,
  getDailyReferenceSourceLabels,
  isSnowWmoWeatherCode,
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
import type { HourlyFallbackProvenance, OpenWeatherFallbackField } from "@shared/hourlyFallbackProvenance";
import { useProvenanceDisplay } from "@/contexts/ProvenanceDisplayContext";

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
  precipitationComponents?: Array<{ modelName: string; rain: number | null; showers: number | null; snowfall: number | null }> | null;
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
  fallbackProvenance?: HourlyFallbackProvenance;
  multiModelMetrics?: { source?: string; bestMatchIncluded?: boolean; expectedModelCount?: number; precipitation?: PrecipitationMetrics | null } | null;
};

type DetailRow = {
  key: string;
  time?: string;
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
  /** Classe Tailwind du code couleur adaptée à l'intensité de la valeur (cadence horaire). */
  valueTone?: string;
};

function relativeForecastAge(value: string | null | undefined): string {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return "Ã¢ge indisponible";
  const elapsedMs = Date.now() - timestamp;
  if (elapsedMs < 0) return "horodatage futur";
  if (elapsedMs < 60_000) return "Ã  lâinstant";
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function dateLabel(date: string, today: string, tomorrow: string): string {
  if (date === today) return "Aujourdâhui";
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
  sunny: "EnsoleillÃ©", stable: "Temps stable", summer_heat: "Canicule",
  few_clouds: "Peu nuageux", partly_cloudy: "Partiellement nuageux", overcast: "Ciel couvert",
  cloudy: "Nuageux", cloud_cover: "Ciel couvert", variable: "Temps variable",
  showers: "Averses", rainy: "Pluie", heavy_rain: "Pluie forte", thunderstorm: "Orages",
  storm: "TempÃªte", snow: "Neige", freezing_rain: "Pluie verglaÃ§ante", sleet: "Neige fondue",
  frost: "Gel", deep_frost: "Gel intense", clear_night: "Ciel dÃ©gagÃ©", fog: "Brouillard",
  wind_moderate: "Vent modÃ©rÃ©", windy: "Vent fort",
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
  if (/(soleil|ensoleill|dÃ©gagÃ©|nuage|couvert|pluie|pluv|averse|bruine|orage|neige|brouillard|brume|vergla|vent|gel|givre|canicule|chaleur)/i.test(key)) {
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
  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  strip.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
}

function hourTime(entry: IndexedForecastHour<ForecastHour>, allHours: readonly ForecastHour[]): string {
  const display = formatHourlyDisplay(entry.hour, allHours);
  return `${display.hourLabel}${display.offsetLabel ? ` Â· ${display.offsetLabel}` : ""}`;
}

function formatUtcTimestamp(value: string | number | null | undefined): string {
  const timestamp = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return "indisponible";
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "indisponible";
}

function formatForecastFreshness(value: string | null | undefined): { iso: string; label: string } | null {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris",
    }).format(date),
  };
}

const CATEGORY_PALETTE_KEYS: Record<string, HourlyHistogramCategoryKey> = {
  "precip-type": "precipitation",
  "feels-like": "apparent",
  sun: "uv",
};

function getCategoryPalette(categoryKey: string) {
  const paletteKey = CATEGORY_PALETTE_KEYS[categoryKey] ?? categoryKey as HourlyHistogramCategoryKey;
  return HOURLY_HISTOGRAM_PALETTE[paletteKey];
}

function buildHourlyDetailCategories(
  entry: IndexedForecastHour<ForecastHour>,
  allHours: readonly ForecastHour[],
  indexedHours: readonly IndexedHourlyHistogramHour<ForecastHour>[],
  startValidAt: number | null,
): DetailCategory[] {
  return buildHourlySelectedDetails(entry.hour).map((detail) => ({
    key: detail.key,
    title: detail.title,
    icon: detail.icon,
    summary: detail.summary,
    unit: "",
    cadence: "hourly",
    valueTone: detail.valueTone,
    validAt: detail.validAt,
    rows: [{
      key: `${detail.key}-${entry.index}`,
      value: detail.value,
      note: detail.note,
      chartValue: null,
      chartValueLabel: "â",
    }],
    hourlyHistogramSeries: buildHourlyHistogramSeries(detail.key, indexedHours, startValidAt),
  }));
}

function evidenceStatusLabel(status: DailyForecastEvidenceStatus): string {
  if (status === "CALIBRATED") return "preuves historiques qualifiÃ©es";
  if (status === "PARTIALLY_CALIBRATED") return "calibration historique partielle";
  if (status === "UNCALIBRATED_ROBUST") return "valeurs disponibles Â· pondÃ©ration robuste non calibrÃ©e";
  return "aucune valeur disponible pour la calibration historique";
}

function diagnosticStatusLabel(diagnostic: DailyFusionMetricDiagnostic): string {
  if (diagnostic.availabilityStatus === "UNAVAILABLE" || diagnostic.contributingModelCount === 0) return "aucune valeur admissible reÃ§ue pour cette variable et cette validTime";
  if (diagnostic.availabilityStatus === "SINGLE_MODEL" || diagnostic.contributingModelCount === 1) return diagnostic.calibrationStatus === "CALIBRATED"
    ? "prÃ©vision single-model Â· preuve historique qualifiÃ©e"
    : "prÃ©vision single-model Â· valeur conservÃ©e avec calibration robuste non qualifiÃ©e";
  if (diagnostic.calibrationStatus === "CALIBRATED") return "fusion des modÃ¨les disponibles Â· preuves historiques qualifiÃ©es";
  if (diagnostic.calibrationStatus === "PARTIALLY_CALIBRATED") return "fusion des valeurs disponibles Â· calibration partielle et repli robuste";
  return "fusion robuste des valeurs disponibles Â· non calibrÃ©e historiquement";
}

function sourceAvailabilityTime(value: number | null): string {
  return value == null ? "heure indisponible" : new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris",
  }).format(value);
}

function sourceTraceDescription(source: DailyForecastSourceDiagnostic): string {
  const raw = source.rawWeight == null ? "poids brut indisponible" : `brut ${source.rawWeight.toFixed(3)}`;
  const fallback = source.robustFallbackWeight == null ? "" : ` Â· facteur robuste ${source.robustFallbackWeight.toFixed(3)}`;
  const horizon = source.horizonBucket ?? "horizon non classÃ©";
  const run = source.runId ? ` Â· run ${source.runId}` : "";
  const evidence = source.comparisonCount == null ? "preuve non qualifiÃ©e" : `${source.comparisonCount} comparaisons / ${source.evaluatedDays ?? "?"} jours`;
  return `${source.modelName} Â· ${source.calibrationStatus} Â· poids final ${(source.finalWeight * 100).toFixed(1)} % (${raw}${fallback}) Â· disponible ${sourceAvailabilityTime(source.availableAt)} Â· validTime ${source.validTime == null ? "indisponible" : new Date(source.validTime).toISOString()} Â· ${horizon} Â· ${evidence}${run}`;
}

function biasDescription(source: DailyForecastSourceDiagnostic, unit: string): string {
  if (source.signedBias == null) return `${source.modelName} Â· biais signÃ© indisponible`;
  const bias = source.signedBias.toLocaleString("fr-FR", { signDisplay: "always", maximumFractionDigits: 1 });
  const sample = source.sampleSize == null ? "n inconnu" : `n=${source.sampleSize} jours`;
  const comparisons = source.comparisonCount == null ? "comparaisons inconnues" : `${source.comparisonCount} comparaisons`;
  const freshness = source.latestScoreDate ? `dernier score ${source.latestScoreDate}` : "fraÃ®cheur inconnue";
  return `${source.modelName} Â· biais signÃ© ${bias}${unit} (${sample}, ${comparisons}, ${freshness})`;
}

function DailyFusionDiagnostics({ day, sourceLabels }: { day: DailyForecastPoint; sourceLabels: string[] }) {
  const fusion = day.officialFusion;
  if (!fusion) return <p className="pb-2 leading-relaxed">Provenance de fusion quotidienne indisponible.</p>;
  const variables: Array<{ label: string; key: keyof DailyOfficialFusionDisplay["sourcesByVariable"]; status: DailyForecastEvidenceStatus; unit: string }> = [
    { label: "TempÃ©rature maximale", key: "tempMax", status: fusion.calibrationStatus.tempMax, unit: "Â°C" },
    { label: "TempÃ©rature minimale", key: "tempMin", status: fusion.calibrationStatus.tempMin, unit: "Â°C" },
    { label: "PrÃ©cipitations", key: "precipitation", status: fusion.calibrationStatus.precipitation, unit: " mm" },
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
  ].join(" Â· ") : "effectifs indisponibles";
  const reference = day.bestMatchReference;
  return (
    <div className="space-y-2 pb-3 leading-relaxed">
      <p>Availability â sÃ©lection par variable/validTime/horizon/run â fiabilitÃ© historique exacte si qualifiÃ©e â pondÃ©ration robuste sinon â renormalisation â fusion. Chaque valeur admissible reste utilisable mÃªme sans preuve suffisante; aucun biais historique nâest appliquÃ© aux valeurs futures.</p>
      <p>Ãmission de collecte : {fusion.issuedAt} Â· horizon : {fusion.horizonBucket ?? "indisponible"}.</p>
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
              <p><strong>Nombre de modÃ¨les contributeurs :</strong> {coverageLabel} ({contributingModelCount} modÃ¨le{contributingModelCount === 1 ? "" : "s"}). Cette couverture dÃ©crit uniquement lâeffectif des modÃ¨les pour cette variable; elle nâÃ©value pas la couverture/qualitÃ© des observations physiques. Incertitude statistique : non mesurÃ©e dans cette vue. Statut de calibration historique, distinct : {calibrationStatus}.</p>
              {diagnostic && <div className="space-y-1">
              <p>Valeurs rÃ©ellement disponibles : {diagnostic.availableValueModelCount} Â· preuves historiques qualifiÃ©es : {diagnostic.evidenceEligibleModelCount} Â· contributeurs effectifs : {diagnostic.contributingModelCount}. Catalogue de rÃ©fÃ©rence : {diagnostic.expectedModelCount} modÃ¨les; les absences hors portÃ©e ne sont pas des Ã©checs et sont exclues des dÃ©nominateurs de scoring.</p>
              <p>{diagnostic.reason}</p>
              {diagnostic.availableModels.length > 0 && <p>ModÃ¨les avec valeur : {diagnostic.availableModels.join(", ")}.</p>}
              {diagnostic.modelReasons.length > 0 && <details className="mt-1">
                <summary className="cursor-pointer text-sky-100">Motif par modÃ¨le ({diagnostic.modelReasons.length})</summary>
                <ul className="list-inside list-disc pl-1">{diagnostic.modelReasons.map(({ modelName, reason: modelReason }) => <li key={`${key}-${modelName}`}>{modelName} â {modelReason}</li>)}</ul>
              </details>}
              </div>}
            </div>
          </div>;
        })}
      </div>
      <p>Les effectifs ci-dessus dÃ©crivent la couverture des valeurs et lâadmissibilitÃ© au calcul; ils ne constituent ni une note de fiabilitÃ© ni un pourcentage de confiance. Une couverture plus faible peut Ãªtre normale selon lâhorizon du modÃ¨le.</p>
      <p>Biais historique signÃ© (prÃ©vision â observation), diagnostic uniquement; une valeur positive indique une surestimation. Sans preuve qualifiÃ©e, le biais reste indisponible.</p>
      <p>Dispersion descriptive indisponible : lâheure exacte des runs modÃ¨les nâest pas fournie. Effectifs de valeurs reÃ§ues, sans assertion de comparabilitÃ© : {availability}. Aucun min/max, Ã©tendue ni Ã©cart-type nâest publiÃ© comme incertitude.</p>
      <div className="rounded-lg border border-sky-100/10 bg-black/15 p-2">
        <p className="font-semibold text-sky-100">Best Match Â· rÃ©fÃ©rence dÃ©rivÃ©e, non contributeur officiel</p>
        {reference ? <p>{formatOptionalForecastValue(reference.tempMax, 1, "Â°")} / {formatOptionalForecastValue(reference.tempMin, 1, "Â°")} Â· pluie {formatOptionalForecastValue(reference.precipitation, 1, " mm")} Â· vent {formatOptionalForecastValue(reference.windSpeed, 0, " km/h")} Â· rafales {formatOptionalForecastValue(reference.windGust, 0, " km/h")}</p> : <p>RÃ©fÃ©rence non disponible pour cette date.</p>}
      </div>
      <p>Sources quotidiennes rÃ©ellement reÃ§ues : {sourceLabels.length ? sourceLabels.join(" Â· ") : "aucune"}.</p>
    </div>
  );
}

function buildDailyDetailCategories(day: DailyForecastPoint): DetailCategory[] {
  const makeCategory = (key: string, title: string, icon: string, unit: string, value: string, chartValue: number | null, note?: string): DetailCategory => ({
    key, title, icon, summary: value || "â", unit, cadence: "daily",
    rows: value ? [{ key: `${key}-${day.date ?? "date"}`, time: "JournÃ©e", value, note, chartValue, chartValueLabel: chartValue == null ? "â" : `${chartValue}${unit ? ` ${unit}` : ""}` }] : [],
  });
  const categories: DetailCategory[] = [];
  if (isSnowWmoWeatherCode(day.weatherCode)) {
    categories.push(makeCategory(
      "snowfall",
      "Neige",
      "snow",
      "",
      "Neige prÃ©vue",
      null,
      "Code WMO quotidien valide indiquant de la neige; aucune quantitÃ© quotidienne de neige nâest fournie."
    ));
  }
  if (isFiniteValue(day.precipitation)) {
    const consensus = day.precipitationConsensus;
    const hasCounts = isFiniteValue(consensus?.rainModelCount) && isFiniteValue(consensus?.availableModelCount);
    const note = hasCounts
      ? `${consensus.rainModelCount}/${consensus.availableModelCount} modÃ¨les au seuil${isFiniteValue(consensus.thresholdMm) ? ` â¥ ${formatOptionalForecastValue(consensus.thresholdMm, 1, " mm")}` : ""} Â· frÃ©quence brute descriptive, pas une probabilitÃ©`
      : "Cumul quotidien issu de la fusion officielle pondÃ©rÃ©e par preuves qualifiÃ©es.";
    categories.push(makeCategory("precipitation", "PrÃ©cipitations", "precipitation", "mm", formatOptionalForecastValue(day.precipitation, 1, " mm"), day.precipitation, note));
  }
  const windParts = [
    isFiniteValue(day.windSpeed) ? `Vent max. ${formatOptionalForecastValue(day.windSpeed, 0, " km/h")}` : null,
    isFiniteValue(day.windGust) ? `Rafales max. ${formatOptionalForecastValue(day.windGust, 0, " km/h")}` : null,
    isFiniteValue(day.windDirection) ? `Direction dominante ${windDirectionLabel(day.windDirection)}` : null,
  ].filter((value): value is string => value != null);
  if (windParts.length) categories.push(makeCategory("wind", "Vent", "wind_param", "km/h", windParts.join(" Â· "), isFiniteValue(day.windSpeed) ? day.windSpeed : null));
  const humidityParts = [
    isFiniteValue(day.humidity) ? `HumiditÃ© ${formatOptionalForecastValue(day.humidity, 0, "%")}` : null,
    isFiniteValue(day.cloudCover) ? `Nuages ${formatOptionalForecastValue(day.cloudCover, 0, "%")}` : null,
  ].filter((value): value is string => value != null);
  if (humidityParts.length) categories.push(makeCategory("humidity", "HumiditÃ© et nuages", "humidity", "%", humidityParts.join(" Â· "), isFiniteValue(day.humidity) ? day.humidity : isFiniteValue(day.cloudCover) ? day.cloudCover : null));
  if (isFiniteValue(day.uvIndex)) categories.push(makeCategory("uv", "Indice UV quotidien", "sunny", "indice", formatOptionalForecastValue(day.uvIndex, 1), day.uvIndex, "Valeur quotidienne disponible."));
  const feelsLikeParts = [
    isFiniteValue(day.feelsLikeMax) ? `Max. ${formatOptionalForecastValue(day.feelsLikeMax, 1, "Â°")}` : null,
    isFiniteValue(day.feelsLikeMin) ? `Min. ${formatOptionalForecastValue(day.feelsLikeMin, 1, "Â°")}` : null,
  ].filter((value): value is string => value != null);
  if (feelsLikeParts.length) categories.push(makeCategory("feels-like", "TempÃ©rature ressentie", "thermometer", "Â°C", feelsLikeParts.join(" Â· "), null));
  const sunParts = [day.sunrise ? `Lever ${day.sunrise}` : null, day.sunset ? `Coucher ${day.sunset}` : null].filter((value): value is string => value != null);
  if (sunParts.length) categories.push(makeCategory("sun", "Soleil", "sunny", "", sunParts.join(" Â· "), null));
  return categories.filter(({ rows }) => rows.length > 0);
}

function formatDailyMetricValue(metric: DailyForecastDisplayMetric): string {
  if (typeof metric.value === "number" && Number.isFinite(metric.value)) {
    const value = metric.value.toLocaleString("fr-FR", { maximumFractionDigits: metric.precision });
    return metric.key === "windDirection"
      ? `${windDirectionLabel(metric.value)} Â· ${value}Â°`
      : `${value}${metric.unit ? ` ${metric.unit}` : ""}`;
  }
  if (typeof metric.value === "string" && metric.value.trim()) {
    return metric.key === "condition" ? conditionDescription(metric.value) : metric.value.trim();
  }
  return "Indisponible dans le payload quotidien";
}

function dailyMetricSourceDescription(day: DailyForecastPoint, metric: DailyForecastDisplayMetric): string {
  if (metric.key === "condition" || metric.key === "weatherCode") {
    const summary = day.weatherCodeSummary;
    if (!summary) return "Aucune preuve quotidienne du code WMO nâest jointe Ã  ce champ.";
    if (metric.key === "condition") {
      return summary.condition
        ? `LibellÃ© dÃ©rivÃ© du code WMO quotidien ${summary.weatherCode}; dÃ©tail des modÃ¨les et horodatages dans Â« Code mÃ©tÃ©o WMO quotidien Â». ${summary.reason}`
        : summary.reason;
    }
    const statusLabels: Record<string, string> = {
      valid: "code reÃ§u",
      provider_null: "valeur nulle fournisseur",
      field_missing: "variable absente de la rÃ©ponse",
      invalid_value: "valeur invalide",
      request_failed: "requÃªte indisponible",
      date_missing: "date absente de la rÃ©ponse",
      duplicate_date: "date dupliquÃ©e, valeur Ã©cartÃ©e",
      time_mismatch: "validTime diffÃ©rent, valeur Ã©cartÃ©e",
      duplicate_conflict: "doublon contradictoire, valeur Ã©cartÃ©e",
    };
    const modelDetails = summary.modelCodes.map((source) => {
      const value = source.valueStatus === "valid" ? `WMO ${source.weatherCode}` : statusLabels[source.valueStatus] ?? source.valueStatus;
      const receivedAt = source.availableAt == null ? "rÃ©ception inconnue" : `reÃ§u ${new Date(source.availableAt).toISOString()}`;
      const requestedAt = source.requestStartedAt == null ? "requÃªte inconnue" : `requÃªte ${new Date(source.requestStartedAt).toISOString()}`;
      const delivery = source.deliveryMode === "cache" ? "cache (0 tentative rÃ©seau)" : source.deliveryMode === "network" ? `rÃ©seau (${source.networkAttemptCount} tentative(s))` : "transport inconnu";
      const sourceValidTime = source.validTime == null ? "validTime indisponible" : `validTime UTC ${new Date(source.validTime).toISOString()}`;
      const run = source.runId ? ` Â· run ${source.runId}` : "";
      return `${source.modelName} (${source.modelId}): ${value}, ${requestedAt}, ${receivedAt}, ${delivery}, ${sourceValidTime}${run}`;
    }).join("; ");
    const validTime = summary.validTime == null ? "validTime indisponible" : `validTime UTC ${new Date(summary.validTime).toISOString()}`;
    return `ValiditÃ© : ${summary.validDate} (${summary.timeZone}; ${validTime}); assemblÃ© ${summary.computedAt}. ${summary.reason} Provenance par modÃ¨le : ${modelDetails}. Best Match est exclu; cette frÃ©quence descriptive nâest pas calibrÃ©e. Les horodatages dÃ©crivent le service de la rÃ©ponse (rÃ©seau/cache), pas lâheure du run amont.`;
  }
  if (["windDirection", "uvIndex", "feelsLikeMax", "feelsLikeMin"].includes(metric.key)) {
    return day.bestMatchReference
      ? `${day.bestMatchReference.source} Â· rÃ©fÃ©rence dÃ©rivÃ©e distincte, non contributrice officielle.`
      : "RÃ©fÃ©rence Best Match absente; aucune valeur nâest dÃ©duite ou remplacÃ©e.";
  }
  if (!day.officialFusion) return "Provenance par mÃ©trique non fournie.";
  if (!metric.sourceKey) return "Aucune provenance par mÃ©trique nâest fournie pour ce champ.";
  const sources = day.officialFusion.sourcesByVariable[metric.sourceKey] ?? [];
  const names = Array.from(new Set(sources.map(({ modelName }) => modelName).filter(Boolean)));
  return names.length
    ? `Sources quotidiennes : ${names.join(" Â· ")}`
    : "Aucune source nâest indiquÃ©e pour ce champ dans les diagnostics disponibles.";
}

function DailyForecastMetricsPanel({ day, sourceLabels, excludeDailyConditionAndCode = false }: { day: DailyForecastPoint; sourceLabels: string[]; excludeDailyConditionAndCode?: boolean }) {
  const dailyMetrics = getDailyForecastDisplayMetrics(day);
  const metrics = excludeDailyConditionAndCode ? filterDailyMetricsForOfficialHourlyCard(dailyMetrics) : dailyMetrics;
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
        <h3 className="text-xs font-semibold text-sky-100">{excludeDailyConditionAndCode ? "MÃ©triques quotidiennes Â· Ã©tat horaire conservÃ© sÃ©parÃ©ment" : "Toutes les valeurs quotidiennes"} Â· {day.date}</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Champs du payload quotidien, dans le fuseau actuellement dÃ©clarÃ© par le contrat ({OFFICIAL_FORECAST_TIME_ZONE}); le contrat ne fournit pas de fuseau propre Ã  chaque lieu. Aucune mesure horaire nâest transformÃ©e en agrÃ©gat journalier.</p>
      </div>
      {day.officialFusion
        ? <p className="text-[10px] leading-relaxed text-slate-300">MÃ©tadonnÃ©es de fusion quotidienne prÃ©sentes; les preuves et statuts sont dÃ©taillÃ©s dans Â« Provenance et disponibilitÃ© des champs Â».</p>
        : <p className="text-[10px] leading-relaxed text-slate-300">Provenance quotidienne non fournie pour ces champs; aucune fusion ni calibration nâest affirmÃ©e.{sourceLabels.length ? ` Sources signalÃ©es sans attribution par mÃ©trique : ${sourceLabels.join(" Â· ")}.` : ""}</p>}
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {metrics.map((metric) => (
          <div key={metric.key} className="rounded-lg border border-sky-100/10 bg-black/15 p-2">
            <dt className="text-[10px] text-slate-400">{metric.label}</dt>
            <dd className="mt-0.5 break-words text-xs font-semibold tabular-nums text-slate-100">{metric.key === "weatherCode" && metric.value == null ? day.weatherCodeSummary?.reason ?? formatDailyMetricValue(metric) : formatDailyMetricValue(metric)}</dd>
            <p className="mt-0.5 break-words text-[9px] leading-relaxed text-slate-500">{dailyMetricSourceDescription(day, metric)}</p>
          </div>
        ))}
      </dl>
      {excludeDailyConditionAndCode && isSnowWmoWeatherCode(day.weatherCode) && (
        <div aria-label="Neige prÃ©vue sur la journÃ©e" className="flex items-start gap-2 rounded-lg border border-sky-100/10 bg-black/15 p-2">
          <MeteoIcon name="snow" size={18} />
          <div>
            <p className="text-[10px] font-semibold text-sky-100">Neige</p>
            <p className="mt-0.5 text-[9px] leading-relaxed text-slate-400">Signal WMO valide pour la journÃ©e; aucune quantitÃ© quotidienne de neige nâest fournie.</p>
          </div>
        </div>
      )}
      {consensus && hasConsensusCounts && (
        <p className="text-[10px] leading-relaxed text-slate-300">Pluie annoncÃ©e par {consensus.rainModelCount}/{consensus.availableModelCount} modÃ¨les au seuil {isFiniteValue(consensus.thresholdMm) ? `â¥ ${formatOptionalForecastValue(consensus.thresholdMm, 1, " mm")}` : "indisponible"} Â· frÃ©quence brute descriptive, jamais une probabilitÃ© calibrÃ©e.</p>
      )}
      <p className="text-[10px] leading-relaxed text-slate-400">{excludeDailyConditionAndCode ? "Les mÃ©triques de ce payload quotidien restent distinctes du validTime horaire sÃ©lectionnÃ©; lâÃ©tat affichÃ© en tÃªte de carte correspond Ã  lâÃ©chÃ©ance. Aucun code mÃ©tÃ©o brut nâest affichÃ© dans cette carte." : "Le code WMO prÃ©sentÃ© ici appartient uniquement au contrat quotidien : il reste inconnu en cas dâabsence ou dâÃ©galitÃ©, et nâest ni dÃ©duit des heures ni remplacÃ© par Best Match. Cette correction nâajoute aucun code au panneau de prÃ©vision horaire officielle. Restent non exposÃ©s au quotidien : pression, pluie/averses/neige sÃ©parÃ©es, probabilitÃ© de prÃ©cipitations, couverture nuageuse par couche, durÃ©e dâensoleillement et rayonnement. Direction dominante, UV max et ressentis proviennent uniquement de la rÃ©fÃ©rence Best Match, non contributrice officielle, et restent indisponibles si absents."}</p>
      {bestMatch && (
        <div className="rounded-lg border border-sky-100/10 bg-black/15 p-2 text-[10px] leading-relaxed text-slate-300">
          <p className="font-semibold text-sky-100">{bestMatch.source} Â· rÃ©fÃ©rence dÃ©rivÃ©e distincte, non contributrice officielle</p>
          <p>Tmax {formatReference(bestMatch.tempMax, "Â°C", 1)} Â· Tmin {formatReference(bestMatch.tempMin, "Â°C", 1)} Â· prÃ©cipitations {formatReference(bestMatch.precipitation, "mm", 1)} Â· vent max. {formatReference(bestMatch.windSpeed, "km/h", 0)} Â· rafales max. {formatReference(bestMatch.windGust, "km/h", 0)}.</p>
          <p>Direction dominante {formatReference(bestMatch.windDirection ?? null, "Â°", 0)} Â· UV max {formatReference(bestMatch.uvIndex ?? null, "indice", 1)} Â· ressenti max/min {formatReference(bestMatch.feelsLikeMax ?? null, "Â°C", 1)} / {formatReference(bestMatch.feelsLikeMin ?? null, "Â°C", 1)}.</p>
        </div>
      )}
    </div>
  );
}

function DayDetailsAccordion({ category, allHours = [] }: { category: DetailCategory; allHours?: readonly ForecastHour[] }) {
  const notes = category.rows.filter(({ note }) => Boolean(note));
  const palette = getCategoryPalette(category.key);
  return (
    <details className="group border-t border-sky-100/10 first:border-t-0">
      <summary className="grid min-h-[4rem] cursor-pointer list-none grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 sm:flex sm:gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${palette?.accentClassName ?? "bg-sky-300/10 text-cyan-100"}`} style={palette ? { backgroundColor: palette.accentBackground, color: palette.accentColor } : undefined}><MeteoIcon name={category.icon} size={16} /></span>
        <span className="flex min-w-0 items-start justify-between gap-x-2 gap-y-1 sm:flex-1 sm:items-center">
          <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-slate-100">{category.title}</span>
          <span className={"min-w-0 max-w-[62%] whitespace-normal break-words text-right text-xs leading-relaxed tabular-nums " + (category.valueTone ?? "text-slate-300") + " sm:max-w-[58%]"}>{category.summary}</span>
          <span aria-hidden="true" className="shrink-0 text-xl leading-none text-sky-100/75 transition-transform group-open:rotate-180">â</span>
        </span>
      </summary>
      <div className="pb-4 pl-3 pr-2 sm:pl-5">
        {category.cadence === "hourly" ? (
          <>
            <div className="space-y-1 text-xs leading-relaxed text-slate-300">
              <p className={"break-words font-medium " + (category.valueTone ?? "text-slate-100")}>{category.rows[0]?.value ?? "â"}</p>
              <p>validTime UTC : {formatUtcTimestamp(category.validAt)}</p>
            </div>
            {category.hourlyHistogramSeries?.map((series) => (
              <HourlyMiniHistogram
                key={series.field}
                categoryKey={category.key}
                series={series}
                allHours={allHours}
                selectedValidAt={category.validAt}
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
            {notes.map((row) => <p key={row.key}>{row.time ? `${row.time} Â· ` : ""}{row.note}</p>)}
            {category.key === "precipitation" && <p className="pt-1 text-sky-100">Les comptes de modÃ¨les dÃ©crivent une frÃ©quence brute, jamais une probabilitÃ© de pluie calibrÃ©e.</p>}
          </div>
        )}
      </div>
    </details>
  );

}
export function ForecastByDaySection({
  locationName,
  hours,
  dailyDays,
  dailySources,
  activeHourIndex,
  hourlyWeighting,
  officialProvenance,
  activeHourMeasurementLabel,
}: {
  locationName?: string;
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
  /** Provenance de la mesure des stations physiques quand l'Ã©chÃ©ance active est une observation. */
  activeHourMeasurementLabel?: string | null;
}) {
  const { showProvenance } = useProvenanceDisplay();
  const grouped = useMemo(() => groupOfficialHourlyForecastByDate(hours), [hours]);
  const today = getForecastDateKey();
  const tomorrow = getNextForecastDateKey(today);
  const displayDays = useMemo(
    () => buildForecastDisplayDays(hours, dailyDays, 15, dailyDays.map(({ date }) => date ?? "")),
    [hours, dailyDays],
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
  const selectedEntryIsActiveHour = selectedEntry != null && selectedEntry.index === activeHourIndex;
  const activeHourIsMeasured = Boolean(activeHourMeasurementLabel) && selectedEntryIsActiveHour;
  const selectedEntryHasValidTime = isFiniteValue(selectedEntry?.hour.validAt);
  const selectedDaily = selectedDay?.daily ?? null;
  const selectedDateIsTodayOrTomorrow = selectedDay?.date === today || selectedDay?.date === tomorrow;
  const detailCategories = selectedDay?.kind === "official-daily-fusion"
    ? selectedDaily ? buildDailyDetailCategories(selectedDaily) : []
    : [];
  const hourlyDetailCategories = selectedDay?.kind === "official-hourly" && selectedEntry && selectedEntryHasValidTime
    ? filterOfficialHourlyCardDetails(buildHourlyDetailCategories(selectedEntry, hours, indexedHours, histogramStartValidAt))
    : [];
  const selectedValidTimeUtc = formatUtcTimestamp(selectedEntry?.hour.validAt);
  const selectedSourceLabel = officialProvenance?.source === "open-meteo"
    ? "Open-Meteo"
    : officialProvenance?.source ?? "indisponible";
  const selectedContextSource = selectedDay?.kind === "official-hourly"
    ? selectedSourceLabel
    : selectedDaily?.officialFusion
      ? "Fusion quotidienne MeteoAI"
      : sourceLabels.length
        ? sourceLabels.join(" Â· ")
        : "non prÃ©cisÃ©e";
  const freshnessValue = selectedDay?.kind === "official-hourly"
    ? officialProvenance?.hourlyComputedAt ?? officialProvenance?.computedAt
    : selectedDaily?.officialFusion?.issuedAt ?? officialProvenance?.computedAt;
  const selectedFreshness = formatForecastFreshness(freshnessValue);
  const selectedDailyWeatherCode = selectedDay?.kind === "official-daily-fusion" && isFiniteValue(selectedDaily?.weatherCode)
    ? selectedDaily.weatherCode
    : null;
  const selectedDailyCodeCondition = selectedDailyWeatherCode == null
    ? null
    : dailyConditionFromWmoWeatherCode(selectedDailyWeatherCode);
  const selectedDailyCodeIconName = selectedDailyWeatherCode == null
    ? null
    : getDailyWeatherCodeIconName(selectedDailyWeatherCode);
  const selectedHourlyCondition = selectedDay?.kind === "official-hourly" && selectedEntryHasValidTime ? getOfficialHourlyCondition(selectedEntry?.hour) : null;
  const selectedConditionSource = selectedDay?.kind === "official-hourly"
    ? selectedHourlyCondition ?? ""
    : selectedDailyCodeCondition ?? selectedDaily?.condition?.trim() ?? "";
  const selectedCondition = conditionDescription(selectedDay?.kind === "official-hourly" ? selectedHourlyCondition : selectedConditionSource);
  const selectedConditionIcon = selectedDailyCodeIconName ?? conditionIconName(selectedConditionSource);
  const selectedConditionIconAriaLabel = `Ãtat du ciel : ${conditionDescription(selectedConditionSource) || "indisponible"}`;
  const sceneStyle = selectedConditionSource && selectedConditionIcon !== "calendar"
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(5, 20, 38, 0.66) 0%, rgba(5, 17, 33, 0.84) 52%, rgba(4, 13, 27, 0.96) 100%), url("${getWeatherLandscapeImage(selectedConditionSource)}")`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }
    : undefined;

  const selectedEvolution = selectedDay?.kind === "official-hourly" && selectedEntry
    ? findNextOfficialHourlyConditionChange(hours, selectedEntry.hour)
    : null;
  const selectedEvolutionIndex = selectedEvolution ? hours.indexOf(selectedEvolution) : -1;
  const selectedEvolutionEntry = selectedEvolutionIndex >= 0 ? { index: selectedEvolutionIndex, hour: hours[selectedEvolutionIndex] } : null;
  const selectedEvolutionLabel = selectedEvolutionEntry
    ? `${hourTime(selectedEvolutionEntry, hours)} Â· ${conditionDescription(getOfficialHourlyCondition(selectedEvolutionEntry.hour)) || "Condition indisponible"}`
      : !selectedEntryHasValidTime
        ? "indisponible Â· validTime absent"
      : selectedHourlyCondition
        ? "aucun changement descriptif disponible aprÃ¨s cette Ã©chÃ©ance"
        : "indisponible Â· Ã©tat du ciel non fourni";
  const hourlyFieldProvenance = (fallbackField: OpenWeatherFallbackField | null, available: boolean) => {
    const fallback = fallbackField ? selectedEntry?.hour.fallbackProvenance?.[fallbackField] : undefined;
    const computedAt = fallback?.retrievedAt ?? officialProvenance?.hourlyComputedAt ?? officialProvenance?.computedAt;
    const source = fallback?.provider ?? selectedSourceLabel;
    const freshness = relativeForecastAge(computedAt);
    const origin = fallback ? `rÃ©ponse reÃ§ue ${freshness} Â· fraÃ®cheur amont inconnue` : `calcul ${freshness}`;
    return `${source} Â· ${origin}${available ? "" : " Â· champ indisponible"}`;
  };
  const selectedHourlyTemperatureTone = selectedEntry && selectedEntryHasValidTime && isFiniteValue(selectedEntry.hour.temp)
    ? getTemperatureTone(selectedEntry.hour.temp, "hourly").label
    : undefined;
  const selectedHourlyApparentTemperatureTone = selectedEntry && selectedEntryHasValidTime && isFiniteValue(selectedEntry.hour.apparentTemp)
    ? getTemperatureTone(selectedEntry.hour.apparentTemp, "hourly").label
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
      {locationName ? <p className="px-1 text-[10px] text-slate-400">Lieu actif : <span className="font-medium text-slate-200">{locationName}</span></p> : null}
      {selectedDay ? (
        <>
        <section aria-labelledby="forecast-daily-strip-title" className="min-w-0 overflow-hidden rounded-2xl border border-sky-100/15 bg-slate-950/25">
          <h3 id="forecast-daily-strip-title" className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100/80">Jour par jour</h3>
          <div ref={dayStripRef} role="group" aria-label="Jours de prÃ©vision dÃ©filables" className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-3 pb-2 pt-1 scrollbar-hide touch-pan-x">
            {displayDays.map((day) => {
              const first = day.hourlyGroup?.hours[0]?.hour;
              const dailyWeatherCode = day.daily && isFiniteValue(day.daily.weatherCode) ? day.daily.weatherCode : null;
              const dailyWeatherIconName = dailyWeatherCode == null ? null : getDailyWeatherCodeIconName(dailyWeatherCode);
              const dailyWeatherCondition = dailyWeatherIconName && dailyWeatherCode != null
                ? dailyConditionFromWmoWeatherCode(dailyWeatherCode)
                : null;
              const condition = dailyWeatherCondition ?? day.daily?.condition ?? first?.condition;
              const weatherIconName = dailyWeatherIconName ?? conditionIconName(condition);
              const weatherIconLabel = `Ãtat du ciel : ${conditionDescription(condition) || "indisponible"}`;
              const isSelected = selectedDayDate === day.date;
              const hasMaximum = isFiniteValue(day.daily?.tempMax);
              const hasMinimum = isFiniteValue(day.daily?.tempMin);
              const maximumTone = getExtremeTemperatureTone("max", day.daily?.tempMax);
              const minimumTone = getExtremeTemperatureTone("min", day.daily?.tempMin);
              const dailySourceLabel = day.daily?.officialFusion
                ? "Fusion quotidienne officielle"
                : day.daily
                  ? "DonnÃ©es quotidiennes prÃ©sentes"
                  : "DonnÃ©es quotidiennes indisponibles";
              const dailyMaximumLabel = hasMaximum
                ? `Max ${formatOptionalForecastValue(day.daily?.tempMax, 1, "Â°")}`
                : "Max indisponible";
              const dailyMinimumLabel = hasMinimum
                ? `Min ${formatOptionalForecastValue(day.daily?.tempMin, 1, "Â°")}`
                : "Min indisponible";
              const buttonLabel = `${day.kind === "official-hourly" ? "PrÃ©vision horaire officielle" : "PrÃ©vision quotidienne"} du ${dateText(day.date)}. ${dailySourceLabel}. ${dailyMaximumLabel} Â· ${dailyMinimumLabel}. ${conditionDescription(condition) || "Condition indisponible"}.`;
              return (
                <button
                  key={day.date}
                  type="button"
                  ref={isSelected ? selectedDayRef : undefined}
                  aria-label={buttonLabel}
                  aria-pressed={isSelected}
                  onClick={() => onDayPress(day)}
                  className={`forecast-day-tile w-[7rem] shrink-0 snap-start rounded-2xl border px-1.5 py-2 text-center transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 ${isSelected ? "border-cyan-200/75 bg-sky-300/15 shadow-[0_0_0_1px_rgba(103,232,249,0.16)]" : "border-sky-100/10 bg-slate-950/35 hover:border-sky-200/25 hover:bg-sky-950/40"}`}
                >
                  <span className="block truncate text-sm font-semibold text-slate-100">{day.date === today ? "Aujourdâhui" : shortWeekday(day.date)}</span>
                  <span className="my-1 flex justify-center"><MeteoIcon name={weatherIconName} size={30} ariaLabel={weatherIconLabel} /></span>
                  <span className={`mx-auto mt-1 flex min-h-8 w-fit min-w-[5.25rem] items-center justify-center gap-2 rounded-lg border px-2 py-1 ${hasMaximum ? maximumTone.container : "border-white/10 bg-slate-950/30"}`}>
                    <span className={`text-sm font-black tabular-nums ${hasMaximum ? maximumTone.value : "text-slate-400"}`}>{formatOptionalForecastValue(day.daily?.tempMax, 1, "Â°")}</span>
                    <span className={`text-[10px] font-bold tracking-wide ${hasMaximum ? maximumTone.label : "text-slate-400"}`}>Max</span>
                  </span>
                  <span className={`mx-auto mt-1 flex min-h-8 w-fit min-w-[5.25rem] items-center justify-center gap-2 rounded-lg border px-2 py-1 ${hasMinimum ? minimumTone.container : "border-white/10 bg-slate-950/30"}`}>
                    <span className={`text-sm font-black tabular-nums ${hasMinimum ? minimumTone.value : "text-slate-400"}`}>{formatOptionalForecastValue(day.daily?.tempMin, 1, "Â°")}</span>
                    <span className={`text-[10px] font-bold tracking-wide ${hasMinimum ? minimumTone.label : "text-slate-400"}`}>Min</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="forecast-hourly-strip-title" className="min-w-0 overflow-hidden rounded-2xl border border-sky-100/15 bg-slate-950/25">
          <h3 id="forecast-hourly-strip-title" className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100/80">Heure par heure</h3>
          {selectedGroup ? (
            <div ref={hourStripRef} role="group" aria-label="Heures de prÃ©vision dÃ©filables" className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain px-3 pb-2 pt-1 scrollbar-hide touch-pan-x">
              {selectedGroup.hours.map((entry) => {
                const display = formatHourlyDisplay(entry.hour, hours);
                const isHourSelected = entry.index === selectedHourIndex;
                const isActiveForecast = entry.index === activeHourIndex;
                const icon = conditionIconName(entry.hour.condition);
                const temperatureTone = isFiniteValue(entry.hour.temp)
                  ? getTemperatureTone(entry.hour.temp, "hourly").label
                  : undefined;
                const precipitationLabel = isFiniteValue(entry.hour.precipitation) && entry.hour.precipitation > 0
                  ? `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(entry.hour.precipitation)} mm`
                  : null;
                const precipitationDescription = precipitationLabel
                  ? `, pluie ${precipitationLabel}`
                  : entry.hour.precipitation === 0
                    ? ", aucune pluie prÃ©vue"
                    : ", prÃ©cipitations indisponibles";
                return (
                  <button
                    key={`${entry.hour.date ?? "date-absente"}-${entry.hour.hour ?? "heure-absente"}-${entry.index}`}
                    type="button"
                    ref={isHourSelected ? selectedHourRef : undefined}
                    aria-pressed={isHourSelected}
                    aria-label={`${display.dateLabel}, ${display.hourLabel}${display.offsetLabel ? `, ${display.offsetLabel}` : ""}, tempÃ©rature ${formatOptionalForecastValue(entry.hour.temp, 1, "Â°")}${precipitationDescription}${isActiveForecast ? (activeHourMeasurementLabel ? ", prÃ©vision active Â· tempÃ©rature mesurÃ©e par les stations physiques" : ", prÃ©vision active") : ""}`}
                    onClick={() => onHourPress(entry.index)}
                    className={`forecast-hour-cell min-h-[6.25rem] w-[5rem] shrink-0 snap-start rounded-xl border px-1.5 py-2 text-center transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 ${isHourSelected ? "border-cyan-200/75 bg-sky-300/15" : "border-transparent hover:bg-sky-200/[0.06]"}`}
                  >
                    <span className={`block min-h-5 text-sm font-bold tabular-nums ${temperatureTone ? "" : "text-slate-400"}`} style={temperatureTone ? { color: temperatureTone } : undefined}>{formatOptionalForecastValue(entry.hour.temp, 1, "Â°")}</span>
                    <MeteoIcon name={icon} size={36} />
                    {precipitationLabel && <span className="mt-0.5 block min-h-5 text-xs font-bold tabular-nums text-sky-200">{precipitationLabel}</span>}
                    <span className={`mt-0.5 block text-sm font-bold tabular-nums ${isHourSelected ? "text-cyan-100" : "text-slate-300"}`}>{display.hourLabel}</span>
                    {display.offsetLabel && <span className="block text-[9px] text-amber-200">{display.offsetLabel}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p role="status" className="px-4 py-3 text-xs leading-relaxed text-slate-200"><span className="mb-1 block font-semibold text-amber-100">DonnÃ©es horaires indisponibles</span>Aucune sÃ©rie horaire officielle nâest fournie pour cette date. Les valeurs restent quotidiennes et ne sont pas dÃ©clinÃ©es heure par heure.</p>
          )}
        </section>

          <section
            aria-label={`PrÃ©vision ${selectedDay.kind === "official-hourly" ? "horaire officielle" : selectedDaily?.officialFusion ? "fusion quotidienne officielle" : "quotidienne"} du ${dateText(selectedDay.date)}`}
            className="relative min-w-0 overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-slate-50 shadow-[0_10px_32px_rgba(2,8,23,0.38)]"
            style={sceneStyle}
          >
            <div key={`${selectedDay.date}:${selectedEntry?.hour.validAt ?? selectedHourIndex ?? "daily"}`} className="forecast-selected-summary relative z-10 px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-100/80">
                    {selectedDay.kind === "official-hourly" ? "PrÃ©vision horaire officielle" : selectedDaily?.officialFusion ? "Fusion quotidienne officielle" : "PrÃ©vision quotidienne"}
                  </p>
                  <h2 id="forecast-by-day-title" className="mt-1 truncate text-lg font-semibold tracking-tight text-white">{dateLabel(selectedDay.date, today, tomorrow) || dateText(selectedDay.date)}</h2>
                </div>
                <span className="shrink-0 rounded-full border border-sky-200/25 bg-slate-950/45 px-2 py-1 text-[9px] font-semibold tracking-wide text-sky-100">MeteoAI</span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 sm:gap-5">
                {selectedConditionIcon !== "calendar" && <div className="shrink-0 drop-shadow-md"><MeteoIcon name={selectedConditionIcon} size={56} ariaLabel={selectedConditionIconAriaLabel} /></div>}
                {selectedDay.kind === "official-hourly" ? (
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-100/75">{selectedEntry ? `ÃchÃ©ance ${hourTime(selectedEntry, hours)}` : "TempÃ©rature horaire"}</p>
                    <p className="mt-0.5 text-[2.8rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-5xl" style={selectedHourlyTemperatureTone ? { color: selectedHourlyTemperatureTone } : undefined}>{formatOptionalForecastValue(selectedEntryHasValidTime ? selectedEntry?.hour.temp : null, 1, "Â°")}</p>
                    {selectedEntry && showProvenance && <p className={activeHourIsMeasured ? "mt-1 text-[8px] leading-tight text-amber-200" : "mt-1 text-[8px] leading-tight text-slate-400"} title={`validTime UTC ${selectedValidTimeUtc}`}>{activeHourIsMeasured ? `Mesure stations physiques Â· ${activeHourMeasurementLabel}` : hourlyFieldProvenance("temperature", selectedEntryHasValidTime && isFiniteValue(selectedEntry.hour.temp))}</p>}
                    {showProvenance && selectedEntryHasValidTime && selectedEntry?.hour.fallbackProvenance?.temperature && <p className="mt-1 text-[9px] leading-relaxed text-amber-200">OpenWeatherMap Â· rÃ©ponse obtenue par lâapplication {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(selectedEntry.hour.fallbackProvenance.temperature.retrievedAt))} Â· validTime exact Â· run fournisseur non communiquÃ©, fraÃ®cheur amont inconnue.</p>}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-100/75">{selectedDaily?.officialFusion ? "Max / Min Â· fusion quotidienne documentÃ©e" : "Max / Min quotidien"}</p>
                    <p className="mt-0.5 whitespace-nowrap text-[2rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-4xl">
                      {isFiniteValue(selectedDaily?.tempMax) && isFiniteValue(selectedDaily?.tempMin)
                        ? <>{formatOptionalForecastValue(selectedDaily.tempMax, 1, "Â°")}<span className="px-1 text-[0.72em] text-sky-100/80">/</span>{formatOptionalForecastValue(selectedDaily.tempMin, 1, "Â°")}</>
                        : getDailyExtremesDisplayLabel(selectedDaily)}
                    </p>
                  </div>
                )}
                <div className="max-w-[42%] shrink-0 text-right">
                  <p className="text-[13px] font-medium leading-snug text-slate-50">{selectedCondition || "Condition indisponible"}</p>
                  {showProvenance && selectedDay.kind === "official-hourly" && <p className="mt-0.5 text-[8px] leading-tight text-slate-400">{hourlyFieldProvenance(null, Boolean(selectedHourlyCondition))}</p>}
                  <p className="mt-2 text-[11px] font-medium text-slate-300">Ressenti</p>
                  <p className={selectedDay.kind === "official-hourly" ? "mt-0.5 whitespace-nowrap text-2xl font-bold leading-none tabular-nums text-white sm:text-3xl" : "text-sm font-semibold tabular-nums text-white"} style={selectedDay.kind === "official-hourly" && selectedHourlyApparentTemperatureTone ? { color: selectedHourlyApparentTemperatureTone } : undefined}>
                    {selectedDay.kind === "official-hourly"
                      ? formatOptionalForecastValue(selectedEntryHasValidTime ? selectedEntry?.hour.apparentTemp : null, 1, "Â°")
                      : [
                          isFiniteValue(selectedDaily?.feelsLikeMax) ? `Max ${formatOptionalForecastValue(selectedDaily.feelsLikeMax, 1, "Â°")}` : null,
                          isFiniteValue(selectedDaily?.feelsLikeMin) ? `Min ${formatOptionalForecastValue(selectedDaily.feelsLikeMin, 1, "Â°")}` : null,
                        ].filter(Boolean).join(" Â· ") || "â"}
                  </p>
                </div>
              </div>

              {selectedDay.kind === "official-hourly" && <div className="mt-2 rounded-lg border border-cyan-300/15 bg-slate-950/25 px-2 py-1.5" aria-label="Ãvolution prÃ©vue aprÃ¨s lâÃ©chÃ©ance sÃ©lectionnÃ©e"><p className="text-[9px] font-semibold text-cyan-100">Ãvolution prÃ©vue Â· {selectedEvolutionLabel}</p>{showProvenance && selectedEvolutionEntry && <p className="mt-0.5 text-[8px] text-slate-400">{hourlyFieldProvenance(null, true)} Â· Ã©chÃ©ance suivante distincte</p>}</div>}

              <div aria-label="PrÃ©vision, source et fraÃ®cheur" className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] leading-relaxed">
                {activeHourIsMeasured ? (
                  <span aria-label="MesurÃ©, observation des stations physiques" className="inline-flex min-h-6 items-center rounded-full border border-amber-200/35 bg-amber-300/10 px-2 font-bold uppercase tracking-[0.08em] text-amber-100">MesurÃ©</span>
                ) : (
                  <span aria-label="PrÃ©vu, non observÃ©" className="inline-flex min-h-6 items-center rounded-full border border-cyan-200/35 bg-cyan-300/10 px-2 font-bold uppercase tracking-[0.08em] text-cyan-100">PrÃ©vu</span>
                )}
                {showProvenance && <span className="min-w-0 rounded-full border border-sky-100/15 bg-slate-950/35 px-2 py-1 text-slate-200"><span className="font-semibold text-sky-100">Source</span> Â· {selectedContextSource}</span>}
                {showProvenance && <span className="rounded-full border border-sky-100/15 bg-slate-950/35 px-2 py-1 text-slate-200"><span className="font-semibold text-sky-100">Calcul</span> Â· {selectedFreshness ? <time dateTime={selectedFreshness.iso}>{selectedFreshness.label} (Europe/Paris)</time> : "heure indisponible"}</span>}
              </div>

              {showProvenance && selectedDay.kind === "official-daily-fusion" && selectedDaily?.officialFusion && (
                <div className="mt-3 border-t border-sky-100/15 pt-2.5" aria-label="Provenance de la fusion quotidienne">
                  <span className="inline-flex rounded-full border border-cyan-200/40 bg-cyan-300/10 px-2 py-1 text-[10px] font-bold text-cyan-100">Fusion officielle Â· preuves par variable</span>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-100">Les valeurs sans preuves qualifiÃ©es restent indisponibles. Les dÃ©tails des poids, biais diagnostiques et limites de comparabilitÃ© sont ci-dessous.</p>
                </div>
              )}
            </div>

          </section>

          <section aria-label="DÃ©tails mÃ©tÃ©o disponibles" className="rounded-2xl border border-sky-300/20 bg-slate-950/35 px-3">
            {selectedDay.kind === "official-hourly" ? (
              <>
                {selectedEntry ? (
                  <div className="border-b border-sky-100/10 py-3" aria-label="Valeurs pour lâÃ©chÃ©ance sÃ©lectionnÃ©e">
                    <h3 className="text-base font-semibold leading-snug text-sky-100">Valeurs pour lâÃ©chÃ©ance sÃ©lectionnÃ©e Â· {hourTime(selectedEntry, hours)}</h3>
                  </div>
                ) : <p className="border-b border-sky-100/10 py-3 text-xs text-slate-300">Aucune Ã©chÃ©ance horaire sÃ©lectionnÃ©e.</p>}
                {hourlyDetailCategories.map((category) => <DayDetailsAccordion key={category.key} category={category} allHours={hours} />)}
                {selectedDaily && <DailyForecastMetricsPanel day={selectedDaily} sourceLabels={sourceLabels} excludeDailyConditionAndCode={selectedDateIsTodayOrTomorrow} />}
                {!selectedDaily && (
                  <p className="border-t border-sky-100/10 py-3 text-xs leading-relaxed text-amber-100">MÃ©triques quotidiennes indisponibles pour cette date. Aucune valeur nâest dÃ©duite des heures.</p>
                )}
              </>
            ) : (
              <>
                {selectedDateIsTodayOrTomorrow && selectedDaily
                  ? <DailyForecastMetricsPanel day={selectedDaily} sourceLabels={sourceLabels} />
                  : detailCategories.map((category) => <DayDetailsAccordion key={category.key} category={category} />)}
              </>
            )}
          </section>

          {showProvenance && <details className="group px-1 text-xs text-slate-300">
            <summary className="min-h-10 cursor-pointer list-none py-2 font-medium text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80">Provenance et disponibilitÃ© des champs <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-180">â</span></summary>
            {selectedDay.kind === "official-hourly" && (
              <>
                <p className="pb-2 leading-relaxed">La sÃ©rie de base reste la fusion horaire officielle Ã  sept modÃ¨les Open-Meteo, sans Best Match. OpenWeatherMap ne complÃ¨te que les cellules absentes aux validTime UTC strictement identiques; il ne devient ni un modÃ¨le, ni un vote, ni une preuve de calibration. Toute valeur complÃ©tÃ©e porte sa provenance et lâheure de rÃ©cupÃ©ration; le run et la fraÃ®cheur amont restent inconnus. Les autres absences restent indisponibles.</p>
                <HourlyWeightingNotice weighting={hourlyWeighting as any} />
              </>
            )}
            {selectedDaily && (selectedDaily.officialFusion
              ? <DailyFusionDiagnostics day={selectedDaily} sourceLabels={sourceLabels} />
              : <p className="pb-2 leading-relaxed">Les mÃ©tadonnÃ©es de provenance par variable ne sont pas fournies dans ce payload quotidien; aucune calibration ni fusion nâest affirmÃ©e.{sourceLabels.length ? ` Sources signalÃ©es sans attribution par mÃ©trique : ${sourceLabels.join(" Â· ")}.` : ""}</p>)}
            {selectedDay.kind === "official-daily-fusion" && !selectedDaily && <p className="pb-2 leading-relaxed">Payload quotidien indisponible pour cette date.</p>}
          </details>}
        </>
      ) : (
        <div className="rounded-2xl border border-amber-200/25 bg-slate-900/75 px-4 py-5 text-sm leading-relaxed text-slate-200" role="status" aria-label="Aucune prÃ©vision datÃ©e disponible">
          <h2 id="forecast-by-day-title" className="font-semibold text-white">Aucune prÃ©vision disponible</h2>
          <p className="mt-2">Aucune Ã©chÃ©ance datÃ©e nâa Ã©tÃ© reÃ§ue pour la sÃ©rie horaire officielle ou la fusion quotidienne. Les donnÃ©es manquantes ne sont pas dÃ©duites ni remplacÃ©es.</p>
          {grouped.undatedHours > 0 && <p className="mt-1 text-amber-100">{grouped.undatedHours} Ã©chÃ©ance(s) sans date locale explicite nâont pas Ã©tÃ© regroupÃ©es; aucune date nâa Ã©tÃ© dÃ©duite de lâhorodatage UTC.</p>}
        </div>
      )}
      {displayDays.length > 0 && grouped.undatedHours > 0 && <p className="px-1 text-xs text-amber-100/90">{grouped.undatedHours} Ã©chÃ©ance(s) sans date locale explicite ne sont pas affichÃ©es dans les bandes.</p>}
    </section>
  );
}

