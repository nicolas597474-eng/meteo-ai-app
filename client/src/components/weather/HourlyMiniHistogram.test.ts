import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HourlyMiniHistogram } from "./HourlyMiniHistogram";
import { buildHourlyHistogramSeries, type HourlyHistogramForecast } from "@/lib/hourlyMiniHistogram";

describe("rendu des mini-histogrammes horaires", () => {
  it("rend un axe dense mais défilable, avec valeurs exactes et les deux instants d’une heure répétée", () => {
    const hours: HourlyHistogramForecast[] = [
      { date: "2026-10-25", hour: "02:00", validAt: Date.parse("2026-10-25T00:00:00.000Z"), precipitation: 0.2 },
      { date: "2026-10-25", hour: "02:00", validAt: Date.parse("2026-10-25T01:00:00.000Z"), precipitation: null },
      { date: "2026-10-25", hour: "03:00", validAt: Date.parse("2026-10-25T02:00:00.000Z"), precipitation: 1.4 },
    ];
    const series = buildHourlyHistogramSeries(
      "precipitation",
      hours.map((hour, index) => ({ index, hour })),
      hours[0].validAt!,
    )[0];
    const html = renderToStaticMarkup(createElement(HourlyMiniHistogram, {
      categoryKey: "precipitation",
      series,
      allHours: hours,
    }));

    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("touch-pan-x");
    expect(html).toContain("gap-x-0.5");
    expect(html).toContain("w-max min-w-full");
    expect(html.match(/role="listitem"/g)).toHaveLength(3);
    expect(html).toContain("0.2");
    expect(html).toContain("1.4");
    expect(html).toContain("—");
    expect(html).toContain("UTC+02");
    expect(html).toContain("UTC+01");
    expect(html).toContain("bg-sky-400");
    expect(html).toContain("La couleur ne code ni qualité ni confiance");
  });

  it("ne rend aucun histogramme s’il n’y a pas de valeur numérique disponible", () => {
    const hours: HourlyHistogramForecast[] = [
      { date: "2026-10-06", hour: "18:00", validAt: Date.parse("2026-10-06T16:00:00.000Z"), precipitation: null },
    ];
    const series = buildHourlyHistogramSeries(
      "precipitation",
      hours.map((hour, index) => ({ index, hour })),
      hours[0].validAt!,
    );

    expect(series).toEqual([]);
    expect(renderToStaticMarkup(createElement(HourlyMiniHistogram, {
      categoryKey: "precipitation",
      series: { field: "precipitation", label: "Précipitations", unit: "mm", decimals: 1, points: [] },
      allHours: hours,
    }))).toBe("");
  });
});
