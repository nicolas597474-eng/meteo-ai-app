import { describe, expect, it } from "vitest";
import { resolveMeteoFranceProvenance, type RealForecastResult, wmoToConditionFr } from "./realWeatherAPIs";

const forecast: RealForecastResult = {
  serviceName: "Météo-France",
  serviceCategory: "public",
  tempMax: 20,
  tempMin: 10,
  precipitation: 1,
  windSpeed: 15,
  windGust: 30,
  humidity: 70,
  cloudCover: 50,
  condition: "Nuageux",
  rawData: null,
};

describe("wmoToConditionFr", () => {
  it("aligne les descriptions WMO de ciel avec les catégories de régime", () => {
    expect(wmoToConditionFr(0)).toBe("Ensoleillé");
    expect(wmoToConditionFr(1)).toBe("Peu nuageux");
    expect(wmoToConditionFr(2)).toBe("Partiellement nuageux");
    expect(wmoToConditionFr(3)).toBe("Ciel couvert");
  });
});

describe("resolveMeteoFranceProvenance", () => {
  const checkedAt = "2026-09-02T05:00:00.000Z";

  it("privilégie le flux authentifié et le garde hors production", () => {
    const result = resolveMeteoFranceProvenance(true, forecast, forecast, checkedAt);
    expect(result.forecast).toBe(forecast);
    expect(result.provenance).toMatchObject({
      status: "official",
      provider: "meteofrance-authenticated",
      shadowMode: true,
      appliedToProduction: false,
      checkedAt,
    });
  });

  it("identifie explicitement le repli Open-Meteo AROME/ARPEGE", () => {
    const result = resolveMeteoFranceProvenance(false, null, forecast, checkedAt);
    expect(result.forecast).toBe(forecast);
    expect(result.provenance.status).toBe("fallback");
    expect(result.provenance.provider).toBe("open-meteo-meteofrance");
    expect(result.provenance.upstreamModels).toEqual(["AROME", "ARPEGE"]);
    expect(result.provenance.fallbackReason).toContain("Clé");
  });

  it("archive une indisponibilité explicite sans fabriquer de prévision", () => {
    const result = resolveMeteoFranceProvenance(false, null, null, checkedAt);
    expect(result.forecast).toBeNull();
    expect(result.provenance.status).toBe("unavailable");
    expect(result.provenance.provider).toBeNull();
    expect(result.provenance.appliedToProduction).toBe(false);
  });
});
