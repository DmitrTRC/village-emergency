import { z } from "zod";

export const MediaKind = z.enum(["photo", "voice", "video"]);
export type MediaKind = z.infer<typeof MediaKind>;

export const UploadStatus = z.enum(["pending", "uploaded"]);
export type UploadStatus = z.infer<typeof UploadStatus>;

export const Media = z.object({
  id: z.string().uuid(),
  incidentId: z.string().uuid(),
  kind: MediaKind,
  s3Key: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  uploadStatus: UploadStatus,
});
export type Media = z.infer<typeof Media>;
