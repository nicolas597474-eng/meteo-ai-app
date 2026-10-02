import { describe, expect, it } from "vitest";
import { buildLiveAILabSnapshot } from "./aiLabLiveSnapshot";

describe("buildLiveAILabSnapshot", () => {
  const models = [
    { serviceName: "AROME", tempMax: 20, tempMin: 11, precipitation: 1, windSpeed: 10, windGust: 18, humidity: 70, cloudCover: 55, condition: "Nuageux" },
    { serviceName: "ECMWF", tempMax: 20.4, tempMin: 11.2, precipitation: 1.2, windSpeed: 11, windGust: 19, humidity: 71, cloudCover: 57, condition: "Nuageux" },
  ];

  it("produit une trace de modèles pour une position non archivée", () => {
    const snapshot = buildLiveAILabSnapshot("2026-08-18", models, new Date("2026-08-18T05:00:00Z"));
    expect(snapshot?.weights.trace.sourceCount).toBe(2);
    expect(snapshot?.weights.trigger).toBe("live-position");
    expect(snapshot?.confidenceScore).toBeNull();
    expect(snapshot?.weights.trace.calibrationStatus.tempMax).toBe("insufficient_data");
    expect(snapshot?.tempMax).toBeNull();
    expect(snapshot?.stabilityIndex).toBeGreaterThanOrEqual(0);
  });

  it("ne crée pas de snapshot lorsque les modèles sont indisponibles", () => {
    expect(buildLiveAILabSnapshot("2026-08-18", [])).toBeNull();
  });
});
