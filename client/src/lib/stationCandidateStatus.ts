export type StationDisplayStatus = "physical" | "candidate" | "reference" | "excluded";

export function getStationDisplayStatus(station: {
  isActive: boolean;
  sourceKind?: "physical" | "reference";
  qualificationStatus?: "candidate" | "validated" | "excluded";
}): StationDisplayStatus {
  if (station.qualificationStatus === "candidate") return "candidate";
  if (!station.isActive) return "excluded";
  return station.sourceKind === "physical" ? "physical" : "reference";
}
