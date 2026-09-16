import { z } from "zod";

export const SlideRoleSchema = z.enum([
  "cover",
  "photo",
  "info",
  "quote",
  "screenshot",
  "closing",
]);
export type SlideRole = z.infer<typeof SlideRoleSchema>;
