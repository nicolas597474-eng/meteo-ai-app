import { describe, expect, it } from "vitest";
import {
  buildHourlySelectedDetails,
  HOURLY_SELECTED_DETAIL_COLORS,
} from "./hourlySelectedDetails";
import {
  getSelectedForecastHourIndex,
  groupOfficialHourlyForecastByDate,
  selectForecastHour,
} from "./forecastTimeline";

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16) / 255);
    const [red, green, blue] = channels.map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

describe("détails météo de l’échéance horaire sélectionnée", () => {
  it("affiche chaque champ météorologique autorisé du point officiel et exclut strictement les trois rubriques interdites", () => {
    const validAt = Date.parse("2026-10-06T16:00:00.000Z");
    const sourceHour = {
      validAt,
      condition: "partly_cloudy",
      temp: 18.2,
      apparentTemp: 17.4,
      precipitation: 0,
      windSpeed: 9,
      windGust: 13,
      windDirection: 350,
      humidity: 64,
      dewPoint: 11.7,
      cloudCover: 56,
      cloudLow: 0,
      cloudMid: 24,
      cloudHigh: 88,
      pressure: 1010,
      uvIndex: 0,
      visibility: 13.1,
      // Champs supplémentaires délibérément fournis ici pour vérifier qu’ils ne sont pas rendus.
      precipType: "rain",
      precipIntensity: "light",
      solarRadiation: 120,
      weatherCode: 61,
      multiModelMetrics: {
        source: "official_seven_models",
        bestMatchIncluded: false,
        precipitation: { thresholdMm: 0.1, rainModelCount: 2, availableModelCount: 7 },
      },
    };
    const details = buildHourlySelectedDetails(sourceHour, "18:00");

    expect(details.map(({ key }) => key)).toEqual([
      "condition", "temperature", "apparent", "precipitation", "windSpeed", "windGust",
      "windDirection", "humidity", "dewPoint", "cloudCover", "cloudLow", "cloudMid",
      "cloudHigh", "pressure", "uv", "visibility",
    ]);
    expect(details.map(({ title }) => title)).toEqual([
      "Condition", "Température de l’air", "Température ressentie", "Précipitations",
      "Vent moyen", "Rafales", "Direction du vent", "Humidité relative", "Point de rosée",
      "Nébulosité totale", "Nuages bas", "Nuages moyens", "Nuages hauts",
      "Pression atmosphérique", "Indice UV", "Visibilité",
    ]);
    expect(details.every((detail) => detail.validAt === validAt && detail.summary.endsWith(" · 18:00"))).toBe(true);
    expect(details.find(({ key }) => key === "temperature")?.value).toBe("18.2 °C");
    expect(details.find(({ key }) => key === "precipitation")?.value).toBe("0.0 mm");
    expect(details.find(({ key }) => key === "windDirection")?.value).toBe("N · 350.0°");
    expect(details.find(({ key }) => key === "cloudMid")?.value).toBe("24 %");
    expect(details.find(({ key }) => key === "uv")?.value).toBe("0.0");
    expect(details.find(({ key }) => key === "precipitation")?.note).toContain("2/7 modèles");
    expect(JSON.stringify(details)).not.toMatch(/Type et intensité|Rayonnement solaire|Code météo|precipType|precipIntensity|solarRadiation|weatherCode|W\/m²|61/);
  });

  it("signale chaque donnée absente sans la convertir en zéro ni masquer les autres valeurs", () => {
    const allMissing = buildHourlySelectedDetails({ validAt: null }, "—");
    expect(allMissing).toHaveLength(16);
    expect(allMissing.every((detail) => !detail.available && detail.value === "Indisponible")).toBe(true);
    expect(allMissing.every((detail) => detail.validAt === null)).toBe(true);

    const partial = buildHourlySelectedDetails({ temp: null, humidity: 52, precipitation: 0 }, "13:00");
    expect(partial.find(({ key }) => key === "temperature")).toMatchObject({ available: false, value: "Indisponible" });
    expect(partial.find(({ key }) => key === "humidity")).toMatchObject({ available: true, value: "52 %" });
    expect(partial.find(({ key }) => key === "precipitation")).toMatchObject({ available: true, value: "0.0 mm" });
  });

  it("fait suivre tous les champs à l’heure cliquée, y compris les heures locales répétées", () => {
    const hours = [
      {
        date: "2026-10-25",
        hour: "02:00",
        validAt: Date.parse("2026-10-25T00:00:00.000Z"),
        temp: 8,
        precipitation: 0.2,
        pressure: 1008,
        humidity: 50,
      },
      {
        date: "2026-10-25",
        hour: "02:00",
        validAt: Date.parse("2026-10-25T01:00:00.000Z"),
        temp: 6,
        precipitation: 1.4,
        pressure: 1006,
        humidity: 72,
      },
    ];
    const group = groupOfficialHourlyForecastByDate(hours).days[0]!;
    const selection = selectForecastHour(
      { dayDate: group.date, hourIndex: 0, expanded: true },
      group,
      1,
    );
    const selectedIndex = getSelectedForecastHourIndex(selection, group, 0);
    const selected = hours[selectedIndex!]!;
    const details = buildHourlySelectedDetails(selected, "02:00 · UTC+01");

    expect(selected.validAt).toBe(Date.parse("2026-10-25T01:00:00.000Z"));
    expect(details.every((detail) => detail.validAt === selected.validAt)).toBe(true);
    expect(details.find(({ key }) => key === "temperature")?.summary).toBe("6.0 °C · 02:00 · UTC+01");
    expect(details.find(({ key }) => key === "precipitation")?.summary).toBe("1.4 mm · 02:00 · UTC+01");
    expect(details.find(({ key }) => key === "pressure")?.summary).toBe("1006 hPa · 02:00 · UTC+01");
    expect(details.find(({ key }) => key === "humidity")?.summary).toBe("72 % · 02:00 · UTC+01");
  });

  it("attribue une couleur distincte à chaque champ avec un contraste suffisant sur le panneau sombre", () => {
    const colors = Object.values(HOURLY_SELECTED_DETAIL_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
    for (const foreground of colors) {
      expect(contrastRatio(foreground, "#020617")).toBeGreaterThanOrEqual(4.5);
    }
  });
});
