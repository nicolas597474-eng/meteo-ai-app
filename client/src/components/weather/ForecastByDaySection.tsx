import { useEffect, useMemo, useRef, useState } from "react";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { HourlyWeightingNotice } from "@/components/weather/HourlyWeightingNotice";
import { formatHourlyDisplay } from "@/lib/hourlyDisplay";
import { getWeatherLandscapeImage } from "@/lib/weatherImages";
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

function buildDetailCategories(
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

  const firstAvailable = (rows: DetailRow[]) => {
    const row = rows.find(({ chartValue }) => chartValue !== null) ?? rows[0];
    return row ? `${row.value} · ${row.time}` : "—";
  };

  return [
    { key: "precipitation", title: "Précipitations", icon: "precipitation", summary: firstAvailable(precipitationRows), unit: "mm", rows: precipitationRows },
    { key: "wind", title: "Vent", icon: "wind_param", summary: firstAvailable(windRows), unit: "km/h", rows: windRows },
    { key: "humidity", title: "Humidité", icon: "humidity", summary: firstAvailable(humidityRows), unit: "%", rows: humidityRows },
  ].filter(({ key, rows }) => ["precipitation", "wind", "humidity"].includes(key) || rows.length > 0);
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
    <details className="group border-t border-white/[0.10] first:border-t-0">
      <summary className="flex min-h-[3.5rem] cursor-pointer list-none items-center gap-3 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a8c7fa]/80">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#35373d] text-[#b6ccf8]"><MeteoIcon name={category.icon} size={16} /></span>
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-[#eceef2]">{category.title}</span>
        <span className="max-w-[42%] truncate text-sm tabular-nums text-[#b8bbc2]">{category.summary}</span>
        <span aria-hidden="true" className="ml-1 text-xl leading-none text-[#c4c7ce] transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="pb-4 pl-14 pr-1">
        <p className="mb-2 text-xs text-[#aeb3bd]">Valeurs horaires fournies · défilez horizontalement pour parcourir les heures.</p>
        <HourlyMiniChart category={category} />
        {notes.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-white/[0.08] pt-2 text-xs leading-relaxed text-[#b8bbc2]">
            {notes.map((row) => <p key={row.key}>{row.time} · {row.note}</p>)}
            {category.key === "precipitation" && <p className="pt-1 text-[#d0d4dc]">Les comptes de modèles décrivent une fréquence brute, jamais une probabilité de pluie calibrée.</p>}
          </div>
        )}
      </div>
    </details>
  );
}

function AirQualityAccordion() {
  return (
    <details className="group border-t border-white/[0.10]">
      <summary className="flex min-h-[3.5rem] cursor-pointer list-none items-center gap-3 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a8c7fa]/80">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#35373d] text-[#b6ccf8]"><MeteoIcon name="cloud_cover" size={16} /></span>
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-[#eceef2]">Qualité de l’air</span>
        <span className="text-sm text-[#b8bbc2]">Indisponible</span>
        <span aria-hidden="true" className="ml-1 text-xl leading-none text-[#c4c7ce] transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <p className="pb-4 pl-14 pr-2 text-sm leading-relaxed text-[#b8bbc2]">La qualité de l’air ne fait pas partie du contrat météo de cette page. Aucune mesure n’est affichée.</p>
    </details>
  );
}

export function ForecastByDaySection({
  hours,
  activeHourIndex,
  hourlyWeighting,
}: {
  hours: ForecastHour[];
  activeHourIndex: number;
  hourlyWeighting?: unknown;
}) {
  const grouped = useMemo(() => groupOfficialHourlyForecastByDate(hours), [hours]);
  const [selection, setSelection] = useState<ForecastTimelineSelection>({ dayDate: null, hourIndex: null, expanded: true });
  const selectedHourRef = useRef<HTMLButtonElement | null>(null);
  const selectedDayRef = useRef<HTMLButtonElement | null>(null);
  const hourStripRef = useRef<HTMLDivElement | null>(null);
  const dayStripRef = useRef<HTMLDivElement | null>(null);
  const initialSelection = useMemo(
    () => getInitialForecastTimelineSelection(grouped.days, activeHourIndex),
    [grouped.days, activeHourIndex],
  );
  const selectedGroup = grouped.days.find(({ date }) => date === selection.dayDate)
    ?? grouped.days.find(({ date }) => date === initialSelection.dayDate);
  const selectedDayDate = selectedGroup?.date ?? null;
  const selectedHourIndex = selectedGroup
    ? getSelectedForecastHourIndex(selection, selectedGroup, activeHourIndex)
    : null;
  const selectedEntry = selectedGroup?.hours.find(({ index }) => index === selectedHourIndex);
  const detailCategories = selectedGroup ? buildDetailCategories(selectedGroup, hours) : [];
  const today = parisDateKey();
  const tomorrow = nextCalendarDate(today);
  const selectedConditionSource = selectedEntry?.hour.condition?.trim() ?? "";
  const selectedCondition = conditionDescription(selectedConditionSource);
  const selectedConditionIcon = conditionIconName(selectedConditionSource);
  const sceneStyle = selectedConditionSource && selectedConditionIcon !== "calendar"
    ? { backgroundImage: `linear-gradient(180deg, rgba(32, 33, 36, 0.12), rgba(32, 33, 36, 0.16)), url("${getWeatherLandscapeImage(selectedConditionSource)}")` }
    : undefined;

  useEffect(() => {
    centerWithinHorizontalStrip(hourStripRef.current, selectedHourRef.current);
  }, [selectedGroup?.date, selectedHourIndex]);

  useEffect(() => {
    centerWithinHorizontalStrip(dayStripRef.current, selectedDayRef.current);
  }, [selectedDayDate]);

  const onDayPress = (group: ForecastDayGroup<ForecastHour>) => {
    const active = group.hours.find(({ index }) => index === activeHourIndex);
    setSelection({ dayDate: group.date, hourIndex: active?.index ?? group.hours[0]?.index ?? null, expanded: true });
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
      {selectedGroup ? (
        <>
          <section aria-label={`Prévision horaire du ${dateText(selectedGroup.date)}`} className="min-w-0 overflow-hidden rounded-[18px] bg-[#292a2e] text-[#f1f3f4] ring-1 ring-white/[0.055]">
            <div className="px-4 pb-2 pt-3 sm:px-5 sm:pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="forecast-by-day-title" className="truncate text-base font-medium tracking-tight text-[#f1f3f4]">{dateLabel(selectedGroup.date, today, tomorrow) || dateText(selectedGroup.date)}</h2>
                </div>
                <span className="shrink-0 pt-1 text-[10px] font-medium tracking-wide text-[#aeb3bd]">MeteoAI</span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 shrink items-center gap-1.5">
                  <div className="min-w-0">
                    <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#bdc1c6]">Max / Min · jour</p>
                    <p aria-label="Températures maximale et minimale quotidiennes indisponibles" className="mt-0.5 whitespace-nowrap text-[2rem] font-normal leading-none tracking-[-0.06em] text-[#f1f3f4] sm:text-4xl">—°<span className="px-0.5 text-[0.72em] text-[#c4c7ce]">/</span>—°</p>
                    <p className="sr-only">Extrêmes quotidiens non fournis</p>
                  </div>
                  {selectedConditionIcon !== "calendar" && <MeteoIcon name={selectedConditionIcon} size={28} />}
                </div>
                <div className="flex min-w-0 flex-col items-end text-right">
                  <p className="max-w-[9rem] whitespace-normal break-words text-[13px] font-medium leading-tight text-[#eceef2]">{selectedCondition || "Condition indisponible"}</p>
                  <p className="mt-1 text-[10px] text-[#bdc1c6]">Ressenti <span className="ml-1 tabular-nums text-[#eceef2]">{formatOptionalForecastValue(selectedEntry?.hour.apparentTemp, 0, "°")}</span></p>
                </div>
              </div>
            </div>

            <div className="border-y border-white/[0.08] py-2">
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
                      className={`forecast-hour-cell w-[3.25rem] shrink-0 snap-start rounded-lg px-1 py-0.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a8c7fa]/80 ${isHourSelected ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}
                    >
                      <span className="block min-h-4 text-[12px] font-medium tabular-nums text-[#e8eaed]">{formatOptionalForecastValue(entry.hour.temp, 0, "°")}</span>
                      <MeteoIcon name={icon} size={19} />
                      <span className={`mt-0.5 block text-[10px] tabular-nums ${isHourSelected ? "text-[#d7e3fc]" : "text-[#bdc1c6]"}`}>{display.hourLabel}</span>
                      {display.offsetLabel && <span className="block text-[9px] text-amber-200">{display.offsetLabel}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div aria-hidden="true" className="h-[3.5rem] bg-[#202124] bg-cover bg-center sm:h-20" style={{ ...sceneStyle, backgroundColor: "#202124" }} />
          </section>

          <div ref={dayStripRef} role="group" aria-label="Jours de prévision défilables" className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 scrollbar-hide touch-pan-x">
            {grouped.days.map((group) => {
              const first = group.hours[0];
              const condition = first?.hour.condition;
              const isSelected = selectedDayDate === group.date;
              const buttonLabel = `Prévision du ${dateText(group.date)}. Températures max et min quotidiennes indisponibles.${condition ? ` ${conditionDescription(condition)}.` : ""}`;
              return (
                <button
                  key={group.date}
                  type="button"
                  ref={isSelected ? selectedDayRef : undefined}
                  aria-label={buttonLabel}
                  aria-pressed={isSelected}
                  onClick={() => onDayPress(group)}
                  className={`forecast-day-tile w-[3.65rem] shrink-0 snap-start rounded-xl border px-1.5 py-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a8c7fa]/80 ${isSelected ? "border-[#e8eaed] bg-[#303136]" : "border-transparent bg-[#25262a] hover:bg-[#303136]"}`}
                >
                  <span className="block truncate text-[11px] text-[#c4c7ce]">{shortWeekday(group.date)}</span>
                  <span className="my-1 flex justify-center"><MeteoIcon name={conditionIconName(condition)} size={19} /></span>
                  <span className="block whitespace-nowrap text-[9px] tabular-nums text-[#d9dce2]">—°/—°</span>
                </button>
              );
            })}
          </div>
          <p className="sr-only">Les valeurs max et min par jour ne sont pas présentes dans le contrat horaire ; elles restent indisponibles.</p>

          <section aria-label="Détails horaires par mesure" className="border-y border-white/[0.11] px-2">
            {detailCategories.map((category) => <DayDetailsAccordion key={category.key} category={category} />)}
            <AirQualityAccordion />
          </section>

          <details className="group px-1 text-xs text-[#aeb3bd]">
            <summary className="min-h-10 cursor-pointer list-none py-2 font-medium text-[#c4c7ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a8c7fa]/80">Provenance et disponibilité des champs <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span></summary>
            <p className="pb-2 leading-relaxed">Cette vue utilise uniquement la série horaire officielle à sept modèles, sans Best Match. Les champs absents restent indisponibles; aucun maximum, minimum ou cumul quotidien n’est recalculé à partir des heures.</p>
            <HourlyWeightingNotice weighting={hourlyWeighting as any} />
          </details>
        </>
      ) : (
        <div className="rounded-2xl bg-[#292a2e] px-4 py-5 text-sm leading-relaxed text-[#d9dce2]" role="status">
          <h2 id="forecast-by-day-title" className="font-semibold text-[#f1f3f4]">Prévisions</h2>
          <p className="mt-2">Aucune échéance horaire officielle datée n’est disponible pour organiser les prévisions par jour.</p>
          {grouped.undatedHours > 0 && <p className="mt-1 text-[#aeb3bd]">{grouped.undatedHours} échéance(s) sans date locale explicite n’ont pas été regroupées; aucune date n’a été déduite de l’horodatage UTC.</p>}
        </div>
      )}
      {grouped.days.length > 0 && grouped.undatedHours > 0 && <p className="px-1 text-xs text-amber-100/80">{grouped.undatedHours} échéance(s) sans date locale explicite ne sont pas affichées dans les bandes.</p>}
    </section>
  );
}
