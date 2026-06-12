import { z } from "zod";

const schema = z.object({
  VITE_API_BASE: z.string().default(""),
  VITE_VAPID_PUBLIC_KEY: z.string().optional(),
  VITE_TG_BOT: z.string().optional(),
});

const env = schema.parse(import.meta.env);

export const config = {
  apiBase: env.VITE_API_BASE,
  vapidPublicKey: env.VITE_VAPID_PUBLIC_KEY,
  tgBot: env.VITE_TG_BOT,
} as const;
