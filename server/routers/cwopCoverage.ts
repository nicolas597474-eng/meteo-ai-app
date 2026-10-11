import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { fetchCwopCoverage } from "../cwopMadisService";
import { getStationSourceDiagnosticReason } from "../stationSourceDiagnostics";

/**
 * Mesure de couverture CWOP/MADIS autour d'un point (phase 1 du plan
 * d'intégration) : inventaire réel de stations, sans observation ni entrée
 * dans la fusion. Diagnostic réservé à l'exploitation ; les erreurs
 * fournisseur ne fuient que leur catégorie sûre.
 */
export const cwopCoverageRouter = router({
  getCoverage: adminProcedure
    .input(z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      radiusKm: z.number().min(5).max(50).default(20),
    }))
    .query(async ({ input }) => {
      try {
        const report = await fetchCwopCoverage(input.lat, input.lon, input.radiusKm);
        return { status: "ok" as const, report };
      } catch (error) {
        return { status: "error" as const, reason: getStationSourceDiagnosticReason(error), report: null };
      }
    }),
});
