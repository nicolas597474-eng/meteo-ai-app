import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { makeLocationKey } from "../db";
import {
  closeP1ObservationWindow,
  P1ObservationClosureRejectedError,
} from "../weatherP1Closure";
import { adminProcedure, router } from "../_core/trpc";
import { latitudeSchema, longitudeSchema } from "../weatherInput";

export const p1ObservationRouter = router({
  close: adminProcedure
    .input(z.object({ lat: latitudeSchema, lon: longitudeSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await closeP1ObservationWindow({
          locationKey: makeLocationKey(input.lat, input.lon),
          validatedByUserId: ctx.user.id,
        });
      } catch (error) {
        if (error instanceof P1ObservationClosureRejectedError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw error;
      }
    }),
});
