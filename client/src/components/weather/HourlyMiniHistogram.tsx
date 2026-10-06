import React from "react";
import { formatOptionalForecastValue } from "@/lib/forecastTimeline";
import { formatHourlyDisplay } from "@/lib/hourlyDisplay";
import {
  HOURLY_HISTOGRAM_PALETTE,
  type HourlyHistogramCategoryKey,
  type HourlyHistogramForecast,
  type HourlyHistogramSeries,
} from "@/lib/hourlyMiniHistogram";

function compactUtcOffset(offsetLabel: string | null): string | null {
  if (!offsetLabel) return null;
  return offsetLabel.replace(/^Europe\/Paris\s+/, "").replace(/:00$/, "");
}

function barHeight(value: number, minimum: number, maximum: number): number {
  if (minimum === maximum) return 8;
  return 4 + ((value - minimum) / (maximum - minimum)) * 22;
}

function compactDateLabel(validAt: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
  }).format(validAt);
}

export function HourlyMiniHistogram<T extends HourlyHistogramForecast>({
  categoryKey,
  series,
  allHours,
}: {
  categoryKey: string;
  series: HourlyHistogramSeries<T>;
  allHours: readonly T[];
}) {
  const palette = HOURLY_HISTOGRAM_PALETTE[
    categoryKey as HourlyHistogramCategoryKey
  ];
  const availableValues = series.points
    .map(({ value }) => value)
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (!palette || availableValues.length === 0 || series.points.length === 0) return null;

  const minimum = Math.min(...availableValues);
  const maximum = Math.max(...availableValues);

  return (
    <div
      role="group"
      aria-label={`${series.label}${series.unit ? `, ${series.unit}` : ""} · valeurs horaires officielles · la couleur identifie la variable, pas la qualité ni la confiance`}
      className="mt-3 min-w-0 rounded-lg border border-slate-700/60 bg-slate-900/35 p-2"
    >
      <div className="mb-1 flex min-w-0 items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] font-semibold text-slate-100">{series.label}</p>
        {series.unit && <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{series.unit}</span>}
      </div>
      <div className="overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide">
        <div role="list" className="flex w-max min-w-full gap-x-0.5 pb-1">
          {series.points.map((point) => {
            const display = formatHourlyDisplay(point.hour, allHours);
            const valueLabel = point.value == null
              ? "—"
              : formatOptionalForecastValue(point.value, series.decimals);
            const dateLabel = compactDateLabel(point.validAt);
            const offsetLabel = compactUtcOffset(display.offsetLabel);
            const spokenTime = `${display.dateLabel}, ${display.hourLabel}${display.offsetLabel ? `, ${display.offsetLabel}` : ""}`;
            const spokenValue = point.value == null
              ? "valeur indisponible"
              : `${valueLabel}${series.unit ? ` ${series.unit}` : ""}`;
            return (
              <div
                key={point.key}
                role="listitem"
                aria-label={`${spokenTime} · ${series.label} ${spokenValue}`}
                title={`${spokenTime} · ${series.label} ${spokenValue}`}
                className="flex w-11 shrink-0 flex-col items-center text-center"
              >
                <span className="block h-4 max-w-full truncate text-[9px] leading-4 tabular-nums text-slate-200">
                  {valueLabel}
                </span>
                <span className="flex h-8 w-full items-end justify-center" aria-hidden="true">
                  {point.value != null && (
                    <span
                      className={`block w-4 rounded-t-sm ${palette.barClassName}`}
                      style={{ height: `${barHeight(point.value, minimum, maximum)}px` }}
                    />
                  )}
                </span>
                <span className="block w-full truncate text-[9px] leading-3 text-slate-500">{dateLabel}</span>
                <span className="block w-full truncate text-[10px] leading-3 tabular-nums text-slate-200">{display.hourLabel}</span>
                {offsetLabel && <span className="block w-full truncate text-[8px] leading-3 tabular-nums text-amber-200">{offsetLabel}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-0.5 text-[9px] leading-relaxed text-slate-500">Valeurs exactes indiquées; échelle visuelle propre à cette série. La couleur ne code ni qualité ni confiance.</p>
    </div>
  );
}
