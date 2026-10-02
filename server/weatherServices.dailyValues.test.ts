import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWeatherMock } = vi.hoisted(() => ({ fetchWeatherMock: vi.fn() }));

vi.mock("./weatherFetch", () => ({
  fetchWeather: fetchWeatherMock,
  getWeatherResponseAttemptCount: vi.fn(() => 1),
}));

import { collectExpertForecasts } from "./weatherServices";

const targetDate = "2026-10-02";

function responseForDaily(daily: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ daily }),
  };
}

describe("collectExpertForecasts — valeurs quotidiennes exploitables", () => {
  beforeEach(() => fetchWeatherMock.mockReset());

  it("rejette une réponse qui contient la date mais aucune valeur météorologique numérique", async () => {
    fetchWeatherMock.mockResolvedValue(responseForDaily({
      time: [targetDate],
      temperature_2m_max: [null],
      temperature_2m_min: [null],
      precipitation_sum: [null],
      wind_speed_10m_max: [null],
      wind_gusts_10m_max: [null],
      relative_humidity_2m_mean: [null],
      cloud_cover_mean: [null],
    }));

    await expect(collectExpertForecasts(targetDate)).resolves.toEqual([]);
    expect(fetchWeatherMock).toHaveBeenCalledTimes(8);
  });

  it("compte zéro millimètre comme une valeur exploitable plutôt que comme une donnée manquante", async () => {
    fetchWeatherMock.mockResolvedValue(responseForDaily({
      time: [targetDate],
      temperature_2m_max: [null],
      temperature_2m_min: [null],
      precipitation_sum: [0],
      wind_speed_10m_max: [null],
      wind_gusts_10m_max: [null],
      relative_humidity_2m_mean: [null],
      cloud_cover_mean: [null],
    }));

    const forecasts = await collectExpertForecasts(targetDate);

    expect(forecasts).toHaveLength(8);
    expect(forecasts[0]).toMatchObject({ precipitation: 0 });
  });
});
