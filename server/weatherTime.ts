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

export function getParisMinute(date = new Date()): number {
  const minute = new Intl.DateTimeFormat("fr-FR", {
    timeZone: METEO_TIME_ZONE,
    minute: "2-digit",
  }).formatToParts(date).find((part) => part.type === "minute")?.value;
  return minute != null ? Number(minute) : 0;
}

export function getParisDateDaysAgo(daysAgo: number, now = new Date()): string {
  return getParisDate(new Date(now.getTime() - daysAgo * 86_400_000));
}

function parisWallClockToUtc(date: string, hour: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  const parisParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: METEO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wallClockUtc));
  const value = Object.fromEntries(parisParts.map((part) => [part.type, part.value]));
  const parisAsUtc = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), 0, 0);
  return new Date(wallClockUtc + (wallClockUtc - parisAsUtc));
}

/** Retourne le prochain instant correspondant à 05:00 dans le fuseau métier. */
export function getNextParisForecastRun(now = new Date()): Date {
  const today = getParisDate(now);
  const todayRun = parisWallClockToUtc(today, 5);
  if (todayRun.getTime() > now.getTime()) return todayRun;
  const [year, month, day] = today.split("-").map(Number);
  const nextDate = getParisDate(new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0)));
  return parisWallClockToUtc(nextDate, 5);
}
