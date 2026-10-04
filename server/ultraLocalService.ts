import { getPreviousReadings, recordStationReadings } from "./stationReadingsCache";

/**
 * Ultra-Local Service — Advanced temperature calculation using concentric radius bands
 *
 * Three modes:
 *   - Standard: default weighting (50% distance, 30% quality, 20% freshness)
 *   - Local: enhanced proximity weighting with tighter freshness requirements
 *   - Ultra-local: extreme proximity bias with concentric radius bands
 *
 * Ultra-local radius bands:
 *   < 2 km  → 60% weight
 *   2-5 km  → 28% weight
 *   5-10 km → 10% weight
 *   Models (numerical) → 2% weight
 *
 * Quality verification before using a station:
 *   1. Freshness: last measurement must be recent (< 30 min for ultra-local)
 *   2. Coherence: temperature must not deviate > 5°C from neighbors
 *   3. Altitude: adjust for elevation differences
 *   4. Priorité technique source : le score fixe du réseau doit atteindre le seuil
 *   5. Stability: no erratic jumps in recent readings
 *
 * Microclimate detection:
 *   - Urban heat island (city centers)
 *   - Valley cold pools
 *   - Forest cooling
 *   - Water body effects (sea, rivers)
 *   - Altitude corrections (-0.65°C per 100m)
 */

import { StationData, StationContribution, StationExclusion, haversineKm } from "./stationService";
import { buildNormalizedSpatialWeights, evaluateSpatialQuality } from "./spatialFusionCore";

export type LocalMode = "standard" | "local" | "ultra-local";

type UltraLocalParameter = "temperature" | "humidity" | "pressure" | "windSpeed" | "windGust" | "precipitation";

export type RadiusBand = {
  minKm: number;
  maxKm: number;
  weight: number;
  label: string;
};

export type UltraLocalResult = {
  mode: LocalMode;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  windSpeed: number | null;
  windGust: number | null;
  precipitation: number | null;
  stationsUsed: UltraLocalContribution[];
  stationsIgnored: UltraLocalExclusion[];
  modelContribution: number | null; // numerical model temperature
  modelWeight: number;
  bandBreakdown: BandBreakdown[];
  microclimateAdjustment: number; // °C adjustment applied
  microclimateFactors: MicroclimateFactor[];
  stationCount: number;
  confidenceScore: number | null;
  confidenceByParameter: Record<UltraLocalParameter, number | null>;
  explanation: string;
};

export type UltraLocalContribution = StationContribution & {
  band: string; // "0-2km", "2-5km", etc.
  bandWeight: number; // weight from the band allocation
  qualityChecks: QualityCheck[];
  altitudeAdjustment: number; // °C correction for altitude
  adjustedTemperature: number | null; // temperature after altitude correction
};

export type UltraLocalExclusion = StationExclusion & {
  temperature?: number | null;
  checks: QualityCheck[];
};

export type QualityCheck = {
  name: string;
  passed: boolean;
  value: string;
  threshold: string;
};

export type BandBreakdown = {
  band: string;
  minKm: number;
  maxKm: number;
  allocatedWeight: number; // configured weight for this band
  effectiveWeight: number; // actual weight used (may differ if no stations in band)
  stationCount: number;
  avgTemperature: number | null;
};

export type MicroclimateFactor = {
  type: string;
  label: string;
  adjustment: number; // °C
  confidence: number; // 0-1
  description: string;
};

// ─── Configuration per mode ──────────────────────────────────────────────────

const MODE_CONFIG: Record<LocalMode, {
  radiusBands: RadiusBand[];
  modelWeight: number;
  maxFreshnessMin: number;
  maxTempDeviation: number;
  minReliability: number;
  altitudeCorrection: boolean;
  microclimateEnabled: boolean;
}> = {
  standard: {
    radiusBands: [
      { minKm: 0, maxKm: 20, weight: 1.0, label: "0-20 km" },
    ],
    modelWeight: 0.30,
    maxFreshnessMin: 120,
    maxTempDeviation: 8,
    minReliability: 30,
    altitudeCorrection: false,
    microclimateEnabled: false,
  },
  local: {
    radiusBands: [
      { minKm: 0, maxKm: 5, weight: 0.45, label: "0-5 km" },
      { minKm: 5, maxKm: 10, weight: 0.25, label: "5-10 km" },
      { minKm: 10, maxKm: 20, weight: 0.18, label: "10-20 km" },
      { minKm: 20, maxKm: 30, weight: 0.05, label: "20-30 km" },
    ],
    modelWeight: 0.07,
    maxFreshnessMin: 60,
    maxTempDeviation: 6,
    minReliability: 40,
    altitudeCorrection: true,
    microclimateEnabled: false,
  },
  "ultra-local": {
    radiusBands: [
      { minKm: 0, maxKm: 2, weight: 0.60, label: "< 2 km" },
      { minKm: 2, maxKm: 5, weight: 0.28, label: "2-5 km" },
      { minKm: 5, maxKm: 10, weight: 0.10, label: "5-10 km" },
    ],
    modelWeight: 0.02,
    maxFreshnessMin: 30,
    maxTempDeviation: 5,
    minReliability: 45,
    altitudeCorrection: true,
    // Les heuristiques géographiques (urbain, forêt, littoral, vallée) ne sont
    // pas des observations. Elles restent désactivées tant qu’elles ne sont pas
    // calibrées séparément par un historique physique qualifié au lieu concerné.
    microclimateEnabled: false,
  },
};

// ─── Quality Verification ────────────────────────────────────────────────────

function verifyStationQuality(
  station: StationData,
  allStations: StationData[],
  config: typeof MODE_CONFIG["ultra-local"],
  refAltitude: number | null
): { passed: boolean; checks: QualityCheck[]; altAdj: number } {
  const maxDistanceKm = Math.max(...config.radiusBands.map((band) => band.maxKm));
  const evaluations = evaluateSpatialQuality(
    allStations.filter((candidate) => candidate.isActive).map((candidate) => ({ ...candidate, id: candidate.stationId })),
    {
      maxDistanceKm,
      maxFreshnessMin: config.maxFreshnessMin,
      minReliabilityScore: config.minReliability,
      maxTempDeviationC: config.maxTempDeviation,
      refAltitude: config.altitudeCorrection ? refAltitude : null,
    },
  );
  const evaluation = evaluations.find((candidate) => candidate.source.stationId === station.stationId);
  if (!evaluation) {
    return { passed: false, checks: [{ name: "Disponibilité", passed: false, value: "Station absente", threshold: "Station active" }], altAdj: 0 };
  }
  const labels = { distance: "Distance", freshness: "Fraîcheur", reliability: "Qualité historique", data: "Disponibilité", coherence: "Cohérence", altitude: "Altitude" } as const;
  return {
    passed: evaluation.passed,
    checks: evaluation.checks.map((check) => ({ name: labels[check.code], passed: check.passed, value: check.value, threshold: check.threshold })),
    altAdj: evaluation.altitudeAdjustmentC,
  };
}

// ─── Microclimate Detection ──────────────────────────────────────────────────

function detectMicroclimate(
  lat: number,
  lon: number,
  altitude: number | null,
  stations: StationData[]
): MicroclimateFactor[] {
  const factors: MicroclimateFactor[] = [];

  // Estimate reference altitude from nearby stations
  const stationAlts = stations
    .filter(s => s.altitude != null && s.isActive)
    .map(s => s.altitude!);
  const avgAlt = stationAlts.length > 0
    ? stationAlts.reduce((a, b) => a + b, 0) / stationAlts.length
    : altitude ?? 50;

  // Urban heat island detection (based on population density proxy)
  // Cities tend to have more stations in close proximity
  const veryClose = stations.filter(s => s.distanceKm < 3).length;
  if (veryClose >= 3) {
    factors.push({
      type: "urban",
      label: "Îlot de chaleur urbain",
      adjustment: 0.5,
      confidence: 0.6,
      description: "Zone urbaine détectée (densité élevée de stations). Température légèrement supérieure aux zones rurales environnantes.",
    });
  }

  // Valley cold pool (if location is significantly lower than surroundings)
  if (altitude != null && avgAlt > altitude + 50) {
    factors.push({
      type: "valley",
      label: "Fond de vallée",
      adjustment: -0.8,
      confidence: 0.5,
      description: "Position en fond de vallée. Accumulation d'air froid possible, surtout la nuit.",
    });
  }

  // Coastal effect (proximity to sea — rough heuristic based on lat/lon for northern France)
  // If near the coast (lat > 50.5 and lon < 2.0 for Côte d'Opale area)
  if (lat > 50.8 && lon < 2.5) {
    factors.push({
      type: "coastal",
      label: "Influence maritime",
      adjustment: -0.3,
      confidence: 0.4,
      description: "Proximité de la mer. Effet modérateur sur les températures (plus frais en été, plus doux en hiver).",
    });
  }

  // Altitude effect (if significantly above average)
  if (altitude != null && altitude > avgAlt + 100) {
    const altAdj = -((altitude - avgAlt) / 100) * 0.65;
    factors.push({
      type: "altitude",
      label: "Effet d'altitude",
      adjustment: altAdj,
      confidence: 0.8,
      description: `Position en altitude (${altitude}m). Correction de ${altAdj.toFixed(1)}°C appliquée.`,
    });
  }

  // Forest cooling (heuristic: if few stations nearby, likely rural/forested)
  if (veryClose === 0 && stations.filter(s => s.distanceKm < 5).length <= 1) {
    factors.push({
      type: "forest",
      label: "Zone rurale/boisée",
      adjustment: -0.3,
      confidence: 0.3,
      description: "Zone peu instrumentée, possiblement rurale ou boisée. Légère fraîcheur par rapport aux zones urbanisées.",
    });
  }

  return factors;
}

// ─── Main Ultra-Local Calculation ────────────────────────────────────────────

export function calculateUltraLocal(
  stations: StationData[],
  mode: LocalMode,
  refLat: number,
  refLon: number,
  refAltitude: number | null = null,
  modelTemperature: number | null = null,
  options: { recordStationReadings?: boolean; inferReferenceAltitude?: boolean } = {},
): UltraLocalResult {
  const config = MODE_CONFIG[mode];

  // Determine reference altitude from stations if not provided
  const effectiveAltitude = refAltitude ?? (options.inferReferenceAltitude === false
    ? null
    : stations.find(s => s.altitude != null && s.distanceKm < 5)?.altitude ?? null);

  // Get previous readings for frozen-value / sudden-jump detection
  const prevReadings = getPreviousReadings();

  // Quality verification for all stations (enhanced with frozen/jump detection)
  const verified: { station: StationData; passed: boolean; checks: QualityCheck[]; altAdj: number }[] =
    stations.map(s => {
      const result = verifyStationQuality(s, stations, config, effectiveAltitude);
      // Additional check: frozen value detection from cache
      if (s.temperature != null && prevReadings.size > 0) {
        const prev = prevReadings.get(s.stationId);
        if (prev) {
          const ageMin = (Date.now() - prev.timestamp) / 60000;
          const tempDelta = Math.abs(s.temperature - prev.temperature);
          // Frozen: no change for > 60 min
          if (ageMin > 60 && tempDelta < 0.01) {
            result.checks.push({
              name: "frozen_value",
              passed: false,
              value: `${s.temperature.toFixed(1)}°C inchangé depuis ${Math.round(ageMin)} min`,
              threshold: "ΔT > 0.01°C en 60 min",
            });
            result.passed = false;
          }
          // Sudden jump: > 5°C in < 10 min
          if (ageMin < 10 && tempDelta > 5) {
            result.checks.push({
              name: "sudden_jump",
              passed: false,
              value: `Δ${tempDelta.toFixed(1)}°C en ${Math.round(ageMin)} min`,
              threshold: "ΔT < 5°C en 10 min",
            });
            result.passed = false;
          }
        }
      }
      return { station: s, passed: result.passed, checks: result.checks, altAdj: result.altAdj };
    });

  const activeStations = verified.filter(v => v.passed);
  const excludedStations = verified.filter(v => !v.passed);

  // Build exclusion list
  const stationsIgnored: UltraLocalExclusion[] = excludedStations.map(v => ({
    stationId: v.station.stationId,
    name: v.station.name,
    source: v.station.source,
    distanceKm: v.station.distanceKm,
    reason: v.checks.filter(c => !c.passed).map(c => `${c.name}: ${c.value} (seuil: ${c.threshold})`).join("; "),
    temperature: v.station.temperature,
    checks: v.checks,
  }));

  // Assign stations to radius bands
  const bandBreakdown: BandBreakdown[] = config.radiusBands.map(band => {
    const bandStations = activeStations.filter(
      v => v.station.distanceKm >= band.minKm && v.station.distanceKm < band.maxKm
    );
    const temps = bandStations
      .map(v => (v.station.temperature != null ? v.station.temperature + v.altAdj : null))
      .filter((t): t is number => t != null);
    return {
      band: band.label,
      minKm: band.minKm,
      maxKm: band.maxKm,
      allocatedWeight: band.weight,
      effectiveWeight: band.weight, // will be recalculated
      stationCount: bandStations.length,
      avgTemperature: temps.length > 0 ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null,
    };
  });

  // Redistribute weights from empty bands
  const bandsWithData = bandBreakdown.filter(b => b.stationCount > 0);
  const emptyBandWeight = bandBreakdown
    .filter(b => b.stationCount === 0)
    .reduce((sum, b) => sum + b.allocatedWeight, 0);

  if (bandsWithData.length > 0 && emptyBandWeight > 0) {
    const totalActiveWeight = bandsWithData.reduce((sum, b) => sum + b.allocatedWeight, 0);
    bandsWithData.forEach(b => {
      b.effectiveWeight = b.allocatedWeight + (emptyBandWeight * (b.allocatedWeight / totalActiveWeight));
    });
  }
  bandBreakdown.filter(b => b.stationCount === 0).forEach(b => { b.effectiveWeight = 0; });

  // Calculate weighted temperature
  let weightedTemp = 0;
  let totalWeight = 0;
  const contributions: UltraLocalContribution[] = [];

  for (const band of config.radiusBands) {
    const bandInfo = bandBreakdown.find(b => b.band === band.label)!;
    if (bandInfo.stationCount === 0) continue;

    const bandStations = activeStations.filter(
      v => v.station.distanceKm >= band.minKm && v.station.distanceKm < band.maxKm
    );

    // Le QC commun est déjà appliqué. Le même noyau spatial normalisé sert
    // désormais au Ground Truth et à l’Ultra-local ; les bandes restent les
    // contraintes propres au mode Ultra-local, appliquées après l’IDW intra-bande.
    const inBandWeights = buildNormalizedSpatialWeights(
      bandStations.map(({ station }) => ({ ...station, id: station.stationId })),
      { refAltitude: config.altitudeCorrection ? effectiveAltitude : null },
    );

      bandStations.forEach((v, i) => {
        const coreWeight = inBandWeights[i];
        const stationWeight = coreWeight.finalWeight * bandInfo.effectiveWeight;
        const adjustedTemp = coreWeight.adjustedTemperature;

      if (adjustedTemp != null) {
        weightedTemp += adjustedTemp * stationWeight;
        totalWeight += stationWeight;
      }

      contributions.push({
        stationId: v.station.stationId,
        name: v.station.name,
        source: v.station.source,
        observedAt: v.station.updatedAt,
        measurementTimes: v.station.measurementTimes ?? null,
        distanceKm: v.station.distanceKm,
        weight: Math.round(stationWeight * 1000) / 1000,
        distanceWeight: Math.round(coreWeight.distanceWeight * 1000) / 1000,
        qualityWeight: Math.round(coreWeight.qualityWeight * 1000) / 1000,
        freshnessWeight: Math.round(coreWeight.freshnessWeight * 1000) / 1000,
        temperature: v.station.temperature,
        humidity: v.station.humidity,
        pressure: v.station.pressure,
        windSpeed: v.station.windSpeed,
        windGust: v.station.windGust,
        precipitation: v.station.precipitation,
        band: band.label,
        bandWeight: bandInfo.effectiveWeight,
        qualityChecks: v.checks,
        altitudeAdjustment: Math.round(v.altAdj * 100) / 100,
        adjustedTemperature: adjustedTemp != null ? Math.round(adjustedTemp * 10) / 10 : null,
      });
    });
  }

  // Add model contribution
  const effectiveModelWeight = config.modelWeight;
  if (modelTemperature != null && totalWeight > 0) {
    weightedTemp += modelTemperature * effectiveModelWeight;
    totalWeight += effectiveModelWeight;
  }

  // Microclimate adjustments
  const microFactors = config.microclimateEnabled
    ? detectMicroclimate(refLat, refLon, effectiveAltitude, stations)
    : [];
  const microAdjustment = microFactors.reduce((sum, f) => sum + f.adjustment * f.confidence, 0);

  // Final temperature
  let finalTemp: number | null = null;
  if (totalWeight > 0) {
    finalTemp = Math.round(((weightedTemp / totalWeight) + microAdjustment) * 10) / 10;
  }

  // The contribution order follows distance bands, while activeStations retains input
  // order. Resolve the weight by station id so each variable uses its own station's
  // contribution rather than the contribution at the same array index.
  const contributionWeightByStation = new Map(
    contributions.map(contribution => [contribution.stationId, contribution.weight])
  );
  type NonTemperatureParameter = Exclude<UltraLocalParameter, "temperature">;
  type WeightedValue = { value: number; weight: number };

  function weightedValues(field: NonTemperatureParameter): WeightedValue[] {
    return activeStations.flatMap(({ station }) => {
      const value = station[field] as number | null;
      const weight = contributionWeightByStation.get(station.stationId) ?? 0;
      return value != null && weight > 0 ? [{ value, weight }] : [];
    });
  }

  function weightedAverage(values: WeightedValue[]): number | null {
    const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return null;
    return Math.round((values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight) * 10) / 10;
  }

  function confidenceForValues(values: WeightedValue[], spreadAtLowConfidence: number): number | null {
    // Une seule station renseigne un contexte, mais ne permet pas de mesurer
    // l'accord inter-stations. La confiance reste donc explicitement
    // indisponible au lieu d'afficher une valeur artificiellement favorable.
    if (values.length < 2) return null;
    const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return null;
    const mean = values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
    const weightedVariance = values.reduce(
      (sum, entry) => sum + entry.weight * (entry.value - mean) ** 2,
      0
    ) / totalWeight;
    const weightedStdDev = Math.sqrt(weightedVariance);
    const agreementPenalty = Math.min(60, (weightedStdDev / spreadAtLowConfidence) * 60);
    const availabilityPenalty = Math.max(0, 4 - values.length) * 8;
    return Math.max(0, Math.min(100, Math.round(100 - agreementPenalty - availabilityPenalty)));
  }

  const temperatureValues: WeightedValue[] = contributions.flatMap((contribution) => {
    const value = contribution.adjustedTemperature ?? contribution.temperature;
    return value != null && contribution.weight > 0 ? [{ value, weight: contribution.weight }] : [];
  });
  const confidenceByParameter: Record<UltraLocalParameter, number | null> = {
    temperature: confidenceForValues(temperatureValues, 4),
    humidity: confidenceForValues(weightedValues("humidity"), 20),
    pressure: confidenceForValues(weightedValues("pressure"), 8),
    windSpeed: confidenceForValues(weightedValues("windSpeed"), 12),
    windGust: confidenceForValues(weightedValues("windGust"), 15),
    precipitation: confidenceForValues(weightedValues("precipitation"), 5),
  };
  const confidenceScore = confidenceByParameter.temperature;

  // Generate explanation
  const explanation = generateExplanation(mode, contributions, bandBreakdown, microFactors, finalTemp, modelTemperature);

  // Record current readings for next cycle's frozen/jump detection
  const readingsToRecord = stations
    .filter(s => s.temperature != null)
    .map(s => ({ stationId: s.stationId, temperature: s.temperature! }));
  if (options.recordStationReadings !== false) recordStationReadings(readingsToRecord);

  return {
    mode,
    temperature: finalTemp,
    humidity: weightedAverage(weightedValues("humidity")),
    pressure: weightedAverage(weightedValues("pressure")),
    windSpeed: weightedAverage(weightedValues("windSpeed")),
    windGust: weightedAverage(weightedValues("windGust")),
    precipitation: weightedAverage(weightedValues("precipitation")),
    stationsUsed: contributions,
    stationsIgnored,
    modelContribution: modelTemperature,
    modelWeight: effectiveModelWeight,
    bandBreakdown,
    microclimateAdjustment: Math.round(microAdjustment * 10) / 10,
    microclimateFactors: microFactors,
    stationCount: contributions.filter(
      (contribution) => contribution.adjustedTemperature != null || contribution.temperature != null
    ).length,
    confidenceScore,
    confidenceByParameter,
    explanation,
  };
}

// ─── Explanation Generator ───────────────────────────────────────────────────

function generateExplanation(
  mode: LocalMode,
  contributions: UltraLocalContribution[],
  bands: BandBreakdown[],
  microFactors: MicroclimateFactor[],
  finalTemp: number | null,
  modelTemp: number | null
): string {
  if (contributions.length === 0) {
    return "Aucune station valide trouvée dans le rayon de recherche. La température affichée provient des modèles numériques.";
  }

  const modeLabels: Record<LocalMode, string> = {
    standard: "standard",
    local: "local",
    "ultra-local": "Ultra-local",
  };

  const closestStation = contributions.sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const activeBands = bands.filter(b => b.stationCount > 0);

  let text = `Le mode ${modeLabels[mode]} a utilisé ${contributions.length} station${contributions.length > 1 ? "s" : ""} `;

  if (mode === "ultra-local") {
    text += `répartie${contributions.length > 1 ? "s" : ""} sur ${activeBands.length} bande${activeBands.length > 1 ? "s" : ""} de distance`;
    if (closestStation) {
      text += `. La station la plus proche (${closestStation.name}) est à ${closestStation.distanceKm.toFixed(1)} km`;
    }
    text += `. Les stations situées à proximité immédiate ont été privilégiées afin de représenter le plus fidèlement possible les conditions réelles observées sur place.`;
  } else if (mode === "local") {
    text += `avec une pondération renforcée pour les stations les plus proches.`;
  } else {
    text += `avec une pondération équilibrée entre distance, qualité et fraîcheur des données.`;
  }

  if (microFactors.length > 0) {
    const adjustments = microFactors.map(f => f.label).join(", ");
    text += ` Ajustements microclimatiques appliqués : ${adjustments}.`;
  }

  if (modelTemp != null && mode === "ultra-local") {
    text += ` Les modèles numériques ne contribuent qu'à 2% du calcul final.`;
  }

  return text;
}

// ─── Export mode config for UI ───────────────────────────────────────────────

export function getUltraLocalConfig(mode: LocalMode) {
  return {
    mode,
    config: MODE_CONFIG[mode],
    description: mode === "ultra-local"
      ? "Utilise uniquement les stations situées dans les 10 km, avec priorité aux moins de 2 km (60%). Vérification stricte de la qualité et fraîcheur des données."
      : mode === "local"
        ? "Utilise les stations situées dans les 30 km, avec priorité aux moins de 5 km (45%). Correction d'altitude activée."
        : "Pondération équilibrée entre distance, qualité et fraîcheur. Rayon de 20 km.",
  };
}
