/**
 * Conventions temporelles métier MeteoAI.
 * Toutes les clés de prévision et décisions horaire/journalier doivent utiliser
 * Europe/Paris, indépendamment du fuseau de l'hôte serveur ou du navigateur.
 */
export const METEO_TIME_ZONE = "Europe/Paris";

export function getParisDate(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: METEO_TIME_ZONE });
}

export function getParisHour(date = new Date()): number {
  const hour = new Intl.DateTimeFormat("fr-FR", {
    timeZone: METEO_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  return hour != null ? Number(hour) : 0;
}

export function getParisDateDaysAgo(daysAgo: number, now = new Date()): string {
  return getParisDate(new Date(now.getTime() - daysAgo * 86_400_000));
}
