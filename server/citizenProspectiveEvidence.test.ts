import { describe, expect, it } from "vitest";
import { restrictCitizenImpactToProspectiveEvidence } from "./citizenProspectiveEvidence";
const at = Date.parse("2026-10-12T08:00:00Z");
function observation(stationId: string, measured: number | null) {
 return { stationId, temperature: 10, observedAt: at + 5000, measurementTimes: measured == null ? null : { temperature: new Date(measured).toISOString() } };
}
describe("prospective citizen impact evidence", () => {
 it("keeps only a citizen measurement strictly after actual qualification and preserves physical witnesses", () => {
  const physical = observation("mf", at - 5000);
  const future = observation("citizen", at + 1);
  expect(restrictCitizenImpactToProspectiveEvidence([physical, observation("citizen", at - 1), observation("citizen", at), future], ["citizen"], new Map([["citizen", at]]))).toEqual([physical, future]);
 });
 it("never infers an old admission from current validated or archive time", () => {
  const physical = observation("mf", null);
  expect(restrictCitizenImpactToProspectiveEvidence([physical, observation("citizen", at + 1)], ["citizen"], new Map())).toEqual([physical]);
  expect(restrictCitizenImpactToProspectiveEvidence([observation("citizen", null)], ["citizen"], new Map([["citizen", at]]))).toEqual([]);
 });
});
