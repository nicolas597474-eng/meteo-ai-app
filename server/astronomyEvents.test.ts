import { describe, expect, it } from "vitest";
import { buildAstronomyOutlook } from "./astronomyEvents";

describe("buildAstronomyOutlook", () => {
  it("expose les prochains repères lunaires, solaires et éclipses sans inventer de météo lointaine", () => {
    const outlook = buildAstronomyOutlook({
      dates: ["2026-08-18", "2026-08-21", "2026-08-24", "2026-08-28", "2026-09-01"],
      moonPhases: [0.2, 0.5, 0.74, 0.97, 0.2],
      daylightDurations: [51_000, 50_880],
      cloudCoverMeans: [20, 40, 65, 80, null],
      today: "2026-08-18",
    });

    expect(outlook.moonMilestones.find((event) => event.id === "full_moon")?.date).toBe("2026-08-27");
    expect(outlook.nextSolarMilestone).toEqual({ label: "Équinoxe de septembre", date: "2026-09-23" });
    expect(outlook.daylightChangeTomorrowSeconds).toBe(-120);
    expect(outlook.upcomingEclipses[0]).toMatchObject({ title: "Éclipse lunaire partielle", date: "2026-08-28", skyOutlook: { cloudCoverMean: 80 } });
    expect(outlook.upcomingEclipses[1]?.skyOutlook).toBeNull();
  });

  it("conserve une alerte solaire avec sa consigne de sécurité", () => {
    const outlook = buildAstronomyOutlook({ dates: [], moonPhases: [], daylightDurations: [], cloudCoverMeans: [], today: "2027-07-01" });
    const solar = outlook.upcomingEclipses.find((event) => event.id === "solar_partial_2027_08_02");
    expect(solar?.visibility).toBe("Partielle depuis la France");
    expect(solar?.safetyNote).toContain("lunettes d’éclipse homologuées");
  });
});
