import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AstronomyEventSelector,
  type AstronomyEventOption,
} from "./AstronomyEventSelector";

const events: AstronomyEventOption[] = [
  {
    id: "meteor-2026",
    category: "Météores",
    title: "Essaim des Perséides",
    date: "2026-08-12",
    dateLabel: "12 août 2026",
  },
  {
    id: "lunar-2026",
    category: "Lunaire",
    title: "Éclipse lunaire partielle",
    date: "2026-08-28",
    dateLabel: "28 août 2026",
  },
  {
    id: "solar-2027",
    category: "Solaire",
    title: "Éclipse solaire partielle",
    date: "2027-08-02",
    dateLabel: "2 août 2027",
  },
];

describe("AstronomyEventSelector — rendu mobile", () => {
  it("rend toutes les catégories, les titres et les dates dans une rangée que l’on peut balayer horizontalement", () => {
    const markup = renderToStaticMarkup(
      createElement(AstronomyEventSelector, {
        events,
        selectedEventId: "lunar-2026",
        onSelect: () => undefined,
      })
    );

    expect(markup).toContain('role="group"');
    expect(markup).toContain(
      'aria-label="Sélection des événements astronomiques"'
    );
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("data-horizontal-scroll");
    expect(markup).toContain("data-swipe-exclude");
    expect(markup).toContain("min-h-[4.25rem]");
    expect(markup).toContain("min-w-[11rem]");
    expect(markup).toContain("max-w-[14rem]");
    for (const label of [
      "Météores",
      "Lunaire",
      "Solaire",
      "12 août 2026",
      "28 août 2026",
      "2 août 2027",
    ]) {
      expect(markup).toContain(label);
    }
  });

  it("arrondit la zone sélectionnée et la met en valeur sans la détacher du style du panneau", () => {
    const markup = renderToStaticMarkup(
      createElement(AstronomyEventSelector, {
        events,
        selectedEventId: "lunar-2026",
        onSelect: () => undefined,
      })
    );

    expect(markup).toContain("rounded-2xl");
    expect(markup).toContain("bg-sky-400/15");
    expect(markup).toContain("ring-sky-300/45");
    expect(markup).not.toContain("border-slate-");
    expect(markup).not.toContain("border-sky-");
  });

  it("prolonge la rangée d’une fine piste sombre dont la capsule bleu clair glisse jusqu’à l’événement choisi", () => {
    const markup = renderToStaticMarkup(
      createElement(AstronomyEventSelector, {
        events,
        selectedEventId: "lunar-2026",
        onSelect: () => undefined,
      })
    );

    expect(markup).toContain("h-1 rounded-full bg-slate-800");
    expect(markup).toContain("rounded-full bg-sky-400");
    const segmentWidth = 100 / events.length;
    expect(markup).toContain(`width:${segmentWidth}%;left:${segmentWidth}%`);
  });

  it("transmet l’identifiant de la carte activée au gestionnaire de sélection", () => {
    const onSelect = vi.fn();
    const tree = AstronomyEventSelector({
      events,
      selectedEventId: "lunar-2026",
      onSelect,
    });
    const rootChildren = (
      tree.props as unknown as {
        children: Array<{
          props: { children: Array<{ props: { onClick: () => void } }> };
        }>;
      }
    ).children;
    const buttons = rootChildren[0].props.children;

    buttons[2].props.onClick();
    expect(onSelect).toHaveBeenCalledWith("solar-2027");
  });

  it("expose clairement la sélection actuelle aux technologies d’assistance et visuellement", () => {
    const markup = renderToStaticMarkup(
      createElement(AstronomyEventSelector, {
        events,
        selectedEventId: "lunar-2026",
        onSelect: () => undefined,
      })
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("Choisi");
    expect(markup).toContain("Essaim des Perséides");
    expect(markup).toContain("Éclipse lunaire partielle");
    expect(markup).toContain("Éclipse solaire partielle");
  });
});
