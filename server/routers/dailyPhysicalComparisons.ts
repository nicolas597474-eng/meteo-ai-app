import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDailyPhysicalComparisonHistory, makeLocationKey } from "../db";
import {
  DAILY_PHYSICAL_COMPARISON_HORIZONS,
  DAILY_PHYSICAL_COMPARISON_VARIABLES,
} from "../dailyPhysicalComparisonHistory";
import { WEATHER_SERVICES } from "../weatherServices";
import { latitudeSchema, longitudeSchema } from "../weatherInput";

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const isoDateSchema = z.string().refine(isIsoDate, "La date doit être une date réelle au format AAAA-MM-JJ.");

export const dailyPhysicalComparisonsRouter = router({
  getHistory: adminProcedure
    .input(z.object({
      lat: latitudeSchema.optional(),
      lon: longitudeSchema.optional(),
      validDateFrom: isoDateSchema.optional(),
      validDateTo: isoDateSchema.optional(),
      serviceName: z.string().trim().min(1).max(64).optional(),
      variable: z.enum(DAILY_PHYSICAL_COMPARISON_VARIABLES).optional(),
      horizonBucket: z.enum(DAILY_PHYSICAL_COMPARISON_HORIZONS).optional(),
      cursor: z.object({ validDate: isoDateSchema, id: z.number().int().positive() }).optional(),
      pageSize: z.number().int().min(1).max(100).default(25),
    }).superRefine((input, context) => {
      if ((input.lat === undefined) !== (input.lon === undefined)) {
        context.addIssue({ code: "custom", path: ["lon"], message: "Fournir latitude et longitude ensemble." });
      }
      if (input.validDateFrom && input.validDateTo && input.validDateFrom > input.validDateTo) {
        context.addIssue({ code: "custom", path: ["validDateTo"], message: "La date de fin doit être postérieure ou égale à la date de début." });
      }
    }))
    .query(async ({ input }) => {
      const locationKey = input.lat !== undefined && input.lon !== undefined
        ? makeLocationKey(input.lat, input.lon)
        : "default";
      const history = await getDailyPhysicalComparisonHistory({
        locationKey,
        validDateFrom: input.validDateFrom,
        validDateTo: input.validDateTo,
        serviceName: input.serviceName,
        variable: input.variable,
        horizonBucket: input.horizonBucket,
        cursor: input.cursor,
        pageSize: input.pageSize,
      });
      return {
        ...history,
        modelOptions: WEATHER_SERVICES.expert.map(({ name, modelId }) => ({
          serviceName: name,
          modelId,
          isDerivedReference: modelId === "best_match",
        })),
      };
    }),
});
