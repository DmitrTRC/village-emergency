import { z } from "zod";

export const IncidentLevel = z.enum(["emergency", "offence", "attention"]);
export type IncidentLevel = z.infer<typeof IncidentLevel>;

export const IncidentStatus = z.enum(["draft", "delivered", "accepted", "closed"]);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const Visibility = z.enum(["private", "public"]);
export type Visibility = z.infer<typeof Visibility>;

export const CloseReason = z.enum(["resolved", "false", "duplicate"]);
export type CloseReason = z.infer<typeof CloseReason>;

export const Geo = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().nullable(),
  capturedAt: z.string().datetime(),
});
export type Geo = z.infer<typeof Geo>;

export const MediaManifestItem = z.object({
  id: z.string().uuid(),
  kind: z.enum(["photo", "voice", "video"]),
  mime: z.string(),
  bytes: z.number().int().positive(),
});

export const NewIncidentInput = z
  .object({
    id: z.string().uuid(),
    level: IncidentLevel,
    text: z.string().max(4000).optional(),
    geo: Geo.optional(),
    media: z.array(MediaManifestItem).max(5).optional(),
  })
  .refine(
    (v) =>
      v.level === "emergency" ||
      Boolean(v.text?.trim()) ||
      (v.media?.length ?? 0) > 0 ||
      Boolean(v.geo),
    { message: "non-emergency incident requires text, media or geo" },
  );
export type NewIncidentInput = z.infer<typeof NewIncidentInput>;

export const Incident = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  level: IncidentLevel,
  status: IncidentStatus,
  visibility: Visibility,
  closeReason: CloseReason.nullable(),
  text: z.string().nullable(),
  geo: Geo.nullable(),
  createdAtClient: z.string().datetime(),
  deliveredAtServer: z.string().datetime().nullable(),
  acceptedAt: z.string().datetime().nullable(),
  closedAt: z.string().datetime().nullable(),
});
export type Incident = z.infer<typeof Incident>;
