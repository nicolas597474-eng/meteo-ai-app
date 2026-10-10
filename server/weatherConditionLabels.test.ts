import { describe, expect, it } from "vitest";
import { conditionFromWeatherValues, conditionFromWmoWeatherCode, conditionFromWmoWeatherCodePreferingCloudCover } from "./weatherConditionLabels";

describe("conditionFromWeatherValues", () => {
  it("utilise les mêmes seuils de nébulosité que le régime étendu", () => {
    expect(conditionFromWeatherValues(0, 0)).toBe("Ensoleillé");
    expect(conditionFromWeatherValues(0, 36)).toBe("Peu nuageux");
    expect(conditionFromWeatherValues(0, 60)).toBe("Partiellement nuageux");
    expect(conditionFromWeatherValues(0, 90)).toBe("Ciel couvert");
  });

  it("conserve la priorité aux précipitations", () => {
    expect(conditionFromWeatherValues(2, 36)).toBe("Averses");
  });

  it("ne transforme pas des variables absentes ou invalides en ciel ensoleillé", () => {
    expect(conditionFromWeatherValues(null, null)).toBe("Conditions indisponibles");
    expect(conditionFromWeatherValues(0, null)).toBe("Nébulosité indisponible");
    expect(conditionFromWeatherValues(Number.NaN, Number.POSITIVE_INFINITY)).toBe("Conditions indisponibles");
    expect(conditionFromWmoWeatherCode(null, null, null)).toBe("Conditions indisponibles");
  });

  it("privilégie le code WMO de la source lorsqu’il décrit le temps présent", () => {
    expect(conditionFromWmoWeatherCode(0, 0, 100)).toBe("Ensoleillé");
    expect(conditionFromWmoWeatherCode(2, 0, 100)).toBe("Partiellement nuageux");
    expect(conditionFromWmoWeatherCode(3, 0, 20)).toBe("Ciel couvert");
    expect(conditionFromWmoWeatherCode(63, 0, 0)).toBe("Pluie");
  });
});

describe("conditionFromWmoWeatherCodePreferingCloudCover", () => {
  it("priorise la nébulosité réelle pour les codes WMO de ciel clair (0 à 3)", () => {
    expect(conditionFromWmoWeatherCodePreferingCloudCover(0, 0, 19)).toBe("Ensoleillé");
    expect(conditionFromWmoWeatherCodePreferingCloudCover(1, 0, 10.5)).toBe("Ensoleillé");
    expect(conditionFromWmoWeatherCodePreferingCloudCover(1, 0, 36)).toBe("Peu nuageux");
    expect(conditionFromWmoWeatherCodePreferingCloudCover(3, 0, 55)).toBe("Partiellement nuageux");
    expect(conditionFromWmoWeatherCodePreferingCloudCover(3, 0, 95)).toBe("Ciel couvert");
  });

  it("conserve la traduction des codes WMO de brouillard et de précipitations", () => {
    expect(conditionFromWmoWeatherCodePreferingCloudCover(45, 0, 5)).toBe("Brouillard");
    expect(conditionFromWmoWeatherCodePreferingCloudCover(63, 3, 10)).toBe("Pluie");
  });

  it("garde la priorité aux précipitations sur les codes de ciel clair", () => {
    expect(conditionFromWmoWeatherCodePreferingCloudCover(2, 2, 30)).toBe("Averses");
    expect(conditionFromWmoWeatherCodePreferingCloudCover(0, 6, 5)).toBe("Pluie forte");
  });

  it("retombe sur le code WMO lorsque la nébulosité est absente", () => {
    expect(conditionFromWmoWeatherCodePreferingCloudCover(1, 0, null)).toBe("Peu nuageux");
    expect(conditionFromWmoWeatherCodePreferingCloudCover(3, 0, null)).toBe("Ciel couvert");
    expect(conditionFromWmoWeatherCodePreferingCloudCover(null, null, null)).toBe("Conditions indisponibles");
  });
});
