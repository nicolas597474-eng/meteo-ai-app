import { describe, expect, it } from "vitest";
import { buildHourlySelectedDetails } from "./hourlySelectedDetails";
import {
  getSelectedForecastHourIndex,
  groupOfficialHourlyForecastByDate,
  selectForecastHour,
} from "./forecastTimeline";

describe("détails météo de l’échéance horaire sélectionnée", () => {
  it("affiche les composantes brutes au validTime exact et exclut les catégories hors périmètre", () => {
    const validAt = Date.parse("2026-10-06T16:00:00.000Z");
    const details = buildHourlySelectedDetails(
      {
        validAt,
        temp: 18.2,
        apparentTemp: 17.4,
        precipitation: 0,
        precipitationComponents: [
          { modelName: "AROME", rain: 0, showers: null, snowfall: 0.3 },
          { modelName: "GFS", rain: null, showers: 0.4, snowfall: null },
        ],
        precipType: "rain",
        precipIntensity: "light",
        windSpeed: 9,
        windDirection: 350,
        windGust: 13,
        humidity: 64,
        dewPoint: 11.7,
        cloudCover: 56,
        cloudLow: 0,
        cloudMid: 24,
        cloudHigh: 88,
        pressure: 1010,
        uvIndex: 0,
        visibility: 13.1,
        solarRadiation: 0,
        weatherCode: 61,
        multiModelMetrics: {
          source: "official_seven_models",
          bestMatchIncluded: false,
          precipitation: {
            thresholdMm: 0.1,
            rainModelCount: 2,
            availableModelCount: 7,
          },
        },
      },
      "18:00"
    );

    expect(details.map(({ title }) => title)).toEqual([
      "Précipitations",
      "Pluie",
      "Averses",
      "Neige",
      "Vent",
      "Humidité et rosée",
      "Nuages",
      "Pression",
      "Indice UV",
      "Température ressentie",
      "Visibilité",
      "Qualité de l’air",
    ]);
    expect(
      details.every(
        detail =>
          detail.validAt === validAt && detail.summary.endsWith(" · 18:00")
      )
    ).toBe(true);
    expect(details.find(({ key }) => key === "precipitation")?.value).toContain(
      "0.0 mm"
    );
    expect(details.find(({ key }) => key === "rain")?.value).toBe("AROME 0.0 mm · GFS — mm");
    expect(details.find(({ key }) => key === "showers")?.value).toBe("AROME — mm · GFS 0.4 mm");
    expect(details.find(({ key }) => key === "snowfall")?.value).toBe("AROME 0.3 cm · GFS — cm");
    expect(details.find(({ key }) => key === "rain")?.note).toContain("aucune moyenne");
    expect(details.find(({ key }) => key === "wind")?.value).toContain(
      "direction N (350.0°)"
    );
    expect(details.find(({ key }) => key === "clouds")?.value).toContain(
      "moyennes 24 % · hautes 88 %"
    );
    expect(details.find(({ key }) => key === "uv")?.value).toBe("0.0");
    expect(details.find(({ key }) => key === "air-quality")?.value).toBe(
      "Non disponible"
    );
    expect(details.some(({ key }) => ["precip-type", "radiation", "weather-code"].includes(key))).toBe(false);
    expect(details.find(({ key }) => key === "precipitation")?.note).toContain(
      "2/7 modèles"
    );
  });

  it("garde chaque ligne et chaque sous-champ avec un tiret si les valeurs ne sont pas fournies", () => {
    const details = buildHourlySelectedDetails({ validAt: null }, "—");

    expect(details).toHaveLength(12);
    for (const key of [
      "precipitation",
      "rain",
      "showers",
      "snowfall",
      "wind",
      "humidity",
      "clouds",
      "pressure",
      "uv",
      "apparent",
      "visibility",
    ]) {
      expect(details.find(detail => detail.key === key)?.value).toContain("—");
    }
    expect(details.find(({ key }) => key === "wind")?.value).toBe(
      "Vent — km/h · direction — · rafales — km/h"
    );
    expect(details.find(({ key }) => key === "clouds")?.value).toBe(
      "Total — % · basses — % · moyennes — % · hautes — %"
    );
    expect(details.find(({ key }) => key === "air-quality")?.note).toContain(
      "Aucune donnée horaire"
    );
    expect(details.every(detail => detail.validAt === null)).toBe(true);
    expect(details.some(({ key }) => ["precip-type", "radiation", "weather-code"].includes(key))).toBe(false);
  });

  it("fait suivre toutes les lignes à l’heure cliquée, y compris deux heures locales répétées", () => {
    const hours = [
      {
        date: "2026-10-25",
        hour: "02:00",
        validAt: Date.parse("2026-10-25T00:00:00.000Z"),
        temp: 8,
        precipitation: 0.2,
        pressure: 1008,
      },
      {
        date: "2026-10-25",
        hour: "02:00",
        validAt: Date.parse("2026-10-25T01:00:00.000Z"),
        temp: 6,
        precipitation: 1.4,
        pressure: 1006,
      },
    ];
    const group = groupOfficialHourlyForecastByDate(hours).days[0];
    const selection = selectForecastHour(
      { dayDate: group.date, hourIndex: 0, expanded: true },
      group,
      1
    );
    const selectedIndex = getSelectedForecastHourIndex(selection, group, 0);
    const selected = hours[selectedIndex!];
    const details = buildHourlySelectedDetails(selected, "02:00 · UTC+01");

    expect(selected.validAt).toBe(Date.parse("2026-10-25T01:00:00.000Z"));
    expect(details.every(detail => detail.validAt === selected.validAt)).toBe(
      true
    );
    expect(details.find(({ key }) => key === "precipitation")?.summary).toBe(
      "Quantité 1.4 mm · 02:00 · UTC+01"
    );
    expect(details.find(({ key }) => key === "pressure")?.summary).toBe(
      "1006 hPa · 02:00 · UTC+01"
    );
    expect(details.find(({ key }) => key === "apparent")?.summary).toBe(
      "— °C · 02:00 · UTC+01"
    );
  });

  it("affiche la provenance et la fraîcheur inconnue du champ horaire complété", () => {
    const validAt = Date.parse("2026-10-06T12:00:00.000Z");
    const details = buildHourlySelectedDetails(
      {
        validAt,
        humidity: 55,
        fallbackProvenance: {
          humidity: {
            provider: "OpenWeatherMap",
            endpoint: "https://api.openweathermap.org/data/2.5/forecast",
            product: "Forecast 5 jours / 3 heures",
            validAt,
            retrievedAt: "2026-10-06T12:05:00.000Z",
            providerRunAt: null,
            upstreamFreshness: "unknown",
          },
        },
      },
      "14:00"
    );

    expect(details.find(({ key }) => key === "humidity")?.value).toContain(
      "Humidité 55 %"
    );
    expect(details.find(({ key }) => key === "humidity")?.note).toContain(
      "OpenWeatherMap"
    );
    expect(details.find(({ key }) => key === "humidity")?.note).toContain(
      "validTime UTC 2026-10-06T12:00:00.000Z"
    );
    expect(details.find(({ key }) => key === "humidity")?.note).toContain(
      "fraîcheur amont inconnue"
    );
    expect(details.find(({ key }) => key === "wind")?.note).toBeUndefined();
  });
});
