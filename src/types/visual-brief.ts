import { z } from "zod";

export const VisualBriefSchema = z.object({
  direction: z.string().default(""),
  mood: z.array(z.string()).default([]),
  palette: z.array(z.string()).default([]),
  typography: z.string().default(""),
  image_notes: z.string().default(""),
  references: z.array(z.string()).default([]),
  from_channel_default: z.boolean().default(false),
});
export type VisualBrief = z.infer<typeof VisualBriefSchema>;
