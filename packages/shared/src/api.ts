import { z } from "zod";
import { Incident, NewIncidentInput, CloseReason } from "./incident.js";
import { Media } from "./media.js";

export const PresignedUpload = z.object({
  mediaId: z.string().uuid(),
  url: z.string().url(),
  s3Key: z.string(),
});

export const CreateIncidentResponse = z.object({
  incident: Incident,
  uploads: z.array(PresignedUpload),
});
export type CreateIncidentResponse = z.infer<typeof CreateIncidentResponse>;

export const CloseIncidentInput = z.object({ reason: CloseReason });
export const CommentInput = z.object({ text: z.string().min(1).max(2000) });
