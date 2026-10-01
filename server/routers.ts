import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { weatherRouter } from "./routers/weather";
import { favoritesRouter } from "./routers/favorites";
import { netatmoRouter } from "./routers/netatmo";
import { personalObservationsRouter } from "./routers/personalObservations";
import { p1ObservationRouter } from "./routers/p1Observation";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  weather: weatherRouter,
  favorites: favoritesRouter,
  netatmo: netatmoRouter,
  personalObservations: personalObservationsRouter,
  p1Observation: p1ObservationRouter,
});

export type AppRouter = typeof appRouter;
