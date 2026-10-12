import type { ImpactObservationRow } from "./citizenFusionImpactService";

/** Missing historical admission is not inferred from a current validated status. */
export function restrictCitizenImpactToProspectiveEvidence(
 observations: readonly ImpactObservationRow[],
 citizenStationIds: readonly string[],
 qualifiedAtByStationId: ReadonlyMap<string, number>,
): ImpactObservationRow[] {
 const citizenIds = new Set(citizenStationIds);
 return observations.filter(observation => {
  if (!citizenIds.has(observation.stationId)) return true;
  const qualifiedAt = qualifiedAtByStationId.get(observation.stationId);
  const raw = observation.measurementTimes?.temperature;
  const measuredAt = typeof raw === "string" ? Date.parse(raw) : NaN;
  return qualifiedAt != null && Number.isFinite(qualifiedAt) && Number.isFinite(measuredAt) && measuredAt > qualifiedAt;
 });
}
