import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./WeatherDetails.tsx", import.meta.url), "utf8");

describe("WeatherDetails", () => {
  it("garde les cartes heure par heure sur le jour courant tout en conservant les heures des autres jours", () => {
    expect(source).toContain("visibleHourlyCards");
    expect(source).toContain("hour.date === data?.today");
    expect(source).toContain("getDayPeriodHours(dayDate, hours)");
  });

  it("déplie les quatre périodes détaillées pour chaque date disponible", () => {
    expect(source).toContain("FORECAST_PERIODS.map");
    expect(source).toContain("FORECAST_PERIOD_LABELS[p].label");
    expect(source).toContain("4 périodes ▼");
    expect(source).not.toContain("Découpage horaire disponible uniquement pour aujourd'hui et demain");
  });

  it("améliore la lisibilité des cartes par période sur mobile", () => {
    expect(source).toContain("min-h-[210px]");
    expect(source).toContain("text-sm text-white font-semibold");
    expect(source).toContain("Précipitations");
  });
});
