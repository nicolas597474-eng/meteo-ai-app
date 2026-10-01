import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HourlyWeightingNotice } from "./HourlyWeightingNotice";

const sevenModels = ["AROME", "ARPEGE", "ICON", "ECMWF", "GFS", "GEM", "UKMET"];

describe("HourlyWeightingNotice", () => {
  it("annonce l’indisponibilité faute d’historique suffisant et liste les modèles qui ont des données", () => {
    const html = renderToStaticMarkup(createElement(HourlyWeightingNotice, { weighting: {
      status: "unavailable",
      historyStatus: "available",
      minimumComparisons: 30,
      minimumComparableDays: 7,
      modelsWithData: sevenModels,
      horizons: [{
        variable: "temperature",
        horizonBucket: "6_24h",
        method: "unavailable",
        unavailableReason: "insufficient_historical_evidence",
        hourCount: 4,
        modelNamesWithData: sevenModels,
      }],
    } }));

    expect(html).toContain("Prévision officielle horaire indisponible");
    expect(html).toContain("historique comparable est insuffisant");
    expect(html).toContain("30 comparaisons sur 7 jours");
    expect(html).toContain("AROME, ARPEGE, ICON, ECMWF, GFS, GEM, UKMET");
    expect(html).toContain("Best Match est exclu");
    expect(html).not.toContain("Repli égalitaire");
  });

  it("distingue les variables et échéances calibrées des variables indisponibles", () => {
    const html = renderToStaticMarkup(createElement(HourlyWeightingNotice, { weighting: {
      status: "mixed",
      historyStatus: "available",
      minimumComparisons: 30,
      minimumComparableDays: 7,
      modelsWithData: ["AROME", "UKMET"],
      horizons: [
        { variable: "temperature", horizonBucket: "6_24h", method: "historical_skill", unavailableReason: null, hourCount: 3, modelNamesWithData: ["AROME", "UKMET"] },
        { variable: "wind_speed", horizonBucket: "6_24h", method: "unavailable", unavailableReason: "insufficient_historical_evidence", hourCount: 3, modelNamesWithData: ["AROME", "UKMET"] },
      ],
    } }));

    expect(html).toContain("Calibrées : température (6_24h)");
    expect(html).toContain("Indisponibles : historique de calibration insuffisant : vent (6_24h)");
    expect(html).toContain("aucune moyenne de secours");
  });
});
