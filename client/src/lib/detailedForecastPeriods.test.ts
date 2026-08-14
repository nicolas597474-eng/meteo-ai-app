import { describe, expect, it } from "vitest";
import { getDayPeriodHours, getForecastPeriod } from "./detailedForecastPeriods";

describe("detailedForecastPeriods", () => {
  it("répartit les heures de chaque date dans les quatre périodes", () => {
    const hours = [
      { date: "2026-08-15", hour: "03:00" },
      { date: "2026-08-15", hour: "08:00" },
      { date: "2026-08-15", hour: "14:00" },
      { date: "2026-08-15", hour: "20:00" },
      { date: "2026-08-16", hour: "08:00" },
    ];
    const periods = getDayPeriodHours("2026-08-15", hours);

    expect(periods.nuit).toHaveLength(1);
    expect(periods.matin).toHaveLength(1);
    expect(periods.apres_midi).toHaveLength(1);
    expect(periods.soir).toHaveLength(1);
  });

  it("gère correctement les limites des périodes", () => {
    expect(getForecastPeriod("06:00")).toBe("matin");
    expect(getForecastPeriod("12:00")).toBe("apres_midi");
    expect(getForecastPeriod("18:00")).toBe("soir");
    expect(getForecastPeriod("22:00")).toBe("nuit");
  });
});
