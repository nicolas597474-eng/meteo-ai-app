import { useEffect, useMemo, useRef, useState } from "react";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { HourlyWeightingNotice } from "@/components/weather/HourlyWeightingNotice";
import { formatHourlyDisplay } from "@/lib/hourlyDisplay";
import { getWeatherLandscapeImage } from "@/lib/weatherImages";
import {
  buildForecastDisplayDays,
  getDailyReferenceSourceLabels,
  type DailyForecastPoint,
  type ForecastDisplayDay,
} from "@/lib/forecastDayDisplay";
import {
  formatOptionalForecastValue,
  getInitialForecastTimelineSelection,
  getSelectedForecastHourIndex,
  groupOfficialHourlyForecastByDate,
  isOfficialSevenModelSource,
  selectForecastHour,
  type ForecastDayGroup,
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
  multiModelMetrics?: { source?: string; bestMatchIncluded?: boolean; precipitation?: PrecipitationMetrics | null } | null;
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
  rows: DetailRow[];
};

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function officialPrecipitationMetrics(hour: ForecastHour): PrecipitationMetrics | null {
  const metrics = hour.multiModelMetrics;
  if (!metrics || !isOfficialSevenModelSource(metrics)) return null;
  return metrics.precipitation ?? null;
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
    timeZone: "Europe/Paris",
  }).format(new Date(`${date}T12:00:00.000Z`));
  return value.length ? value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1) : value;
}

const CONDITION_LABELS: Record<string, string> = {
  sunny: "Ensoleillé", stable: "Temps stable", summer_heat: "Canicule",
  few_clouds: "Peu nuageux", partly_cloudy: "Partiellement nuageux", overcast: "Ciel couvert",
  cloudy: "Nuageux", cloud_cover: "Ciel couvert", variable: "Temps variable",
  showers: "Averses", rainy: "Pluie", heavy_rain: "Pluie forte", thunderstorm: "Orages",
  storm: "Tempête", snow: "Neige", freezing_rain: "Pluie verglaçante", sleet: "Neige fondue",
  frost: "Gel", deep_frost: "Vague de froid", clear_night: "Ciel dégagé", fog: "Brouillard",
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
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "Europe/Paris" })
    .format(new Date(`${date}T12:00:00.000Z`));
}

function parisDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(({ type }) => type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function nextCalendarDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
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

function buildHourlyDetailCategories(
  group: ForecastDayGroup<ForecastHour>,
  allHours: readonly ForecastHour[],
): DetailCategory[] {
  const entries = group.hours;
  const time = (entry: IndexedForecastHour<ForecastHour>) => hourTime(entry, allHours);
  const precipitationRows: DetailRow[] = entries.flatMap((entry) => {
    const value = entry.hour.precipitation;
    const metrics = officialPrecipitationMetrics(entry.hour);
    const hasModelRainCount = metrics && isFiniteValue(metrics.rainModelCount) && isFiniteValue(metrics.availableModelCount);
    if (!isFiniteValue(value) && !hasModelRainCount) return [];
    const notes = hasModelRainCount
      ? `${metrics.rainModelCount}/${metrics.availableModelCount} modèles au seuil${isFiniteValue(metrics.thresholdMm) ? ` ≥ ${formatOptionalForecastValue(metrics.thresholdMm, 1, " mm")}` : ""} · fréquence brute non calibrée`
      : undefined;
    return [{
      key: `rain-${entry.index}`,
      time: time(entry),
      value: formatOptionalForecastValue(value, 1, " mm"),
      note: notes,
      chartValue: isFiniteValue(value) ? value : null,
      chartValueLabel: formatOptionalForecastValue(value, 1, " mm"),
    }];
  });

  const windRows: DetailRow[] = entries.flatMap((entry) => {
    const { windSpeed, windGust, windDirection } = entry.hour;
    if (![windSpeed, windGust, windDirection].some(isFiniteValue)) return [];
    const pieces = [
      isFiniteValue(windSpeed) ? `Vent ${formatOptionalForecastValue(windSpeed, 0, " km/h")}` : null,
      isFiniteValue(windGust) ? `Rafales ${formatOptionalForecastValue(windGust, 0, " km/h")}` : null,
      isFiniteValue(windDirection) ? `Direction ${windDirectionLabel(windDirection)}` : null,
    ].filter((value): value is string => value != null);
    return [{
      key: `wind-${entry.index}`,
      time: time(entry),
      value: pieces.join(" · "),
      chartValue: isFiniteValue(windSpeed) ? windSpeed : null,
      chartValueLabel: formatOptionalForecastValue(windSpeed, 0, " km/h"),
    }];
  });

  const humidityRows: DetailRow[] = entries.flatMap((entry) => {
    const humidity = entry.hour.humidity;
    const dewPoint = entry.hour.dewPoint;
    if (!isFiniteValue(humidity) && !isFiniteValue(dewPoint)) return [];
    const value = [
      isFiniteValue(humidity) ? formatOptionalForecastValue(humidity, 0, "%") : null,
      isFiniteValue(dewPoint) ? `Rosée ${formatOptionalForecastValue(dewPoint, 0, "°")}` : null,
    ].filter((item): item is string => item != null).join(" · ");
    return [{
      key: `humidity-${entry.index}`,
      time: time(entry),
      value,
      chartValue: isFiniteValue(humidity) ? humidity : null,
      chartValueLabel: formatOptionalForecastValue(humidity, 0, "%"),
    }];
  });

  const cloudRows: DetailRow[] = entries.flatMap((entry) => {
    const { cloudCover, cloudLow, cloudMid, cloudHigh } = entry.hour;
    if (![cloudCover, cloudLow, cloudMid, cloudHigh].some(isFiniteValue)) return [];
    const value = [
      isFiniteValue(cloudCover) ? `Total ${formatOptionalForecastValue(cloudCover, 0, " %")}` : null,
      isFiniteValue(cloudLow) ? `basses ${formatOptionalForecastValue(cloudLow, 0, " %")}` : null,
      isFiniteValue(cloudMid) ? `moyennes ${formatOptionalForecastValue(cloudMid, 0, " %")}` : null,
      isFiniteValue(cloudHigh) ? `hautes ${formatOptionalForecastValue(cloudHigh, 0, " %")}` : null,
    ].filter((item): item is string => item != null).join(" · ");
    return [{ key: `cloud-${entry.index}`, time: time(entry), value, chartValue: isFiniteValue(cloudCover) ? cloudCover : null, chartValueLabel: formatOptionalForecastValue(cloudCover, 0, "%") }];
  });

  const numericRows = (
    key: string,
    selectValue: (hour: ForecastHour) => number | null | undefined,
    decimals: number,
    unit: string,
  ) => entries.flatMap((entry) => {
    const value = selectValue(entry.hour);
    if (!isFiniteValue(value)) return [];
    return [{ key: `${key}-${entry.index}`, time: time(entry), value: formatOptionalForecastValue(value, decimals, unit), chartValue: value, chartValueLabel: formatOptionalForecastValue(value, decimals, unit) }];
  });

  const typeRows: DetailRow[] = entries.flatMap((entry) => {
    const { precipType, precipIntensity } = entry.hour;
    if (!precipType && !precipIntensity) return [];
    const labels: Record<string, string> = { rain: "pluie", snow: "neige", freezing_rain: "pluie verglaçante", light: "faible", moderate: "modérée", heavy: "forte" };
    return [{ key: `precip-type-${entry.index}`, time: time(entry), value: [precipType ? labels[precipType] ?? precipType : null, precipIntensity ? labels[precipIntensity] ?? precipIntensity : null].filter(Boolean).join(" · "), chartValue: null, chartValueLabel: "—" }];
  });

  const firstAvailable = (rows: DetailRow[]) => {
    const row = rows.find(({ chartValue }) => chartValue !== null) ?? rows[0];
    return row ? `${row.value} · ${row.time}` : "—";
  };

  return [
    { key: "precipitation", title: "Précipitations", icon: "precipitation", summary: firstAvailable(precipitationRows), unit: "mm", cadence: "hourly" as const, rows: precipitationRows },
    { key: "precip-type", title: "Type et intensité", icon: "precipitation", summary: firstAvailable(typeRows), unit: "", cadence: "hourly" as const, rows: typeRows },
    { key: "wind", title: "Vent", icon: "wind_param", summary: firstAvailable(windRows), unit: "km/h", cadence: "hourly" as const, rows: windRows },
    { key: "humidity", title: "Humidité et rosée", icon: "humidity", summary: firstAvailable(humidityRows), unit: "%", cadence: "hourly" as const, rows: humidityRows },
    { key: "clouds", title: "Nuages", icon: "cloud_cover", summary: firstAvailable(cloudRows), unit: "%", cadence: "hourly" as const, rows: cloudRows },
    { key: "pressure", title: "Pression", icon: "pressure", summary: firstAvailable(numericRows("pressure", (hour) => hour.pressure, 0, " hPa")), unit: "hPa", cadence: "hourly" as const, rows: numericRows("pressure", (hour) => hour.pressure, 0, " hPa") },
    { key: "uv", title: "Indice UV", icon: "sunny", summary: firstAvailable(numericRows("uv", (hour) => hour.uvIndex, 1, "")), unit: "indice", cadence: "hourly" as const, rows: numericRows("uv", (hour) => hour.uvIndex, 1, "") },
    { key: "apparent", title: "Température ressentie", icon: "thermometer", summary: firstAvailable(numericRows("apparent", (hour) => hour.apparentTemp, 1, "°")), unit: "°C", cadence: "hourly" as const, rows: numericRows("apparent", (hour) => hour.apparentTemp, 1, "°") },
    { key: "visibility", title: "Visibilité", icon: "eye", summary: firstAvailable(numericRows("visibility", (hour) => hour.visibility, 1, " km")), unit: "km", cadence: "hourly" as const, rows: numericRows("visibility", (hour) => hour.visibility, 1, " km") },
    { key: "radiation", title: "Rayonnement solaire", icon: "sunny", summary: firstAvailable(numericRows("radiation", (hour) => hour.solarRadiation, 0, " W/m²")), unit: "W/m²", cadence: "hourly" as const, rows: numericRows("radiation", (hour) => hour.solarRadiation, 0, " W/m²") },
  ].filter(({ rows }) => rows.length > 0);
}

function evidenceStatusLabel(status: DailyForecastEvidenceStatus): string {
  if (status === "calibrated") return "preuve historique qualifiée";
  if (status === "schema_unavailable") return "indisponible · archive de comparaisons indisponible";
  return "indisponible · preuves qualifiées insuffisantes";
}

function diagnosticStatusLabel(diagnostic: DailyFusionMetricDiagnostic): string {
  switch (diagnostic.status) {
    case "calibrated": return "fusion produite avec preuves exactes";
    case "no_model_values": return "aucune valeur de modèle disponible à cette échéance";
    case "insufficient_evidence": return "valeurs présentes, preuves historiques qualifiées insuffisantes";
    case "weight_cap_blocked": return "preuves admissibles, fusion bloquée par le plafond des poids";
    case "evidence_store_unavailable": return "archive des preuves historiques indisponible";
    case "horizon_unavailable": return "tranche d’horizon exacte indisponible";
    case "no_rain_contributors": return "aucun modèle au seuil utilisé pour la quantité de pluie";
  }
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
      <p>Les poids utilisent uniquement des preuves historiques qualifiées pour le lieu, le modèle, la variable et la tranche d’horizon indiqués. Aucun biais n’est appliqué aux valeurs futures.</p>
      <p>Émission de collecte : {fusion.issuedAt} · horizon : {fusion.horizonBucket ?? "indisponible"}.</p>
      <div className="space-y-1">
        {variables.map(({ label, key, status, unit }) => {
          const sources = fusion.sourcesByVariable[key];
          const diagnostic = fusion.diagnosticsByVariable?.[key];
          return <div key={key} className="space-y-1">
            <p><strong className="text-slate-100">{label} :</strong> {diagnostic ? diagnosticStatusLabel(diagnostic) : evidenceStatusLabel(status)}{sources.length > 0 ? ` · ${sources.map((source) => `${source.modelName} (${(source.finalWeight * 100).toFixed(1)} %)`).join(", ")}` : ""}{sources.length > 0 && <span className="block pl-2 text-slate-400">{sources.map((source) => biasDescription(source, unit)).join("; ")}</span>}</p>
            {diagnostic && <div className="pl-2 text-slate-400">
              <p>Valeurs présentes : {diagnostic.availableValueModelCount}/{diagnostic.expectedModelCount} · preuves admissibles avant plafond : {diagnostic.evidenceEligibleModelCount} · contributeurs effectifs : {diagnostic.contributingModelCount}.</p>
              <p>{diagnostic.reason}</p>
              {diagnostic.availableModels.length > 0 && <p>Modèles avec valeur : {diagnostic.availableModels.join(", ")}.</p>}
              {diagnostic.evidenceEligibleModels.length > 0 && diagnostic.status === "weight_cap_blocked" && <p>Modèles admissibles avant plafond : {diagnostic.evidenceEligibleModels.join(", ")}.</p>}
              {diagnostic.modelReasons.length > 0 && <details className="mt-1">
                <summary className="cursor-pointer text-sky-100">Motif par modèle ({diagnostic.modelReasons.length})</summary>
                <ul className="list-inside list-disc pl-1">{diagnostic.modelReasons.map(({ modelName, reason: modelReason }) => <li key={`${key}-${modelName}`}>{modelName} — {modelReason}</li>)}</ul>
              </details>}
            </div>}
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

function HourlyMiniChart({ category }: { category: DetailCategory }) {
  const points = category.rows.filter(({ chartValue }) => chartValue !== null);
  if (points.length === 0) {
    return <p className="py-3 text-sm text-[#b8bbc2]">Aucune valeur horaire disponible pour cette mesure.</p>;
  }
  const maxValue = Math.max(...points.map(({ chartValue }) => chartValue ?? 0), 0);
  const barColor = category.key === "precipitation" ? "bg-[#a8c7fa]" : category.key === "wind" ? "bg-[#8ab4f8]" : "bg-[#bdc1c6]";

  return (
    <div role="group" aria-label={`${category.title}, graphique horaire en ${category.unit || "indice"}`} className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-2 scrollbar-hide touch-pan-x">
      <div className="flex w-max min-w-full items-end gap-2 pt-1">
        {points.map((point) => {
          const value = point.chartValue ?? 0;
          const height = maxValue === 0 ? 5 : Math.max(5, Math.round((value / maxValue) * 100));
          return (
            <div key={point.key} aria-label={`${point.time}: ${point.chartValueLabel}`} className="flex w-12 shrink-0 flex-col items-center gap-1 text-center">
              <span className="whitespace-nowrap text-[11px] tabular-nums text-[#d9dce2]">{point.chartValueLabel}</span>
              <div aria-hidden="true" className="flex h-12 w-8 items-end justify-center border-b border-white/15">
                <span className={`block w-5 rounded-t-sm ${barColor}`} style={{ height: `${height}%` }} />
              </div>
              <span className="whitespace-nowrap text-[10px] text-[#b8bbc2]">{point.time}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayDetailsAccordion({ category }: { category: DetailCategory }) {
  const notes = category.rows.filter(({ note }) => Boolean(note));
  return (
    <details className="group border-t border-sky-100/10 first:border-t-0">
      <summary className="flex min-h-[3.5rem] cursor-pointer list-none items-center gap-3 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-300/10 text-cyan-100"><MeteoIcon name={category.icon} size={16} /></span>
        <span className="min-w-0 flex-1 text-[14px] font-semibold text-slate-100">{category.title}</span>
        <span className="max-w-[42%] truncate text-xs tabular-nums text-slate-300">{category.summary}</span>
        <span aria-hidden="true" className="ml-1 text-xl leading-none text-sky-100/75 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="pb-4 pl-14 pr-1">
        <p className="mb-2 text-xs text-slate-300">{category.cadence === "hourly" ? "Valeurs horaires réellement fournies · défilez horizontalement pour parcourir les heures." : "Valeur quotidienne issue de la fusion officielle lorsque sa preuve est qualifiée; champs non pondérés indisponibles."}</p>
        {category.cadence === "hourly" ? <HourlyMiniChart category={category} /> : (
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
}: {
  hours: ForecastHour[];
  dailyDays: DailyForecastPoint[];
  dailySources: string[];
  activeHourIndex: number;
  hourlyWeighting?: unknown;
}) {
  const grouped = useMemo(() => groupOfficialHourlyForecastByDate(hours), [hours]);
  const displayDays = useMemo(() => buildForecastDisplayDays(hours, dailyDays), [hours, dailyDays]);
  const sourceLabels = useMemo(() => getDailyReferenceSourceLabels(dailySources), [dailySources]);
  const [selection, setSelection] = useState<ForecastTimelineSelection>({ dayDate: null, hourIndex: null, expanded: true });
  const selectedHourRef = useRef<HTMLButtonElement | null>(null);
  const selectedDayRef = useRef<HTMLButtonElement | null>(null);
  const hourStripRef = useRef<HTMLDivElement | null>(null);
  const dayStripRef = useRef<HTMLDivElement | null>(null);
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
  const detailCategories = selectedDay?.kind === "official-daily-fusion"
    ? selectedDaily ? buildDailyDetailCategories(selectedDaily) : []
    : selectedGroup ? buildHourlyDetailCategories(selectedGroup, hours) : [];
  const today = parisDateKey();
  const tomorrow = nextCalendarDate(today);
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
    const active = day.hourlyGroup?.hours.find(({ index }) => index === activeHourIndex);
    setSelection({ dayDate: day.date, hourIndex: active?.index ?? day.hourlyGroup?.hours[0]?.index ?? null, expanded: true });
  };
  const onHourPress = (index: number) => {
    if (!selectedGroup) return;
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
            aria-label={`Prévision ${selectedDay.kind === "official-hourly" ? "horaire officielle" : "fusion quotidienne officielle"} du ${dateText(selectedDay.date)}`}
            className="relative min-w-0 overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-slate-50 shadow-[0_10px_32px_rgba(2,8,23,0.38)]"
            style={sceneStyle}
          >
            <div className="relative z-10 px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-100/80">
                    {selectedDay.kind === "official-hourly" ? "Prévision horaire officielle" : "Prévision quotidienne officielle"}
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
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-100/75">Max / Min · fusion pondérée</p>
                    <p className="mt-0.5 whitespace-nowrap text-[2rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-4xl">
                      {formatOptionalForecastValue(selectedDaily?.tempMax, 1, "°")}<span className="px-1 text-[0.72em] text-sky-100/80">/</span>{formatOptionalForecastValue(selectedDaily?.tempMin, 1, "°")}
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

              {selectedDay.kind === "official-daily-fusion" && selectedDaily && (
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
              const isDailyFusion = day.kind === "official-daily-fusion";
              const temperatures = isDailyFusion
                ? `${formatOptionalForecastValue(day.daily?.tempMax, 0, "°")}/${formatOptionalForecastValue(day.daily?.tempMin, 0, "°")}`
                : "—/—";
              const buttonLabel = isDailyFusion
                ? `Prévision quotidienne officielle du ${dateText(day.date)}. Max ${formatOptionalForecastValue(day.daily?.tempMax, 1, "°")}, min ${formatOptionalForecastValue(day.daily?.tempMin, 1, "°")}. ${conditionDescription(condition) || "Condition indisponible"}.`
                : `Prévision horaire officielle du ${dateText(day.date)}. Extrêmes quotidiens non fournis. ${conditionDescription(condition) || "Condition indisponible"}.`;
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
                  <span className="block whitespace-nowrap text-[9px] font-semibold tabular-nums text-slate-100">{temperatures}</span>
                  {isDailyFusion && <span className="mt-1 block whitespace-nowrap text-[8px] font-bold text-cyan-100">Fusion</span>}
                </button>
              );
            })}
          </div>

          <section aria-label="Détails météo disponibles" className="rounded-2xl border border-sky-300/20 bg-slate-950/35 px-3">
            {detailCategories.map((category) => <DayDetailsAccordion key={category.key} category={category} />)}
            <AirQualityAccordion />
          </section>

          <details className="group px-1 text-xs text-slate-300">
            <summary className="min-h-10 cursor-pointer list-none py-2 font-medium text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80">Provenance et disponibilité des champs <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span></summary>
            {selectedDay.kind === "official-daily-fusion" && selectedDaily ? (
              <DailyFusionDiagnostics day={selectedDaily} sourceLabels={sourceLabels} />
            ) : (
              <>
                <p className="pb-2 leading-relaxed">Cette vue utilise uniquement la série horaire officielle à sept modèles, sans Best Match. Les variables sans valeur qualifiée restent indisponibles; les maxima/minima quotidiens ne sont pas reconstitués à partir d’un échantillon horaire incomplet.</p>
                <HourlyWeightingNotice weighting={hourlyWeighting as any} />
              </>
            )}
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
