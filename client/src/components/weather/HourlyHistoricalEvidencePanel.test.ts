import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HourlyHistoricalEvidencePanel } from "./HourlyHistoricalEvidencePanel";

describe("HourlyHistoricalEvidencePanel coverage indication", () => {
  it("shows a per-variable indicative level separately from historical calibration", () => {
    const html = renderToStaticMarkup(createElement(HourlyHistoricalEvidencePanel, {
      variableWeightings: [
        { variable: "temperature", horizonBucket: "6_24h", contributingModelCount: 1, calibrationStatus: "UNCALIBRATED_ROBUST" },
        { variable: "wind_speed", horizonBucket: "6_24h", contributingModelCount: 2, calibrationStatus: "CALIBRATED" },
      ],
      horizonBucket: "6_24h",
      horizonUnavailableReason: null,
    }));

    expect(html).toContain("Niveau de couverture/confiance indicatif selon le nombre de contributeurs");
    expect(html).toContain("prévision d’un modèle unique (1 contributeur)");
    expect(html).toContain("confiance réduite (2 contributeurs)");
    expect(html).toContain("calibration UNCALIBRATED_ROBUST");
    expect(html).toContain("calibration CALIBRATED");
    expect(html).toContain("ni une probabilité ni une confiance statistiquement calibrée");
  });
});
