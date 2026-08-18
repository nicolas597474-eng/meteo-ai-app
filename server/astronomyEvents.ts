export type MoonMilestone = {
  id: "new_moon" | "first_quarter" | "full_moon" | "last_quarter";
  label: string;
  date: string;
};

export type SolarMilestone = {
  label: string;
  date: string;
};

export type EclipseAlert = {
  id: string;
  title: string;
  date: string;
  visibility: string;
  safetyNote: string | null;
  sourceLabel: string;
  sourceUrl: string;
  skyOutlook: { cloudCoverMean: number; label: string } | null;
};

export type AstronomyOutlook = {
  moonMilestones: MoonMilestone[];
  nextSolarMilestone: SolarMilestone | null;
  daylightChangeTomorrowSeconds: number | null;
  upcomingEclipses: EclipseAlert[];
};

const MOON_TARGETS: Array<{ id: MoonMilestone["id"]; label: string; phase: number }> = [
  { id: "new_moon", label: "Nouvelle lune", phase: 0 },
  { id: "first_quarter", label: "Premier quartier", phase: 0.25 },
  { id: "full_moon", label: "Pleine lune", phase: 0.5 },
  { id: "last_quarter", label: "Dernier quartier", phase: 0.75 },
];

const SOLAR_MILESTONES: SolarMilestone[] = [
  { label: "Équinoxe de septembre", date: "2026-09-23" },
  { label: "Solstice de décembre", date: "2026-12-21" },
  { label: "Équinoxe de mars", date: "2027-03-20" },
  { label: "Solstice de juin", date: "2027-06-21" },
  { label: "Équinoxe de septembre", date: "2027-09-23" },
  { label: "Solstice de décembre", date: "2027-12-21" },
  { label: "Équinoxe de mars", date: "2028-03-20" },
  { label: "Solstice de juin", date: "2028-06-20" },
];

const ECLIPSES: Omit<EclipseAlert, "skyOutlook">[] = [
  {
    id: "lunar_partial_2026_08_28",
    title: "Éclipse lunaire partielle",
    date: "2026-08-28",
    visibility: "Visible depuis la France",
    safetyNote: null,
    sourceLabel: "NASA / Timeanddate",
    sourceUrl: "https://science.nasa.gov/eclipses/future-eclipses/",
  },
  {
    id: "lunar_penumbral_2027_02_20",
    title: "Éclipse lunaire pénombrale",
    date: "2027-02-20",
    visibility: "Visible depuis la France ; assombrissement discret",
    safetyNote: null,
    sourceLabel: "NASA / Timeanddate",
    sourceUrl: "https://science.nasa.gov/eclipses/future-eclipses/",
  },
  {
    id: "solar_partial_2027_08_02",
    title: "Éclipse solaire partielle",
    date: "2027-08-02",
    visibility: "Partielle depuis la France",
    safetyNote: "Observation directe uniquement avec des lunettes d’éclipse homologuées.",
    sourceLabel: "NASA / ESA",
    sourceUrl: "https://www.esa.int/Science_Exploration/Space_Science/European_solar_eclipses",
  },
  {
    id: "lunar_partial_2028_01_12",
    title: "Éclipse lunaire partielle",
    date: "2028-01-12",
    visibility: "Visible depuis la France",
    safetyNote: null,
    sourceLabel: "Timeanddate",
    sourceUrl: "https://www.timeanddate.com/eclipse/in/france",
  },
  {
    id: "solar_annular_2028_01_26",
    title: "Éclipse solaire annulaire",
    date: "2028-01-26",
    visibility: "Partielle depuis la France",
    safetyNote: "Observation directe uniquement avec des lunettes d’éclipse homologuées.",
    sourceLabel: "ESA / Timeanddate",
    sourceUrl: "https://www.esa.int/Science_Exploration/Space_Science/European_solar_eclipses",
  },
];

function skyLabel(cloudCoverMean: number) {
  if (cloudCoverMean <= 25) return "Ciel plutôt dégagé prévu";
  if (cloudCoverMean <= 60) return "Ciel variable prévu";
  return "Ciel possiblement nuageux";
}

function calculateMoonMilestones(today: string, currentPhase: number | null) {
  if (currentPhase == null || !Number.isFinite(currentPhase)) return [];
  const phase = ((currentPhase % 1) + 1) % 1;
  const start = new Date(`${today}T12:00:00Z`);
  return MOON_TARGETS.map((target) => {
    const cycleFraction = (target.phase - phase + 1) % 1;
    const date = new Date(start.getTime() + cycleFraction * 29.530588 * 86_400_000);
    return { id: target.id, label: target.label, date: date.toISOString().slice(0, 10) } satisfies MoonMilestone;
  }).sort((left, right) => left.date.localeCompare(right.date));
}

export function buildAstronomyOutlook(input: {
  dates: string[];
  moonPhases: Array<number | null>;
  daylightDurations: Array<number | null>;
  cloudCoverMeans: Array<number | null>;
  today: string;
}): AstronomyOutlook {
  const moonMilestones = calculateMoonMilestones(input.today, input.moonPhases[0] ?? null);
  const nextSolarMilestone = SOLAR_MILESTONES.find((milestone) => milestone.date >= input.today) ?? null;
  const daylightChangeTomorrowSeconds = input.daylightDurations[0] != null && input.daylightDurations[1] != null
    ? Math.round(input.daylightDurations[1]! - input.daylightDurations[0]!)
    : null;
  const cloudByDate = new Map(input.dates.map((date, index) => [date, input.cloudCoverMeans[index] ?? null]));
  const upcomingEclipses = ECLIPSES
    .filter((event) => event.date >= input.today)
    .slice(0, 3)
    .map((event) => {
      const cloudCoverMean = cloudByDate.get(event.date);
      return {
        ...event,
        skyOutlook: cloudCoverMean != null && Number.isFinite(cloudCoverMean)
          ? { cloudCoverMean: Math.round(cloudCoverMean), label: skyLabel(cloudCoverMean) }
          : null,
      };
    });
  return { moonMilestones, nextSolarMilestone, daylightChangeTomorrowSeconds, upcomingEclipses };
}
