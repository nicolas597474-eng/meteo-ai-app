import { describe, expect, it } from "vitest";
import {
  deriveStationPerformanceProfiles,
  STATION_PERFORMANCE_CALCULATION_GATES,
  studentT95Critical,
  type StationPerformanceObservation,
  type StationPerformanceStation,
} from "./stationPerformanceService";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const START = Date.parse("2026-05-01T00:00:00Z");

describe("quantiles de l’intervalle nominal à 95 %", () => {
  it("utilise les quantiles t bilatéraux alpha 0,05 et la limite normale déclarée", () => {
    expect(studentT95Critical(1)).toBe(12.706);
    expect(studentT95Critical(2)).toBe(4.303);
    expect(studentT95Critical(30)).toBe(2.042);
    expect(studentT95Critical(31)).toBe(1.96);
  });
});

function makeStation(
  stationId: string,
  source: string,
  dailyOffsets: readonly number[],
  lat: number,
  lon: number,
): StationPerformanceStation {
  const readings: StationPerformanceObservation[] = dailyOffsets.flatMap((offset, day) =>
    [0, 6, 12, 18].map((hour) => {
      const observedAt = START + day * DAY_MS + hour * HOUR_MS;
      const fieldTime = new Date(observedAt).toISOString();
      return {
        observedAt,
        measurementTimes: { temperature: fieldTime, precipitation: fieldTime },
        temperature: 20 + day + offset,
        precipitation: 0,
      };
    }),
  );
  return {
    stationId,
    source,
    qualificationStatus: "validated",
    isActive: true,
    lat,
    lon,
    distanceKm: 1,
    readings,
  };
}

function crossNetworkFixture(dayCount = 8): StationPerformanceStation[] {
  const candidateErrors = Array.from({ length: dayCount }, (_, day) => 0.4 + (day % 4) * 0.2);
  const stablePeer = Array.from({ length: dayCount }, () => 0.05);
  const secondPeer = Array.from({ length: dayCount }, () => 0.65);
  const base = Array.from({ length: dayCount }, () => 0);
  const metar = Array.from({ length: dayCount }, () => 0.2);
  return [
    makeStation("netatmo-target", "netatmo", candidateErrors, 50.75, 2.50),
    makeStation("netatmo-peer-1", "netatmo", stablePeer, 50.76, 2.50),
    makeStation("netatmo-peer-2", "netatmo", secondPeer, 50.77, 2.50),
    makeStation("mf-ref", "meteofrance", base, 50.74, 2.50),
    makeStation("metar-ref", "metar", metar, 50.73, 2.50),
  ];
}

describe("deriveStationPerformanceProfiles", () => {
  it("requires two distinct physical reference networks and never publishes a score when references are missing", () => {
    const stations = crossNetworkFixture().filter((station) => station.source !== "metar");
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 }).get("netatmo-target")!;
    const temperature = result.variables.temperature;

    expect(temperature.status).toBe("non_mesuree");
    expect(temperature.estimate).toBeNull();
    expect(temperature.reason).toBe("distinct_reference_networks_insufficient");
  });

  it("exclut tout le réseau cible des références et ignore les références de modèles", () => {
    const fixture = crossNetworkFixture();
    const withModelReference = [...fixture, makeStation("model-grid", "openmeteo", Array(8).fill(100), 50.72, 2.5)];
    const withoutModel = deriveStationPerformanceProfiles({ stations: fixture, maxDistanceKm: 20 }).get("netatmo-target")!.variables.temperature;
    const withModel = deriveStationPerformanceProfiles({ stations: withModelReference, maxDistanceKm: 20 }).get("netatmo-target")!.variables.temperature;

    expect(withoutModel.status).toBe("mesuree");
    expect(withModel.estimate?.meanAbsoluteError).toBe(withoutModel.estimate?.meanAbsoluteError);
    expect(withModel.referenceNetworks).toEqual(["metar", "meteofrance"]);
    expect(withModel.minimumDistinctReferenceNetworksPerComparison).toBe(2);
    expect(withModel.estimate?.meanAbsoluteError).toBeGreaterThan(0);
    expect(withModel.estimate?.uncertainty95.lower).toBeLessThanOrEqual(withModel.estimate?.shrunkMeanAbsoluteError ?? 0);
    expect(withModel.estimate?.uncertainty95.upper).toBeGreaterThanOrEqual(withModel.estimate?.shrunkMeanAbsoluteError ?? 0);
  });

  it("admet une référence mesurée au même instant que la candidate", () => {
    const result = deriveStationPerformanceProfiles({ stations: crossNetworkFixture(), maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.temperature;

    expect(result.comparisons).toBe(32);
    expect(result.referenceNetworks).toEqual(["metar", "meteofrance"]);
  });

  it("exclut une référence mesurée après la candidate dans le même bucket UTC", () => {
    const stations = crossNetworkFixture().map((station) => ({
      ...station,
      readings: station.readings.map((reading) => {
        const fieldTime = Date.parse(reading.measurementTimes?.temperature ?? "");
        return station.stationId === "mf-ref" || station.stationId === "metar-ref"
          ? { ...reading, measurementTimes: { ...reading.measurementTimes, temperature: new Date(fieldTime + 30_000).toISOString() } }
          : reading;
      }),
    }));
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.temperature;

    expect(result.comparisons).toBe(0);
    expect(result.status).toBe("non_mesuree");
    expect(result.estimate).toBeNull();
  });

  it("utilise des horloges indépendantes pour chaque variable", () => {
    const stations = crossNetworkFixture().map((station) => ({
      ...station,
      readings: station.readings.map((reading) => {
        const base = Date.parse(reading.measurementTimes?.temperature ?? "");
        const isCandidate = station.stationId === "netatmo-target";
        const humidityValues: Record<string, number> = {
          "netatmo-target": 50,
          "netatmo-peer-1": 48,
          "netatmo-peer-2": 53,
          "mf-ref": 49,
          "metar-ref": 54,
        };
        return {
          ...reading,
          humidity: humidityValues[station.stationId],
          measurementTimes: {
            ...reading.measurementTimes,
            temperature: new Date(base + (isCandidate ? 10 : 20) * 60_000).toISOString(),
            humidity: new Date(base + (isCandidate ? 30 : 25) * 60_000).toISOString(),
          },
        };
      }),
    }));
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 }).get("netatmo-target")!;

    expect(result.variables.temperature.comparisons).toBe(0);
    expect(result.variables.humidity.comparisons).toBe(32);
    expect(result.variables.humidity.status).toBe("mesuree");
  });

  it("exclut les champs legacy sans timestamp sans empêcher la mesure d’un autre champ", () => {
    const stations = crossNetworkFixture().map((station) => ({
      ...station,
      readings: station.readings.map((reading) => ({
        ...reading,
        humidity: station.stationId === "netatmo-target" ? 50
          : station.stationId === "netatmo-peer-1" ? 48
            : station.stationId === "netatmo-peer-2" ? 53
              : station.stationId === "mf-ref" ? 49 : 54,
        measurementTimes: {
          ...reading.measurementTimes,
          temperature: station.stationId === "netatmo-target" ? null : reading.measurementTimes?.temperature ?? null,
          humidity: reading.measurementTimes?.temperature ?? null,
        },
      })),
    }));
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 }).get("netatmo-target")!;

    expect(result.variables.temperature.reason).toBe("no_station_observations");
    expect(result.variables.temperature.comparisons).toBe(0);
    expect(result.variables.humidity.comparisons).toBe(32);
    expect(result.variables.humidity.status).toBe("mesuree");
  });

  it("ignore les timestamps mal formés et coupe les mesures postérieures à asOf", () => {
    const stations = crossNetworkFixture(1).map((station) => ({
      ...station,
      readings: station.readings.map((reading) => ({
        ...reading,
        measurementTimes: { ...reading.measurementTimes, temperature: "2026-02-30T12:00:00Z" },
      })),
    }));
    const malformed = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20, asOf: START + DAY_MS })
      .get("netatmo-target")!.variables.temperature;
    const cutoff = deriveStationPerformanceProfiles({ stations: crossNetworkFixture(1), maxDistanceKm: 20, asOf: START + HOUR_MS })
      .get("netatmo-target")!.variables.temperature;

    expect(malformed.reason).toBe("no_station_observations");
    expect(malformed.comparisons).toBe(0);
    expect(cutoff.comparisons).toBe(1);
    expect(cutoff.status).toBe("non_mesuree");
  });

  it("n’utilise pas une autre source au même site que la station cible comme référence indépendante", () => {
    const stations = crossNetworkFixture().map((station) => station.stationId === "mf-ref"
      ? { ...station, lat: 50.75, lon: 2.50 }
      : station);
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.temperature;

    expect(result.status).toBe("non_mesuree");
    expect(result.reason).toBe("distinct_reference_networks_insufficient");
    expect(result.referenceNetworks).toEqual(["metar"]);
    expect(result.estimate).toBeNull();
  });

  it("ne compte pas des flux de deux réseaux co-localisés comme deux références physiques", () => {
    const stations = crossNetworkFixture().map((station) => station.stationId === "metar-ref"
      ? { ...station, lat: 50.74, lon: 2.50 }
      : station);
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.temperature;

    expect(result.status).toBe("non_mesuree");
    expect(result.reason).toBe("distinct_reference_networks_insufficient");
    expect(result.estimate).toBeNull();
  });

  it("sépare les comptes bruts des gates de calcul et laisse l’estimation nulle sous ces gates", () => {
    expect(STATION_PERFORMANCE_CALCULATION_GATES).toMatchObject({
      minimumComparisons: 30,
      minimumDistinctDays: 7,
      minimumDistinctReferenceNetworksPerComparison: 2,
      minimumSourcePriorSites: 2,
    });
    expect(STATION_PERFORMANCE_CALCULATION_GATES).not.toHaveProperty("minimumPrecipitationEventDays");
    const stations = crossNetworkFixture(7);
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 }).get("netatmo-target")!.variables.temperature;

    expect(result.comparisons).toBe(28);
    expect(result.distinctDays).toBe(7);
    expect(result.status).toBe("non_mesuree");
    expect(result.reason).toBe("comparisons_insufficient");
    expect(result.estimate).toBeNull();
  });

  it("ne mesure pas une station non validée ou hors du rayon et n’utilise pas son profil opérationnel comme preuve météo", () => {
    const stations = crossNetworkFixture().map((station) => station.stationId === "netatmo-target"
      ? { ...station, qualificationStatus: "candidate", distanceKm: 25 }
      : station);
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 }).get("netatmo-target")!;

    expect(result.status).toBe("non_mesuree");
    expect(result.variables.temperature.reason).toBe("outside_reference_radius");
    expect(result.variables.temperature.estimate).toBeNull();
  });

  it("rétrécit l’estimation vers le prior empirique de source, et donne davantage de poids aux jours de la station quand ils augmentent", () => {
    const short = deriveStationPerformanceProfiles({ stations: crossNetworkFixture(8), maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.temperature.estimate!;
    const long = deriveStationPerformanceProfiles({ stations: crossNetworkFixture(16), maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.temperature.estimate!;

    expect(short.sourcePriorMeanAbsoluteError).toBeGreaterThan(0);
    expect(short.sourcePriorMeanAbsoluteError).not.toBe(short.meanAbsoluteError);
    expect(short.stationEvidenceWeight).toBeGreaterThan(0);
    expect(short.stationEvidenceWeight).toBeLessThan(1);
    expect(long.stationEvidenceWeight).toBeGreaterThan(short.stationEvidenceWeight);
    expect(long.shrunkMeanAbsoluteError).toBeGreaterThanOrEqual(0);
    expect(long.uncertainty95.method).toBe("hierarchical_day_block_approximation");
  });

  it("distingue la MAE poolée de la moyenne quotidienne employée par le shrinkage si la couverture varie", () => {
    const stations = crossNetworkFixture().map((station) => {
      const firstReading = station.readings[0];
      const extraDayZeroReadings = [1, 2, 3, 4, 5, 7, 8, 9].map((hour) => ({
        ...firstReading,
        observedAt: START + hour * HOUR_MS,
        measurementTimes: { ...firstReading.measurementTimes, temperature: new Date(START + hour * HOUR_MS).toISOString() },
      }));
      return { ...station, readings: [...station.readings, ...extraDayZeroReadings] };
    });
    const estimate = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.temperature.estimate!;

    expect(estimate.meanAbsoluteError).not.toBe(estimate.meanDailyAbsoluteError);
  });

  it("refuse d’inventer un prior individuel quand aucune station du même réseau ne le calibre", () => {
    const stations = crossNetworkFixture().filter((station) => station.stationId === "netatmo-target" || station.source !== "netatmo");
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 }).get("netatmo-target")!.variables.temperature;

    expect(result.comparisons).toBeGreaterThanOrEqual(STATION_PERFORMANCE_CALCULATION_GATES.minimumComparisons);
    expect(result.distinctDays).toBeGreaterThanOrEqual(STATION_PERFORMANCE_CALCULATION_GATES.minimumDistinctDays);
    expect(result.reason).toBe("source_prior_insufficient");
    expect(result.status).toBe("non_mesuree");
    expect(result.estimate).toBeNull();
  });

  it("ne traite pas une fenêtre entièrement sèche comme une performance de précipitation mesurée", () => {
    const stations = crossNetworkFixture();
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 }).get("netatmo-target")!.variables.precipitation;

    expect(result.comparisons).toBeGreaterThanOrEqual(STATION_PERFORMANCE_CALCULATION_GATES.minimumComparisons);
    expect(result.distinctDays).toBeGreaterThanOrEqual(STATION_PERFORMANCE_CALCULATION_GATES.minimumDistinctDays);
    expect(result.distinctEventDays).toBe(0);
    expect(result.reason).toBe("precipitation_method_not_defined");
    expect(result.status).toBe("non_mesuree");
    expect(result.estimate).toBeNull();
  });

  it("conserve le compte des jours pluvieux mais laisse toujours occurrence et quantité non mesurées", () => {
    const withRainEvents = (eventDays: number) => crossNetworkFixture().map((station) => ({
      ...station,
      readings: station.readings.map((reading, index) => ({
        ...reading,
        precipitation: Math.floor(index / 4) < eventDays
          ? station.stationId === "netatmo-target" ? 0.8 : station.stationId === "netatmo-peer-2" ? 1.5 : 1
          : 0,
      })),
    }));
    const twoEventDays = deriveStationPerformanceProfiles({ stations: withRainEvents(2), maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.precipitation;
    const threeEventDays = deriveStationPerformanceProfiles({ stations: withRainEvents(3), maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.precipitation;
    const eightEventDays = deriveStationPerformanceProfiles({ stations: withRainEvents(8), maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.precipitation;

    expect(twoEventDays.distinctEventDays).toBe(2);
    expect(twoEventDays.reason).toBe("precipitation_method_not_defined");
    expect(twoEventDays.estimate).toBeNull();
    expect(threeEventDays.distinctEventDays).toBe(3);
    expect(threeEventDays.reason).toBe("precipitation_method_not_defined");
    expect(threeEventDays.status).toBe("non_mesuree");
    expect(threeEventDays.estimate).toBeNull();
    expect(eightEventDays.distinctEventDays).toBe(8);
    expect(eightEventDays.reason).toBe("precipitation_method_not_defined");
    expect(eightEventDays.estimate).toBeNull();
  });

  it("utilise l’écart angulaire circulaire pour la direction du vent", () => {
    const directions: Record<string, number> = {
      "netatmo-target": 1,
      "netatmo-peer-1": 0,
      "netatmo-peer-2": 5,
      "mf-ref": 359,
      "metar-ref": 1,
    };
    const stations = crossNetworkFixture().map((station) => ({
      ...station,
      readings: station.readings.map((reading) => ({
        ...reading,
        windDirection: directions[station.stationId],
        measurementTimes: { ...reading.measurementTimes, windDirection: reading.measurementTimes?.temperature ?? null },
      })),
    }));
    const result = deriveStationPerformanceProfiles({ stations, maxDistanceKm: 20 })
      .get("netatmo-target")!.variables.windDirection;

    expect(result.status).toBe("mesuree");
    expect(result.estimate?.meanAbsoluteError).toBe(2);
    expect(result.estimate?.meanAbsoluteError).toBeLessThan(10);
  });
});
