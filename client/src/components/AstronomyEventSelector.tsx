import * as React from "react";

export type AstronomyEventOption = {
  id: string;
  category: string;
  title: string;
  date: string;
  dateLabel: string;
};

type AstronomyEventSelectorProps = {
  events: AstronomyEventOption[];
  selectedEventId: string;
  onSelect: (eventId: string) => void;
};

export function AstronomyEventSelector({
  events,
  selectedEventId,
  onSelect,
}: AstronomyEventSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Sélection des événements astronomiques"
      className="astronomy-event-scroll flex min-w-0 snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain px-3 py-2"
      data-horizontal-scroll
      data-swipe-exclude
    >
      {events.map(event => {
        const isSelected = event.id === selectedEventId;
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event.id)}
            aria-pressed={isSelected}
            aria-label={`${event.category} : ${event.title}, ${event.dateLabel}`}
            className={`flex min-h-[4.25rem] min-w-[11rem] max-w-[14rem] shrink-0 snap-start flex-col items-start justify-center gap-1 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
              isSelected
                ? "bg-sky-400/10 text-sky-50"
                : "bg-transparent text-slate-300 hover:bg-sky-300/[0.05]"
            }`}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">
                {event.category}
              </span>
              {isSelected && (
                <span className="shrink-0 text-[10px] font-semibold text-sky-100">
                  Choisi
                </span>
              )}
            </span>
            <span className="w-full whitespace-normal text-xs font-semibold leading-snug">
              {event.title}
            </span>
            <time
              dateTime={event.date}
              className="text-xs leading-tight text-slate-300"
            >
              {event.dateLabel}
            </time>
          </button>
        );
      })}
    </div>
  );
}
