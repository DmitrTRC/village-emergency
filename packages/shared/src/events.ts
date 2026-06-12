import { z } from "zod";

export const SseEvent = z.object({
  type: z.enum([
    "incident.delivered",
    "incident.accepted",
    "incident.closed",
    "incident.commented",
  ]),
  id: z.string().uuid(),
});
export type SseEvent = z.infer<typeof SseEvent>;
