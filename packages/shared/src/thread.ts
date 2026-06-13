import { z } from "zod";
import { MediaKind } from "./media.js";

export const IncidentEventType = z.enum([
  "created",
  "delivered",
  "accepted",
  "closed",
  "commented",
  "hidden",
  "reopened",
]);
export type IncidentEventType = z.infer<typeof IncidentEventType>;

export const IncidentEvent = z.object({
  id: z.string().uuid(),
  type: IncidentEventType,
  actorId: z.string().uuid().nullable(),
  payload: z.unknown().nullable(),
  at: z.string().datetime(),
});
export type IncidentEvent = z.infer<typeof IncidentEvent>;

export const IncidentComment = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  text: z.string(),
  createdAt: z.string().datetime(),
});
export type IncidentComment = z.infer<typeof IncidentComment>;

export const IncidentMediaView = z.object({
  id: z.string().uuid(),
  kind: MediaKind,
  mime: z.string(),
  url: z.string().url(),
});
export type IncidentMediaView = z.infer<typeof IncidentMediaView>;

export const IncidentThread = z.object({
  events: z.array(IncidentEvent),
  comments: z.array(IncidentComment),
  media: z.array(IncidentMediaView),
});
export type IncidentThread = z.infer<typeof IncidentThread>;
