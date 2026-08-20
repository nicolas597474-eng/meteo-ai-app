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
 *   < 2 km  → 65% weight
 *   2-5 km  → 20% weight
 *   5-10 km → 10% weight
 *   10-20 km → 3% weight
 *   Models (numerical) → 2% weight
 *
 * Quality verification before using a station:
 *   1. Freshness: last measurement must be recent (< 30 min for ultra-local)
 *   2. Coherence: temperature must not deviate > 5°C from neighbors
 *   3. Altitude: adjust for elevation differences
 *   4. Historical quality: reliability score must be adequate
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

export type LocalMode = "standard" | "local" | "ultra-local";

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
  confidenceScore: number;
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
      { minKm: 0, maxKm: 5, weight: 0.55, label: "0-5 km" },
      { minKm: 5, maxKm: 10, weight: 0.25, label: "5-10 km" },
      { minKm: 10, maxKm: 20, weight: 0.10, label: "10-20 km" },
    ],
    modelWeight: 0.10,
    maxFreshnessMin: 60,
    maxTempDeviation: 6,
    minReliability: 40,
    altitudeCorrection: true,
    microclimateEnabled: false,
  },
  "ultra-local": {
    radiusBands: [
      { minKm: 0, maxKm: 2, weight: 0.65, label: "< 2 km" },
      { minKm: 2, maxKm: 5, weight: 0.20, label: "2-5 km" },
      { minKm: 5, maxKm: 10, weight: 0.10, label: "5-10 km" },
      { minKm: 10, maxKm: 20, weight: 0.03, label: "10-20 km" },
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
): { passed: boolean; checks: QualityCheck[]; altitudeAdj: number } {
  const checks: QualityCheck[] = [];
  let passed = true;
  let altitudeAdj = 0;

  // 1. Freshness check
  const ageMin = station.updatedAt
    ? (Date.now() - new Date(station.updatedAt).getTime()) / 60000
    : 999;
  const freshnessOk = ageMin <= config.maxFreshnessMin;
  checks.push({
    name: "Fraîcheur",
    passed: freshnessOk,
    value: `${Math.round(ageMin)} min`,
    threshold: `< ${config.maxFreshnessMin} min`,
  });
  if (!freshnessOk) passed = false;

  // 2. Coherence with neighbors
  if (station.temperature != null) {
    const neighbors = allStations.filter(
      s => s.stationId !== station.stationId &&
        s.temperature != null &&
        s.isActive &&
        s.distanceKm < 20
    );
    if (neighbors.length > 0) {
      const avgNeighborTemp = neighbors.reduce((sum, s) => sum + (s.temperature ?? 0), 0) / neighbors.length;
      const deviation = Math.abs(station.temperature - avgNeighborTemp);
      const coherenceOk = deviation <= config.maxTempDeviation;
      checks.push({
        name: "Cohérence",
        passed: coherenceOk,
        value: `±${deviation.toFixed(1)}°C`,
        threshold: `< ${config.maxTempDeviation}°C d'écart`,
      });
      if (!coherenceOk) passed = false;
    }
  }

  // 3. Altitude verification & correction
  if (config.altitudeCorrection && station.altitude != null && refAltitude != null) {
    const altDiff = station.altitude - refAltitude;
    // Standard lapse rate: -0.65°C per 100m
    altitudeAdj = -(altDiff / 100) * 0.65;
    // Exclude stations with extreme altitude difference (> 200m)
    const altitudeOk = Math.abs(altDiff) <= 200;
    checks.push({
      name: "Altitude",
      passed: altitudeOk,
      value: `${station.altitude}m (réf: ${refAltitude}m, Δ${Math.abs(altDiff)}m)`,
      threshold: altitudeOk
        ? `Correction: ${altitudeAdj > 0 ? "+" : ""}${altitudeAdj.toFixed(2)}°C`
        : `Écart > 200m — station exclue`,
    });
    if (!altitudeOk) passed = false;
  } else if (config.altitudeCorrection && station.altitude == null) {
    // No altitude data available — note it but don't exclude
    checks.push({
      name: "Altitude",
      passed: true,
      value: "Inconnue",
      threshold: "Non vérifiable",
    });
  }

  // 4. Historical quality
  const qualityOk = station.reliabilityScore >= config.minReliability;
  checks.push({
    name: "Qualité historique",
    passed: qualityOk,
    value: `${station.reliabilityScore}/100`,
    threshold: `≥ ${config.minReliability}`,
  });
  if (!qualityOk) passed = false;

  // 5. Stability (no null data = stable enough)
  const hasData = station.temperature != null || station.windSpeed != null;
  checks.push({
    name: "Stabilité",
    passed: hasData,
    value: hasData ? "Données disponibles" : "Aucune donnée",
    threshold: "Mesures actives",
  });
  if (!hasData) passed = false;

  return { passed, checks, altitudeAdj };
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
  modelTemperature: number | null = null
): UltraLocalResult {
  const config = MODE_CONFIG[mode];

  // Determine reference altitude from stations if not provided
  const effectiveAltitude = refAltitude ?? (
    stations.find(s => s.altitude != null && s.distanceKm < 5)?.altitude ?? null
  );

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
      return { station: s, passed: result.passed, checks: result.checks, altAdj: result.altitudeAdj };
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

    // Dans une même bande, les contrôles de cohérence et d'altitude ont déjà
    // exclu les mesures non admissibles. La pondération relative combine alors
    // distance, fiabilité historique et fraîcheur réelle du relevé.
    const inBandWeights = bandStations.map(v => {
      const distW = 1 / (v.station.distanceKm + 0.1);
      const qualW = v.station.reliabilityScore / 100;
      const ageMin = v.station.updatedAt
        ? Math.max(0, (Date.now() - new Date(v.station.updatedAt).getTime()) / 60000)
        : config.maxFreshnessMin;
      // Une mesure exactement à la limite reste admissible mais pèse moins
      // qu'une mesure récente ; la fonction est bornée pour rester stable.
      const freshnessW = Math.max(0.20, 1 - (Math.min(ageMin, config.maxFreshnessMin) / config.maxFreshnessMin) * 0.80);
      return (distW * 0.60 + qualW * 0.40) * freshnessW;
    });
    const inBandTotal = inBandWeights.reduce((s, w) => s + w, 0);

      bandStations.forEach((v, i) => {
        const stationWeight = (inBandWeights[i] / inBandTotal) * bandInfo.effectiveWeight;
        const adjustedTemp = v.station.temperature != null ? v.station.temperature + v.altAdj : null;
        const ageMin = v.station.updatedAt
          ? Math.max(0, (Date.now() - new Date(v.station.updatedAt).getTime()) / 60000)
          : config.maxFreshnessMin;
        const freshnessWeight = Math.max(0.20, 1 - (Math.min(ageMin, config.maxFreshnessMin) / config.maxFreshnessMin) * 0.80);

      if (adjustedTemp != null) {
        weightedTemp += adjustedTemp * stationWeight;
        totalWeight += stationWeight;
      }

      contributions.push({
        stationId: v.station.stationId,
        name: v.station.name,
        source: v.station.source,
        distanceKm: v.station.distanceKm,
        weight: Math.round(stationWeight * 1000) / 1000,
        distanceWeight: Math.round((1 / (v.station.distanceKm + 0.1)) * 1000) / 1000,
        qualityWeight: Math.round((v.station.reliabilityScore / 100) * 1000) / 1000,
        freshnessWeight: Math.round(freshnessWeight * 1000) / 1000,
        temperature: v.station.temperature,
        humidity: v.station.humidity,
        pressure: v.station.pressure,
        windSpeed: v.station.windSpeed,
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

  // Weighted averages for other variables
  function weightedAvgVar(field: "humidity" | "pressure" | "windSpeed" | "windGust" | "precipitation"): number | null {
    let sum = 0, wSum = 0;
    activeStations.forEach((v, idx) => {
      const val = v.station[field] as number | null;
      const w = contributions[idx]?.weight ?? 0;
      if (val != null && w > 0) {
        sum += val * w;
        wSum += w;
      }
    });
    return wSum > 0 ? Math.round((sum / wSum) * 10) / 10 : null;
  }

  // Confidence score
  const temps = contributions
    .map(c => c.adjustedTemperature ?? c.temperature)
    .filter((t): t is number => t != null);
  const tempStd = temps.length > 1
    ? Math.sqrt(temps.reduce((s, v) => s + (v - temps.reduce((a, b) => a + b) / temps.length) ** 2, 0) / temps.length)
    : 0;
  const confidenceScore = Math.max(0, Math.min(100, Math.round(
    100 - tempStd * 8 - Math.max(0, 4 - activeStations.length) * 8
  )));

  // Generate explanation
  const explanation = generateExplanation(mode, contributions, bandBreakdown, microFactors, finalTemp, modelTemperature);

  // Record current readings for next cycle's frozen/jump detection
  const readingsToRecord = stations
    .filter(s => s.temperature != null)
    .map(s => ({ stationId: s.stationId, temperature: s.temperature! }));
  recordStationReadings(readingsToRecord);

  return {
    mode,
    temperature: finalTemp,
    humidity: weightedAvgVar("humidity"),
    pressure: weightedAvgVar("pressure"),
    windSpeed: weightedAvgVar("windSpeed"),
    windGust: weightedAvgVar("windGust"),
    precipitation: weightedAvgVar("precipitation"),
    stationsUsed: contributions,
    stationsIgnored,
    modelContribution: modelTemperature,
    modelWeight: effectiveModelWeight,
    bandBreakdown,
    microclimateAdjustment: Math.round(microAdjustment * 10) / 10,
    microclimateFactors: microFactors,
    stationCount: activeStations.length,
    confidenceScore,
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
      ? "Privilégie fortement les stations les plus proches (< 2 km = 65%). Vérification stricte de la qualité et fraîcheur des données. Détection des microclimats."
      : mode === "local"
        ? "Pondération renforcée pour les stations proches (< 5 km = 55%). Correction d'altitude activée."
        : "Pondération équilibrée entre distance, qualité et fraîcheur. Rayon de 20 km.",
  };
}
