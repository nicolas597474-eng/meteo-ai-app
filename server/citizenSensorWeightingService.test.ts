import { describe, expect, it } from "vitest";
import type { OpenSenseMapQualificationEvidence, OpenSenseMapQualificationStatus } from "./openSenseMapQualificationService";
import {
  CITIZEN_SENSOR_WEIGHTING_VERSION,
  CITIZEN_SENSOR_WEIGHT_MAX_MULTIPLIER,
  CITIZEN_SENSOR_WEIGHT_MIN_MULTIPLIER,
  CITIZEN_SENSOR_WEIGHT_PRIOR_COMPARISONS,
  deriveCitizenSensorWeights,
  type CitizenSensorWeightEvidenceEntry,
} from "./citizenSensorWeightingService";

// Fixtures de test only : preuves synthétiques, aucune observation réelle.

const AS_OF = Date.parse("2026-10-11T12:00:00Z");

function evidenceFixture(overrides: Partial<OpenSenseMapQualificationEvidence> = {}): OpenSenseMapQualificationEvidence {
  return {
    comparisons: 9,
    retainedComparisons: 9,
    outlierComparisons: 0,
    distinctDays: 3,
    officialStationsUsed: ["mf-70260", "mf-70290"],
    meanOfficialDisagreementC: 0.4,
    acceptanceBoundC: 1.3,
    meanAbsoluteErrorC: 0.6,
    meanBiasC: 0.1,
    firstComparedAt: "2026-10-05T09:00:00.000Z",
    lastComparedAt: "2026-10-07T11:00:00.000Z",
    ...overrides,
  };
}

function entryFixture(
  stationId: string,
  status: OpenSenseMapQualificationStatus,
  evidence: OpenSenseMapQualificationEvidence,
): CitizenSensorWeightEvidenceEntry {
  return { stationId, status, evidence };
}

describe("deriveCitizenSensorWeights", () => {
  it("ignore tout capteur non validé : le verdict persisté reste l'autorité de participation", () => {
    const set = deriveCitizenSensorWeights({
      entries: [
        entryFixture("osm-candidate", "candidate", evidenceFixture()),
        entryFixture("osm-excluded", "excluded", evidenceFixture({ meanAbsoluteErrorC: 2.4 })),
        entryFixture("osm-valide-sans-mae", "validated", evidenceFixture({ meanAbsoluteErrorC: null, meanBiasC: null })),
      ],
      windowDays: 30,
      evaluatedAt: AS_OF,
    });
    expect(set.weights).toEqual([]);
    expect(set.version).toBe(CITIZEN_SENSOR_WEIGHTING_VERSION);
  });

  it("régularise le MAE vers la médiane des capteurs validés selon la preuve", () => {
    // Deux capteurs validés : MAE 0,4 et 1,2 → médiane 0,8. Avec 9
    // comparaisons retenues, la fiabilité vaut 9/39 : le MAE régularisé
    // reste proche de la médiane, la hiérarchie reste mesurée.
    const set = deriveCitizenSensorWeights({
      entries: [
        entryFixture("osm-precis", "validated", evidenceFixture({ meanAbsoluteErrorC: 0.4 })),
        entryFixture("osm-bruite", "validated", evidenceFixture({ meanAbsoluteErrorC: 1.2, meanBiasC: -0.3 })),
      ],
      windowDays: 30,
      evaluatedAt: AS_OF,
    });
    expect(set.weights).toHaveLength(2);
    const reliability = 9 / (9 + CITIZEN_SENSOR_WEIGHT_PRIOR_COMPARISONS);
    const precis = set.weights.find((weight) => weight.stationId === "osm-precis")!;
    const bruite = set.weights.find((weight) => weight.stationId === "osm-bruite")!;
    expect(precis.regularizedMaeC).toBeCloseTo(0.8 + reliability * (0.4 - 0.8), 10);
    expect(bruite.regularizedMaeC).toBeCloseTo(0.8 + reliability * (1.2 - 0.8), 10);
    // Capteur plus précis → poids plus élevé ; biais archivé mais jamais appliqué.
    expect(precis.performanceMultiplier).toBeGreaterThan(bruite.performanceMultiplier);
    expect(precis.meanBiasC).toBeCloseTo(0.1, 10);
    expect(bruite.meanBiasC).toBeCloseTo(-0.3, 10);
    expect(precis.sampleReliability).toBeCloseTo(reliability, 10);
    expect(set.windowDays).toBe(30);
    expect(set.evaluatedAt).toBe(AS_OF);
  });

  it("borne le multiplicateur : ni domination, ni suppression", () => {
    const set = deriveCitizenSensorWeights({
      entries: [
        entryFixture("osm-parfait", "validated", evidenceFixture({ meanAbsoluteErrorC: 0.05, comparisons: 300, retainedComparisons: 300 })),
        entryFixture("osm-drive", "validated", evidenceFixture({ meanAbsoluteErrorC: 8, comparisons: 300, retainedComparisons: 300 })),
      ],
      windowDays: 30,
      evaluatedAt: AS_OF,
    });
    const parfait = set.weights.find((weight) => weight.stationId === "osm-parfait")!;
    const drive = set.weights.find((weight) => weight.stationId === "osm-drive")!;
    expect(parfait.performanceMultiplier).toBe(CITIZEN_SENSOR_WEIGHT_MAX_MULTIPLIER);
    expect(drive.performanceMultiplier).toBe(CITIZEN_SENSOR_WEIGHT_MIN_MULTIPLIER);
  });

  it("garde un capteur seul au MAE mesuré, plafonné au plancher du MAE", () => {
    const set = deriveCitizenSensorWeights({
      entries: [
        entryFixture("osm-seul", "validated", evidenceFixture({ meanAbsoluteErrorC: 0.3, comparisons: 300, retainedComparisons: 300 })),
      ],
      windowDays: 30,
      evaluatedAt: AS_OF,
    });
    expect(set.weights).toHaveLength(1);
    expect(set.weights[0].regularizedMaeC).toBeCloseTo(0.3, 10);
    expect(set.weights[0].performanceMultiplier).toBe(CITIZEN_SENSOR_WEIGHT_MAX_MULTIPLIER);
  });
});
