import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { OfficialWeatherSnapshot } from "./officialWeatherSnapshot";
import { buildAILabForecastComparisonReadModel, formatAILabLocationLabel } from "./aiLabForecastComparison";

const snapshot = {
  locationKey: "50.756_2.521",
  weatherDate: "2026-10-02",
  validAt: "2026-10-02T19:00",
  computedAt: "2026-10-02T17:02:00.000Z",
  hourlyComputedAt: "2026-10-02T17:01:00.000Z",
  sourceKind: "official_forecast",
  source: "open-meteo",
  hourlyWeighting: {
    modelsConsidered: ["AROME", "ARPEGE", "ICON", "ECMWF", "GFS", "GEM", "UKMET"],
    bestMatchIncluded: false,
  },
  currentSnapshot: {
    sourceKind: "model_current_snapshot",
    source: "open-meteo",
    capturedAt: "2026-10-02T17:00:00.000Z",
    temp: 18.25,
  },
  hourly: [
    {
      date: "2026-10-02",
      hour: "19:00",
      validAt: Date.parse("2026-10-02T17:00:00.000Z"),
      temp: 19.5,
      forecastWeighting: { modelsWithData: ["AROME", "ECMWF"] },
    },
  ],
  daily: [
    { date: "2026-10-02", tempMax: 21.4, tempMin: 12.1 },
  ],
  modelsUsed: ["ECMWF", "GFS", "ICON", "Open-Meteo"],
} as unknown as OfficialWeatherSnapshot;

describe("AI Lab forecast comparison read-model", () => {
  it("formate le lieu AI Lab depuis les coordonnées de la requête ou reste neutre", () => {
    expect(formatAILabLocationLabel({ lat: 50.7567, lon: 2.5204 })).toBe("le point demandé (50.7567°N, 2.5204°E)");
    expect(formatAILabLocationLabel({ lat: -33.8651, lon: -151.2099 })).toBe("le point demandé (33.8651°S, 151.2099°O)");
    expect(formatAILabLocationLabel(null)).toBe("le lieu sélectionné");
  });

  it("branche le libellé formaté dans l’analyse AI Lab sans lieu hardcodé", () => {
    const source = readFileSync(new URL("./routers/weather.ts", import.meta.url), "utf8");
    const start = source.indexOf("// 7. AI Analysis text");
    const end = source.indexOf("const officialPrecipitationSummary", start);
    const analysis = source.slice(start, end);

    expect(analysis).toContain("formatAILabLocationLabel(coords)");
    expect(analysis).not.toContain("Hondeghem");
  });

  it("projects the model snapshot, official hourly series and daily forecast as distinct products", () => {
    const result = buildAILabForecastComparisonReadModel(snapshot, { lat: 50.756, lon: 2.521 });

    expect(result).toMatchObject({
      timeZone: "Europe/Paris",
      coordinates: { lat: 50.756, lon: 2.521 },
      currentSnapshotSource: { sourceKind: "model_current_snapshot", source: "open-meteo" },
      currentSnapshot: {
        sourceKind: "model_current_snapshot",
        source: "open-meteo",
        capturedAt: "2026-10-02T17:00:00.000Z",
        temp: 18.25,
      },
      hourlyForecast: {
        sourceKind: "official_forecast",
        source: "open-meteo",
        computedAt: "2026-10-02T17:01:00.000Z",
        modelsConsidered: ["AROME", "ARPEGE", "ICON", "ECMWF", "GFS", "GEM", "UKMET"],
        bestMatchIncluded: false,
        points: [{ validAt: Date.parse("2026-10-02T17:00:00.000Z"), temp: 19.5, modelsWithData: ["AROME", "ECMWF"] }],
      },
      dailyForecast: {
        source: "open-meteo",
        computedAt: "2026-10-02T17:02:00.000Z",
        modelsUsed: ["ECMWF", "GFS", "ICON", "Open-Meteo"],
        days: [{ date: "2026-10-02", tempMax: 21.4, tempMin: 12.1 }],
      },
    });
    expect(result.currentSnapshot).not.toEqual(result.hourlyForecast.points[0]);
    expect(result).not.toHaveProperty("stations");
    expect(result).not.toHaveProperty("observation");
  });

  it("retains unavailable values as null instead of fabricating a comparison value", () => {
    const missing = {
      ...snapshot,
      currentSnapshot: null,
      hourly: [{ date: "2026-10-02", hour: "19:00", validAt: undefined, temp: null }],
      daily: [{ date: "2026-10-02", tempMax: null, tempMin: null }],
    } as unknown as OfficialWeatherSnapshot;

    const result = buildAILabForecastComparisonReadModel(missing, { lat: 50.756, lon: 2.521 });

    expect(result.currentSnapshot).toBeNull();
    expect(result.hourlyForecast.points[0]).toMatchObject({ validAt: null, temp: null });
    expect(result.dailyForecast.days[0]).toMatchObject({ tempMax: null, tempMin: null });
  });
});
