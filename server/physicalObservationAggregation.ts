export type PhysicalSnapshot = {
  hour: number;
  stationCount: number;
  temperature: number | null;
  windSpeed: number | null;
  windGust: number | null;
  precipitation: number | null;
};

export type QualifiedDailyObservation = {
  isQualified: boolean;
  coverageHours: number;
  tempMax: number | null;
  tempMin: number | null;
  windSpeed: number | null;
  windGust: number | null;
  precipitation: number | null;
  reason: string;
};

const MINIMUM_COVERAGE_HOURS = 18;
const MINIMUM_STATIONS_PER_SNAPSHOT = 1;

/** Daily values are admissible only with enough independent physical evidence. */
export function buildQualifiedDailyObservation(snapshots: PhysicalSnapshot[]): QualifiedDailyObservation {
  const usable = snapshots.filter((snapshot) => snapshot.stationCount >= MINIMUM_STATIONS_PER_SNAPSHOT && snapshot.temperature != null);
  const temperatures = usable.map((snapshot) => snapshot.temperature!).filter(Number.isFinite);
  if (usable.length < MINIMUM_COVERAGE_HOURS || temperatures.length < MINIMUM_COVERAGE_HOURS) {
    return { isQualified: false, coverageHours: usable.length, tempMax: null, tempMin: null, windSpeed: null, windGust: null, precipitation: null, reason: `Couverture insuffisante : ${usable.length}/${MINIMUM_COVERAGE_HOURS} heures physiques qualifiées` };
  }
  const finite = (values: Array<number | null>) => values.filter((value): value is number => value != null && Number.isFinite(value));
  const wind = finite(usable.map((snapshot) => snapshot.windSpeed));
  const gusts = finite(usable.map((snapshot) => snapshot.windGust));
  const precipitation = finite(usable.map((snapshot) => snapshot.precipitation));
  return {
    isQualified: true,
    coverageHours: usable.length,
    tempMax: Math.max(...temperatures),
    tempMin: Math.min(...temperatures),
    windSpeed: wind.length ? Math.max(...wind) : null,
    windGust: gusts.length ? Math.max(...gusts) : null,
    precipitation: precipitation.length ? Math.max(...precipitation) : null,
    reason: "Observation journalière issue exclusivement de snapshots physiques qualifiés",
  };
}
