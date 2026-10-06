import React from "react";
import type { HourlySelectedDetail } from "../../lib/hourlySelectedDetails";

type HourlySelectedDetailsPanelProps = {
  details: readonly HourlySelectedDetail[];
  describeCondition: (condition: string) => string;
  variant?: "summary" | "details";
  heading?: string;
  provenance?: string;
};

export function HourlySelectedDetailsPanel({
  details,
  describeCondition,
  variant = "details",
  heading,
  provenance,
}: HourlySelectedDetailsPanelProps) {
  if (details.length === 0) return null;

  const isSummary = variant === "summary";
  return (
    <div className={isSummary
      ? "mt-3 rounded-xl border border-sky-100/15 bg-slate-950/35 p-2.5 sm:p-3"
      : "border-t border-sky-100/10 py-3"}
    >
      {heading && (
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-sky-100">
          {heading}
        </h3>
      )}
      {provenance && (
        <p aria-label="Provenance de l’échéance horaire sélectionnée" className="mb-2 whitespace-normal break-words text-[10px] leading-relaxed text-slate-300">
          {provenance}
        </p>
      )}
      <div
        aria-label={isSummary ? "Résumé des mesures météo horaires sélectionnées" : "Mesures météo de l’échéance horaire sélectionnée"}
        className={isSummary
          ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
          : "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"}
      >
        {details.map((detail) => {
          const value = detail.key === "condition" && detail.available
            ? describeCondition(detail.value) || detail.value
            : detail.value;
          return (
            <article
              key={detail.key}
              aria-label={`${detail.title} à ${detail.timeLabel} : ${value}`}
              data-hourly-detail-field={detail.key}
              className={`min-w-0 rounded-xl border ${isSummary ? "px-2 py-2" : "px-3 py-2.5"}`}
              style={{ borderColor: detail.color, backgroundColor: "#020617" }}
            >
              <h4 className="whitespace-normal break-words text-[11px] font-semibold leading-snug" style={{ color: detail.color }}>
                {detail.title}
              </h4>
              <p className={`mt-1 whitespace-normal break-words font-bold leading-snug tabular-nums ${isSummary ? "text-sm" : "text-base"}`} style={{ color: detail.color }}>
                {value}
              </p>
              {detail.note && (
                <p className={`mt-1 whitespace-normal break-words leading-relaxed text-slate-300 ${isSummary ? "text-[9px]" : "text-[10px]"}`}>
                  {detail.note}
                </p>
              )}
            </article>
          );
        })}
      </div>
      {!isSummary && (
        <p className="mt-3 rounded-lg border border-amber-200/25 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-100">
          Variables non fournies par le backend pour cette série horaire : qualité de l’air et probabilité calibrée de précipitations. Les champs indisponibles restent signalés sans remplacement.
        </p>
      )}
    </div>
  );
}
