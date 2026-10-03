import { useMemo, useState } from "react";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { HourlyWeightingNotice } from "@/components/weather/HourlyWeightingNotice";
import { formatHourlyDisplay } from "@/lib/hourlyDisplay";
import {
  formatOptionalForecastValue,
  getInitialForecastTimelineSelection,
  getSelectedForecastHourIndex,
  groupOfficialHourlyForecastByDate,
  isOfficialSevenModelSource,
  selectForecastDay,
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

type DetailRow = { key: string; time: string; value: string; note?: string };
type DetailCategory = { key: string; title: string; icon: string; rows: DetailRow[] };

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
  const value = new Date(`${date}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "Europe/Paris" }).format(value);
}

function dateText(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(value);
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
      ? `${metrics.rainModelCount}/${metrics.availableModelCount} modèles au seuil${isFiniteValue(metrics.thresholdMm) ? ` ≥ ${formatOptionalForecastValue(metrics.thresholdMm, 1, " mm")}` : ""} · dénombrement non calibré`
      : undefined;
    return [{ key: `rain-${entry.index}`, time: time(entry), value: formatOptionalForecastValue(value, 1, " mm"), note: notes }];
  });

  const windRows: DetailRow[] = entries.flatMap((entry) => {
    const { windSpeed, windGust, windDirection } = entry.hour;
    if (![windSpeed, windGust, windDirection].some(isFiniteValue)) return [];
    const pieces = [
      isFiniteValue(windSpeed) ? `Vent ${formatOptionalForecastValue(windSpeed, 0, " km/h")}` : null,
      isFiniteValue(windGust) ? `Rafales ${formatOptionalForecastValue(windGust, 0, " km/h")}` : null,
      isFiniteValue(windDirection) ? `Direction ${windDirectionLabel(windDirection)}` : null,
    ].filter((value): value is string => value != null);
    return [{ key: `wind-${entry.index}`, time: time(entry), value: pieces.join(" · ") }];
  });

  const humidityRows: DetailRow[] = entries.flatMap((entry) => {
    const humidity = entry.hour.humidity;
    const dewPoint = entry.hour.dewPoint;
    if (!isFiniteValue(humidity) && !isFiniteValue(dewPoint)) return [];
    return [{
      key: `humidity-${entry.index}`,
      time: time(entry),
      value: [
        isFiniteValue(humidity) ? `${formatOptionalForecastValue(humidity, 0, "%")}` : null,
        isFiniteValue(dewPoint) ? `Rosée ${formatOptionalForecastValue(dewPoint, 0, "°")}` : null,
      ].filter((value): value is string => value != null).join(" · "),
    }];
  });

  const cloudRows: DetailRow[] = entries.flatMap((entry) => {
    const { cloudCover, cloudLow, cloudMid, cloudHigh } = entry.hour;
    if (![cloudCover, cloudLow, cloudMid, cloudHigh].some(isFiniteValue)) return [];
    const layers = [
      isFiniteValue(cloudLow) ? `bas ${formatOptionalForecastValue(cloudLow, 0, "%")}` : null,
      isFiniteValue(cloudMid) ? `moy. ${formatOptionalForecastValue(cloudMid, 0, "%")}` : null,
      isFiniteValue(cloudHigh) ? `haut ${formatOptionalForecastValue(cloudHigh, 0, "%")}` : null,
    ].filter((value): value is string => value != null);
    return [{
      key: `cloud-${entry.index}`,
      time: time(entry),
      value: isFiniteValue(cloudCover) ? formatOptionalForecastValue(cloudCover, 0, "%") : layers.join(" · "),
      note: isFiniteValue(cloudCover) && layers.length ? layers.join(" · ") : undefined,
    }];
  });

  const pressureRows: DetailRow[] = entries.flatMap((entry) => isFiniteValue(entry.hour.pressure)
    ? [{ key: `pressure-${entry.index}`, time: time(entry), value: formatOptionalForecastValue(entry.hour.pressure, 0, " hPa") }]
    : []);
  const uvRows: DetailRow[] = entries.flatMap((entry) => isFiniteValue(entry.hour.uvIndex)
    ? [{ key: `uv-${entry.index}`, time: time(entry), value: formatOptionalForecastValue(entry.hour.uvIndex, 0) }]
    : []);

  return [
    { key: "precipitation", title: "Pluie", icon: "precipitation", rows: precipitationRows },
    { key: "wind", title: "Vent, rafales et direction", icon: "wind_param", rows: windRows },
    { key: "humidity", title: "Humidité", icon: "humidity", rows: humidityRows },
    { key: "clouds", title: "Nuages", icon: "cloud_cover", rows: cloudRows },
    { key: "pressure", title: "Pression", icon: "pressure", rows: pressureRows },
    { key: "uv", title: "Indice UV", icon: "sunny", rows: uvRows },
  ].filter(({ rows }) => rows.length > 0);
}

function DayDetailsAccordion({ category }: { category: DetailCategory }) {
  return (
    <details className="group border-t border-white/10 first:border-t-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-left text-xs font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70">
        <MeteoIcon name={category.icon} size={14} />
        <span className="flex-1">{category.title}</span>
        <span className="text-[9px] font-normal text-slate-400">{category.rows.length} créneau(x)</span>
        <span aria-hidden="true" className="text-sky-200 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="pb-2">
        {category.rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 border-t border-white/[0.06] py-1.5 text-[10px]">
            <span className="text-slate-400">{row.time}</span>
            <span className="min-w-0 text-slate-100">{row.value}{row.note && <span className="mt-0.5 block text-[9px] leading-relaxed text-slate-400">{row.note}</span>}</span>
          </div>
        ))}
      </div>
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
  const currentSelection: ForecastTimelineSelection = selectedGroup
    ? {
        dayDate: selectedGroup.date,
        hourIndex: selectedHourIndex,
        expanded: selection.dayDate === selectedGroup.date ? selection.expanded : initialSelection.expanded,
      }
    : initialSelection;
  const selectedEntry = selectedGroup?.hours.find(({ index }) => index === selectedHourIndex);
  const selectedHourDisplay = selectedEntry ? formatHourlyDisplay(selectedEntry.hour, hours) : null;
  const detailCategories = selectedGroup ? buildDetailCategories(selectedGroup, hours) : [];
  const today = parisDateKey();
  const tomorrow = nextCalendarDate(today);

  const onDayPress = (group: ForecastDayGroup<ForecastHour>) => {
    setSelection((previous) => selectForecastDay(currentSelection.dayDate ? currentSelection : previous, group, activeHourIndex));
  };
  const onHourPress = (index: number) => {
    if (selectedGroup) setSelection(selectForecastHour(currentSelection, selectedGroup, index));
  };

  return (
    <MeteoSurface as="section" tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-white/10 bg-[rgba(26,48,70,0.56)] p-2 sm:rounded-[26px] sm:p-3" aria-labelledby="forecast-by-day-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-sky-200/20 bg-sky-300/10"><MeteoIcon name="calendar" size={18} /></span>
          <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-100/55">Déroulé temporel · heures officielles</p><h2 id="forecast-by-day-title" className="mt-0.5 text-lg font-semibold tracking-tight text-white">Prévisions par jour</h2></div>
        </div>
        <span className="shrink-0 rounded-full border border-sky-200/20 bg-sky-300/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-sky-100">{grouped.days.length} jour(s)</span>
      </div>

      <HourlyWeightingNotice weighting={hourlyWeighting as any} />
      <p className="mb-3 text-[10px] leading-relaxed text-slate-400">Seule la série horaire officielle (sept modèles; Best Match n’est pas compté) alimente cette vue, distincte du snapshot météo courant. L’API ne fournit pas de synthèse quotidienne cohérente avec cette série : Tmin/Tmax, cumul de pluie et vent quotidiens restent indisponibles; l’ancien agrégat 16 jours n’est pas utilisé ni recalculé depuis les heures.</p>

      {grouped.days.length > 0 ? (
        <>
          <div role="group" aria-label="Jours de prévision défilables" className="-mx-2 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-2 pb-2 scrollbar-hide touch-pan-x">
            {grouped.days.map((group) => {
              const first = group.hours[0];
              const firstDisplay = first ? formatHourlyDisplay(first.hour, hours) : null;
              const firstCondition = first?.hour.condition;
              const firstPrecipitation = first?.hour.precipitation;
              const firstWind = first?.hour.windSpeed;
              const precipitationMetrics = first ? officialPrecipitationMetrics(first.hour) : null;
              const isSelected = selectedDayDate === group.date;
              const expanded = isSelected && currentSelection.expanded;
              const buttonLabel = `${dateLabel(group.date, today, tomorrow)} ${dateText(group.date)}. Prévision quotidienne indisponible. ${group.hours.length} créneau(x) horaire(s) officiel(s).`;
              return (
                <button
                  key={group.date}
                  type="button"
                  aria-label={buttonLabel}
                  aria-pressed={isSelected}
                  aria-expanded={expanded}
                  aria-controls="selected-day-details"
                  onClick={() => onDayPress(group)}
                  className={`w-[min(82vw,18rem)] shrink-0 snap-start rounded-2xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70 ${isSelected ? "border-sky-200/60 bg-sky-300/[0.09]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.045]"}`}
                >
                  <span className="flex items-start gap-2.5">
                    <MeteoIcon name={firstCondition ? getIconNameFromCondition(firstCondition) : "calendar"} size={25} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5"><span className="truncate text-xs font-semibold capitalize text-white">{dateLabel(group.date, today, tomorrow)}</span><span className="truncate text-[9px] text-slate-400">{dateText(group.date)}</span></span>
                      <span className="mt-0.5 block text-[9px] text-slate-300">{firstCondition ?? "Condition indisponible"}{firstDisplay ? ` · première échéance ${firstDisplay.hourLabel}` : ""}</span>
                    </span>
                    <span aria-hidden="true" className={`shrink-0 text-sm text-sky-100 transition-transform ${expanded ? "rotate-180" : ""}`}>⌄</span>
                  </span>
                  <span className="mt-2 grid grid-cols-2 gap-x-3 border-t border-white/[0.08] pt-2 text-[9px]">
                    <span className="text-slate-400">Tmin <b className="font-semibold text-slate-200">—</b></span>
                    <span className="text-slate-400">Tmax <b className="font-semibold text-slate-200">—</b></span>
                    <span className="mt-1 text-slate-400">Pluie <b className="font-semibold text-slate-200">{formatOptionalForecastValue(firstPrecipitation, 1, " mm")}</b></span>
                    <span className="mt-1 text-slate-400">Vent <b className="font-semibold text-slate-200">{formatOptionalForecastValue(firstWind, 0, " km/h")}</b></span>
                  </span>
                  <span className="mt-1.5 block text-[8px] text-slate-500">Valeurs Pluie/Vent au premier créneau · {group.hours.length} heure(s) datée(s)</span>
                  {precipitationMetrics && isFiniteValue(precipitationMetrics.rainModelCount) && isFiniteValue(precipitationMetrics.availableModelCount) && (
                    <span className="mt-1 block text-[8px] text-sky-100/75">Pluie au premier créneau : {precipitationMetrics.rainModelCount}/{precipitationMetrics.availableModelCount} modèles au seuil · dénombrement non calibré</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mb-3 text-center text-[9px] text-slate-500">← Faites glisser pour parcourir les jours →</p>

          {selectedGroup && (
            <div id="selected-day-details" hidden={!currentSelection.expanded} role="region" aria-label={`Détails horaires du ${dateText(selectedGroup.date)}`} className="border-t border-white/10 pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold text-white">{dateLabel(selectedGroup.date, today, tomorrow)} · heures officielles</h3>
                <span className="text-[9px] text-slate-400">{selectedGroup.hours.length} échéance(s)</span>
              </div>
              <div role="group" aria-label="Heures de prévision défilables" className="-mx-2 mt-2 flex snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain px-2 pb-2 scrollbar-hide touch-pan-x">
                {selectedGroup.hours.map((entry) => {
                  const display = formatHourlyDisplay(entry.hour, hours);
                  const isHourSelected = entry.index === selectedHourIndex;
                  const isActiveForecast = entry.index === activeHourIndex;
                  return (
                    <button
                      key={`${entry.hour.date ?? "date-absente"}-${entry.hour.hour ?? "heure-absente"}-${entry.index}`}
                      type="button"
                      aria-pressed={isHourSelected}
                      aria-label={`${display.dateLabel}, ${display.hourLabel}${display.offsetLabel ? `, ${display.offsetLabel}` : ""}, ${formatOptionalForecastValue(entry.hour.temp, 1, "°")}${isActiveForecast ? ", prévision active" : ""}`}
                      onClick={() => onHourPress(entry.index)}
                      className={`w-[5.25rem] shrink-0 snap-start rounded-xl border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70 ${isHourSelected ? "border-sky-200/60 bg-sky-300/[0.09]" : "border-white/10 bg-white/[0.02]"}`}
                    >
                      <span className={`block text-xs font-semibold ${isHourSelected ? "text-sky-100" : "text-white"}`}>{display.hourLabel}</span>
                      {display.offsetLabel && <span className="block text-[7px] text-amber-200">{display.offsetLabel}</span>}
                      <span className="mt-1 block text-[10px] text-slate-300">{formatOptionalForecastValue(entry.hour.temp, 1, "°")}</span>
                      {isActiveForecast && <span className="mt-1 block text-[7px] font-semibold uppercase leading-tight text-sky-200">Prévision active</span>}
                    </button>
                  );
                })}
              </div>
              <p className="mb-2 text-center text-[9px] text-slate-500">← Faites glisser pour parcourir les heures →</p>

              {selectedEntry && selectedHourDisplay && (
                <div className="border-t border-white/[0.08] py-2">
                  <div className="flex items-start gap-2.5">
                    <MeteoIcon name={selectedEntry.hour.condition ? getIconNameFromCondition(selectedEntry.hour.condition) : "calendar"} size={23} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-sky-100/70">Créneau sélectionné · {selectedHourDisplay.hourLabel}{selectedHourDisplay.offsetLabel ? ` · ${selectedHourDisplay.offsetLabel}` : ""}</p>
                      <p className="mt-0.5 text-[11px] text-slate-200">{selectedEntry.hour.condition ?? "Condition indisponible"}</p>
                      <p className="mt-1 text-lg font-semibold text-white">{formatOptionalForecastValue(selectedEntry.hour.temp, 1, "°")}<span className="ml-2 text-[10px] font-normal text-slate-400">ressenti {formatOptionalForecastValue(selectedEntry.hour.apparentTemp, 0, "°")}</span></p>
                      {selectedEntry.index === activeHourIndex && <p className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-sky-200">Échéance prévisionnelle active · snapshot courant séparé</p>}
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-white/10 pt-2">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Détails du jour · valeurs horaires réelles, non agrégées</p>
                {detailCategories.length > 0 ? detailCategories.map((category) => <DayDetailsAccordion key={category.key} category={category} />) : <p className="py-2 text-[10px] text-slate-400">Aucun détail catégoriel n’est disponible pour ces heures dans le contrat horaire.</p>}
                <p className="mt-2 text-[9px] leading-relaxed text-slate-500">Qualité de l’air absente du contrat de cette page; la pression, les nuages et l’indice UV ne s’affichent que lorsqu’une valeur horaire est fournie. Les compteurs pluie ne sont pas des probabilités calibrées.</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div role="status" className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[10px] leading-relaxed text-slate-300">
          <p>Aucune échéance horaire officielle datée n’est disponible pour organiser les prévisions par jour.</p>
          {grouped.undatedHours > 0 && <p className="mt-1 text-slate-400">{grouped.undatedHours} échéance(s) sans date locale contractuelle n’ont pas été regroupées; aucune date n’a été déduite de l’horodatage UTC.</p>}
        </div>
      )}
      {grouped.days.length > 0 && grouped.undatedHours > 0 && <p className="mt-2 text-[9px] text-amber-100/80">{grouped.undatedHours} échéance(s) sans date locale explicite ne sont pas affichées dans les bandes.</p>}
    </MeteoSurface>
  );
}
