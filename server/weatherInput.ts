import { z } from "zod";

export const latitudeSchema = z.number().finite().min(-90).max(90);
export const longitudeSchema = z.number().finite().min(-180).max(180);

export const optionalCoordinatesSchema = z.object({
  lat: latitudeSchema.optional(),
  lon: longitudeSchema.optional(),
}).refine(
  ({ lat, lon }) => (lat === undefined) === (lon === undefined),
  { message: "Les coordonnées latitude et longitude doivent être fournies ensemble." }
);

export const requiredCoordinatesSchema = z.object({
  lat: latitudeSchema,
  lon: longitudeSchema,
});
