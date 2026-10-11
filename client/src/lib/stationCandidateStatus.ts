export type StationDisplayStatus = "physical" | "candidate" | "citizen-validated" | "reference" | "excluded";

type QualifiableStation = {
  isActive: boolean;
  source?: string | null;
  sourceKind?: "physical" | "reference";
  qualificationStatus?: "candidate" | "validated" | "excluded";
  exclusionReason?: string | null;
};

/** Sources citoyennes éligibles à la qualification par comparaison SYNOP. */
export const CITIZEN_QUALIFICATION_SOURCES: ReadonlySet<string> = new Set(["opensensemap", "cwop"]);

/**
 * Vrai pour une source éligible à la qualification citoyenne. Le test vit ici
 * pour que la carte, les badges et le classement partagent la même définition :
 * recopier la liste ailleurs la ferait diverger.
 */
export function isCitizenQualificationSource(source?: string | null): boolean {
  return source != null && CITIZEN_QUALIFICATION_SOURCES.has(source);
}

/**
 * Vrai pour un capteur citoyen effectivement qualifié (verdict « validé »
 * persisté). C'est la seule population que le filtre « capteurs citoyens
 * qualifiés » de la carte laisse passer : un capteur en validation ou écarté
 * n'est jamais qualifié.
 */
export function isQualifiedCitizenStation(station: {
  isActive?: boolean;
  source?: string | null;
  sourceKind?: "physical" | "reference";
  qualificationStatus?: "candidate" | "validated" | "excluded";
}): boolean {
  // Un statut d'activité inconnu n'écarte jamais le capteur : seul un `isActive`
  // explicitement faux le fait. Le verdict citoyen « validé » ne dépend de toute
  // façon pas de l'activité, et ce prédicat ne teste que lui.
  return getStationDisplayStatus({ ...station, isActive: station.isActive ?? true }) === "citizen-validated";
}

/**
 * Vrai pour un capteur citoyen qui n'a pas encore — ou n'aura jamais — le
 * verdict « validé ». C'est exactement la population que le filtre de la carte
 * retire : les capteurs citoyens en validation et les capteurs citoyens exclus.
 *
 * Le prédicat est volontairement restreint aux sources citoyennes : une station
 * officielle ou Netatmo n'est jamais « non qualifiée » par ce chemin, et une
 * source écartée pour une autre raison n'est pas concernée.
 */
export function isUnqualifiedCitizenStation(station: {
  isActive?: boolean;
  source?: string | null;
  sourceKind?: "physical" | "reference";
  qualificationStatus?: "candidate" | "validated" | "excluded";
}): boolean {
  return isCitizenQualificationSource(station.source) && !isQualifiedCitizenStation(station);
}

export function getStationDisplayStatus(station: {
  isActive: boolean;
  source?: string | null;
  sourceKind?: "physical" | "reference";
  qualificationStatus?: "candidate" | "validated" | "excluded";
}): StationDisplayStatus {
  if (station.qualificationStatus === "candidate") return "candidate";
  // Un capteur citoyen validé conserve son verdict même s'il reste inactif dans
  // la fusion locale : « validé » ne doit jamais s'afficher comme « exclu ».
  if (
    station.source != null &&
    CITIZEN_QUALIFICATION_SOURCES.has(station.source) &&
    station.qualificationStatus === "validated"
  ) {
    return "citizen-validated";
  }
  if (!station.isActive) return "excluded";
  return station.sourceKind === "physical" ? "physical" : "reference";
}

export type StationQualificationBadgeKind =
  | "official"
  | "citizen-candidate"
  | "citizen-validated"
  | "excluded"
  | "netatmo"
  | "reference";

export type StationQualificationBadge = {
  kind: StationQualificationBadgeKind;
  label: string;
  /** Motif d'exclusion persisté, affiché tel quel : jamais réécrit ni inventé. */
  detail?: string;
};

/**
 * Badge de qualification public : Station officielle, Capteur citoyen en
 * validation, Capteur citoyen validé ou Exclu. Aucun capteur citoyen n'est
 * jamais étiqueté Netatmo, Weather Underground ou station officielle ; une
 * station Netatmo n'est jamais étiquetée officielle.
 */
export function getStationQualificationBadge(station: QualifiableStation): StationQualificationBadge {
  const displayStatus = getStationDisplayStatus(station);
  if (displayStatus === "candidate") {
    return { kind: "citizen-candidate", label: "Capteur citoyen en validation" };
  }
  if (displayStatus === "citizen-validated") {
    return { kind: "citizen-validated", label: "Capteur citoyen validé" };
  }
  if (displayStatus === "excluded") {
    return { kind: "excluded", label: "Exclu", ...(station.exclusionReason ? { detail: station.exclusionReason } : {}) };
  }
  if (displayStatus === "reference") {
    return { kind: "reference", label: "Référence de modèle" };
  }
  if (station.source === "netatmo") {
    return { kind: "netatmo", label: "Station Netatmo" };
  }
  return { kind: "official", label: "Station officielle" };
}
