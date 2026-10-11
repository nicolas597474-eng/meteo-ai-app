import { describe, expect, it } from "vitest";
import type { CitizenFusionImpactReport } from "./citizenFusionImpactService";
import type { StationData, StationSource } from "./stationService";
import {
  CITIZEN_FUSION_ACTIVATION_VERSION,
  composeLocalSynthesisSources,
  deriveCitizenFusionActivationDecision,
} from "./citizenFusionActivationService";

// Fixtures de test only : rapport mesuré et stations synthétiques, aucune observation réelle.

const AS_OF = Date.parse("2026-10-11T12:00:00Z");

function reportFixture(overrides: Partial<CitizenFusionImpactReport> = {}): CitizenFusionImpactReport {
  return {
    version: "citizen-fusion-impact-v1",
    referenceLat: 50.7567,
    referenceLon: 2.5204,
    windowDays: 30,
    status: "improves",
    reason: "Amélioration mesurée sur 9 comparaison(s) alignée(s) : MAE 0.676 °C pour la synthèse physique seule contre 0.373 °C en ajoutant le(s) capteur(s) validé(s), soit 0.303 °C d'écart moyen en moins face à la médiane officielle. La participation à la fusion reste une décision séparée : rien n'est activé ici.",
    comparisons: 9,
    distinctDays: 3,
    officialStationsUsed: ["mf-70260", "mf-70290"],
    physicalStationsUsed: ["mf-70260", "mf-70290", "netatmo-public-42"],
    validatedCitizenStations: ["opensensemap-6740"],
    baselineMaeC: 0.676,
    withCitizenMaeC: 0.373,
    improvementC: 0.303,
    firstComparedAt: "2026-10-05T09:00:00.000Z",
    lastComparedAt: "2026-10-07T11:00:00.000Z",
    ...overrides,
  };
}

function stationFixture(
  stationId: string,
  source: StationSource,
  overrides: Partial<StationData> = {},
): StationData {
  return {
    stationId,
    source,
    name: `${stationId} · station de test`,
    lat: 50.76,
    lon: 2.52,
    altitude: 20,
    distanceKm: 3,
    temperature: 15.4,
    humidity: null,
    pressure: null,
    windSpeed: null,
    windGust: null,
    windDirection: null,
    precipitation: null,
    updatedAt: "2026-10-11T11:00:00Z",
    reliabilityScore: 60,
    updateFrequencyMin: 60,
    dataAvailability: 0.95,
    isActive: false,
    exclusionReason: "Capteur citoyen en validation — non utilisé dans la température locale",
    ...overrides,
  };
}

describe("deriveCitizenFusionActivationDecision", () => {
  it("active les capteurs validés uniquement quand l'amélioration est mesurée", () => {
    const decision = deriveCitizenFusionActivationDecision(reportFixture(), AS_OF);

    expect(decision.version).toBe(CITIZEN_FUSION_ACTIVATION_VERSION);
    expect(decision.status).toBe("activated");
    expect(decision.impactStatus).toBe("improves");
    expect(decision.referenceLat).toBeCloseTo(50.7567, 4);
    expect(decision.referenceLon).toBeCloseTo(2.5204, 4);
    expect(decision.reason).toContain("participent à la synthèse de température locale");
    expect(decision.reason).toContain("0.303 °C");
    // Les métriques mesurées accompagnent la décision, jamais réinventées.
    expect(decision.baselineMaeC).toBeCloseTo(0.676, 3);
    expect(decision.withCitizenMaeC).toBeCloseTo(0.373, 3);
    expect(decision.improvementC).toBeCloseTo(0.303, 3);
    expect(decision.comparisons).toBe(9);
    expect(decision.distinctDays).toBe(3);
    expect(decision.windowDays).toBe(30);
    expect(decision.validatedCitizenStations).toEqual(["opensensemap-6740"]);
    expect(decision.firstComparedAt).toBe("2026-10-05T09:00:00.000Z");
    expect(decision.lastComparedAt).toBe("2026-10-07T11:00:00.000Z");
    expect(decision.evaluatedAt).toBe(AS_OF);
  });

  it("maintient les capteurs hors de la synthèse sans amélioration, avec la raison mesurée du rapport", () => {
    const reason = "Aucune amélioration mesurée sur 9 comparaison(s) alignée(s) : MAE 0.676 °C pour la synthèse physique seule contre 0.812 °C en ajoutant le(s) capteur(s) validé(s). Les capteurs validés restent hors de la fusion locale.";
    const decision = deriveCitizenFusionActivationDecision(
      reportFixture({
        status: "no-improvement",
        reason,
        withCitizenMaeC: 0.812,
        improvementC: -0.136,
      }),
      AS_OF,
    );

    expect(decision.status).toBe("not-activated");
    expect(decision.impactStatus).toBe("no-improvement");
    // La raison du rapport est reprise telle quelle, jamais réécrite.
    expect(decision.reason).toBe(reason);
    expect(decision.improvementC).toBeCloseTo(-0.136, 3);
  });

  it("maintient les capteurs hors de la synthèse quand l'historique est insuffisant ou aucun capteur validé n'est archivé", () => {
    const insufficient = deriveCitizenFusionActivationDecision(
      reportFixture({
        status: "insufficient-history",
        reason: "Historique insuffisant : 4/7 comparaison(s) alignée(s) avec deux stations officielles minimum et une station physique.",
        comparisons: 4,
        distinctDays: 1,
        baselineMaeC: null,
        withCitizenMaeC: null,
        improvementC: null,
        firstComparedAt: null,
        lastComparedAt: null,
      }),
      AS_OF,
    );
    expect(insufficient.status).toBe("not-activated");
    expect(insufficient.impactStatus).toBe("insufficient-history");
    expect(insufficient.baselineMaeC).toBeNull();
    expect(insufficient.withCitizenMaeC).toBeNull();
    expect(insufficient.improvementC).toBeNull();

    const none = deriveCitizenFusionActivationDecision(
      reportFixture({
        status: "no-validated-citizens",
        reason: "Aucun capteur citoyen validé n'est archivé pour cette référence : rien n'est évalué et aucune valeur n'est inventée.",
        comparisons: 0,
        distinctDays: 0,
        officialStationsUsed: [],
        physicalStationsUsed: [],
        validatedCitizenStations: [],
        baselineMaeC: null,
        withCitizenMaeC: null,
        improvementC: null,
        firstComparedAt: null,
        lastComparedAt: null,
      }),
      AS_OF,
    );
    expect(none.status).toBe("not-activated");
    expect(none.impactStatus).toBe("no-validated-citizens");
    expect(none.validatedCitizenStations).toEqual([]);
  });
});

describe("composeLocalSynthesisSources", () => {
  const PHYSICAL: StationData[] = [
    stationFixture("netatmo-public-42", "netatmo", { isActive: true, reliabilityScore: 65 }),
  ];
  const CITIZENS: StationData[] = [
    stationFixture("opensensemap-6740", "opensensemap", {
      reliabilityScore: 0,
      qualificationStatus: "candidate",
    }),
    stationFixture("cwop-EW1234", "cwop", {
      reliabilityScore: 60,
      qualificationStatus: "candidate",
    }),
    stationFixture("opensensemap-9999", "opensensemap", {
      reliabilityScore: 55,
      qualificationStatus: "candidate",
    }),
  ];
  const VERDICTS = new Map([
    ["opensensemap-6740", { stationId: "opensensemap-6740", qualificationStatus: "validated" }],
    ["cwop-EW1234", { stationId: "cwop-EW1234", qualificationStatus: "excluded" }],
    ["opensensemap-9999", { stationId: "opensensemap-9999", qualificationStatus: "candidate" }],
  ]);
  const ACTIVATED = { status: "activated" as const };

  it("ajoute uniquement les capteurs validés quand la décision activée est persistée", () => {
    const sources = composeLocalSynthesisSources({
      physicalStations: PHYSICAL,
      citizenStations: CITIZENS,
      activation: ACTIVATED,
      verdictByStationId: VERDICTS,
    });

    expect(sources.map((station) => station.stationId)).toEqual(["netatmo-public-42", "opensensemap-6740"]);
    const composed = sources[1];
    expect(composed.isActive).toBe(true);
    expect(composed.qualificationStatus).toBe("validated");
    expect(composed.exclusionReason).toBeUndefined();
    // La priorité technique n'est jamais inventée : le capteur garde sa
    // fiabilité persistée, même sous le seuil du moteur ultra-local.
    expect(composed.reliabilityScore).toBe(0);
  });

  it("retourne les stations physiques seules sans décision activée persistée", () => {
    for (const activation of [null, { status: "not-activated" as const }]) {
      const sources = composeLocalSynthesisSources({
        physicalStations: PHYSICAL,
        citizenStations: CITIZENS,
        activation,
        verdictByStationId: VERDICTS,
      });
      expect(sources).toHaveLength(1);
      expect(sources[0].stationId).toBe("netatmo-public-42");
      expect(sources[0].isActive).toBe(true);
    }
  });

  it("n'active jamais un capteur sans verdict « validated » persisté pour la référence", () => {
    const sources = composeLocalSynthesisSources({
      physicalStations: PHYSICAL,
      citizenStations: CITIZENS,
      activation: ACTIVATED,
      verdictByStationId: new Map(),
    });
    expect(sources.map((station) => station.stationId)).toEqual(["netatmo-public-42"]);
  });
});
