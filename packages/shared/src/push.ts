import { z } from "zod";

export const PushSubscriptionDTO = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscriptionDTO = z.infer<typeof PushSubscriptionDTO>;
