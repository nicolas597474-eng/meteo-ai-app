import { describe, expect, it } from "vitest";
import type {
  OpenSenseMapQualificationEvidence,
  OpenSenseMapQualificationStatus,
  QualificationComparison,
} from "./openSenseMapQualificationService";
import {
  CITIZEN_ANOMALY_DETECTION_VERSION,
  CITIZEN_ANOMALY_RECENT_WINDOW_DAYS,
  deriveCitizenSensorAnomalies,
  type CitizenSensorAnomalyEntry,
} from "./citizenSensorAnomalyService";

// Fixtures de test only : preuves et comparaisons synthétiques, aucune observation réelle.

const AS_OF = Date.parse("2026-10-11T12:00:00Z");

function baselineFixture(overrides: Partial<OpenSenseMapQualificationEvidence> = {}): OpenSenseMapQualificationEvidence {
  return {
    comparisons: 24,
    retainedComparisons: 24,
    outlierComparisons: 0,
    distinctDays: 12,
    officialStationsUsed: ["mf-70260", "mf-70290"],
    meanOfficialDisagreementC: 0.4,
    acceptanceBoundC: 1.3,
    meanAbsoluteErrorC: 0.5,
    meanBiasC: 0.05,
    firstComparedAt: "2026-09-12T09:00:00.000Z",
    lastComparedAt: "2026-10-10T11:00:00.000Z",
    ...overrides,
  };
}

function comparisonFixture(day: string, hour: number, error: number): QualificationComparison {
  const epoch = Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  return {
    error,
    officialDisagreement: 0.4,
    utcDay: new Date(epoch).toISOString().slice(0, 10),
    comparedAt: epoch,
  };
}

function entryFixture(
  stationId: string,
  status: OpenSenseMapQualificationStatus,
  baseline: OpenSenseMapQualificationEvidence,
  comparisons: QualificationComparison[],
): CitizenSensorAnomalyEntry {
  return { stationId, status, baseline, comparisons };
}

// Neuf comparaisons récentes sur trois jours distincts : 09 h, 10 h et 11 h
// sur chacun des trois derniers jours avant l'instant d'évaluation.
function recentComparisons(error: number): QualificationComparison[] {
  return ["2026-10-09", "2026-10-10", "2026-10-11"].flatMap((day) =>
    [9, 10, 11].map((hour) => comparisonFixture(day, hour, error)),
  );
}

describe("deriveCitizenSensorAnomalies", () => {
  it("ignore tout capteur non validé : le verdict persisté reste l'autorité de participation", () => {
    const set = deriveCitizenSensorAnomalies({
      entries: [
        entryFixture("osm-candidate", "candidate", baselineFixture(), recentComparisons(0.4)),
        entryFixture("osm-excluded", "excluded", baselineFixture(), recentComparisons(4)),
      ],
      baselineWindowDays: 30,
      recentWindowDays: CITIZEN_ANOMALY_RECENT_WINDOW_DAYS,
      evaluatedAt: AS_OF,
    });
    expect(set.anomalies).toEqual([]);
    expect(set.version).toBe(CITIZEN_ANOMALY_DETECTION_VERSION);
  });

  it("ne décrète aucune anomalie sans preuve récente suffisante, et n'acquitte pas non plus", () => {
    // Deux comparaisons récentes sur un seul jour : la preuve qui accuse
    // exigerait 7 comparaisons sur 3 jours distincts, comme celle qui valide.
    const comparisons = [
      comparisonFixture("2026-10-11", 9, 4.2),
      comparisonFixture("2026-10-11", 10, 4.4),
      comparisonFixture("2026-10-01", 9, 0.3),
      comparisonFixture("2026-10-01", 10, 0.3),
    ];
    const set = deriveCitizenSensorAnomalies({
      entries: [entryFixture("osm-sporadique", "validated", baselineFixture(), comparisons)],
      baselineWindowDays: 30,
      recentWindowDays: CITIZEN_ANOMALY_RECENT_WINDOW_DAYS,
      evaluatedAt: AS_OF,
    });
    expect(set.anomalies).toHaveLength(1);
    const anomaly = set.anomalies[0];
    expect(anomaly.status).toBe("unproven");
    expect(anomaly.recentComparisons).toBe(2);
    expect(anomaly.recentDistinctDays).toBe(1);
    expect(anomaly.recentMaeC).toBeCloseTo(4.3, 10);
    // La borne reste mesurée à titre de diagnostic, jamais appliquée sans preuve.
    expect(anomaly.anomalyThresholdC).toBeCloseTo(1.5, 10);
    expect(anomaly.reason).toContain("Preuve récente insuffisante");
  });

  it("signale une dérive aiguë au-delà de l'enveloppe mesurée du capteur", () => {
    const set = deriveCitizenSensorAnomalies({
      entries: [entryFixture("osm-derive", "validated", baselineFixture(), recentComparisons(2.1))],
      baselineWindowDays: 30,
      recentWindowDays: CITIZEN_ANOMALY_RECENT_WINDOW_DAYS,
      evaluatedAt: AS_OF,
    });
    expect(set.anomalies).toHaveLength(1);
    const anomaly = set.anomalies[0];
    expect(anomaly.status).toBe("anomaly");
    expect(anomaly.recentMaeC).toBeCloseTo(2.1, 10);
    expect(anomaly.recentComparisons).toBe(9);
    expect(anomaly.recentDistinctDays).toBe(3);
    // Borne = max(borne d'acceptation 1,3 ; 2 × max(0,5 ; 0,5) + 0,5 = 1,5).
    expect(anomaly.anomalyThresholdC).toBeCloseTo(1.5, 10);
    expect(anomaly.reason).toContain("Anomalie aiguë mesurée");
    expect(set.recentWindowDays).toBe(CITIZEN_ANOMALY_RECENT_WINDOW_DAYS);
    expect(set.evaluatedAt).toBe(AS_OF);
  });

  it("garde nominal un capteur dont l'erreur récente reste dans son enveloppe ; hors fenêtre, les écarts anciens ne comptent jamais", () => {
    const comparisons = [
      // Écarts anciens, hors de la fenêtre récente : ils ne peuvent ni
      // accuser ni acquitter le comportement récent.
      comparisonFixture("2026-10-01", 9, 9.9),
      comparisonFixture("2026-10-01", 10, 9.9),
      comparisonFixture("2026-10-01", 11, 9.9),
      // Fenêtre récente : biais systématique mesuré, dispersion dans la borne.
      ...recentComparisons(1.1),
    ];
    const set = deriveCitizenSensorAnomalies({
      entries: [entryFixture("osm-stable", "validated", baselineFixture(), comparisons)],
      baselineWindowDays: 30,
      recentWindowDays: CITIZEN_ANOMALY_RECENT_WINDOW_DAYS,
      evaluatedAt: AS_OF,
    });
    const anomaly = set.anomalies[0];
    expect(anomaly.status).toBe("nominal");
    expect(anomaly.recentMaeC).toBeCloseTo(1.1, 10);
    expect(anomaly.recentComparisons).toBe(9);
    // Le décalage de biais est archivé comme diagnostic, jamais appliqué au signal.
    expect(anomaly.biasShiftC).toBeCloseTo(1.05, 10);
    expect(anomaly.reason).toContain("Comportement nominal");
  });

  it("garde unproven un capteur dont l'enveloppe de référence n'est pas mesurable", () => {
    const set = deriveCitizenSensorAnomalies({
      entries: [
        entryFixture(
          "osm-sans-enveloppe",
          "validated",
          baselineFixture({ meanAbsoluteErrorC: null, acceptanceBoundC: null }),
          recentComparisons(4.4),
        ),
      ],
      baselineWindowDays: 30,
      recentWindowDays: CITIZEN_ANOMALY_RECENT_WINDOW_DAYS,
      evaluatedAt: AS_OF,
    });
    expect(set.anomalies[0].status).toBe("unproven");
    expect(set.anomalies[0].anomalyThresholdC).toBeNull();
  });
});
