import { z } from "zod";

const schema = z.object({
  VITE_API_BASE: z.string().default(""),
  VITE_VAPID_PUBLIC_KEY: z.string().optional(),
  VITE_TG_BOT: z.string().optional(),
  VITE_MAP_TILE_URL: z
    .string()
    .default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
  VITE_VILLAGE_NAME: z.string().default("Наше село"),
});

const env = schema.parse(import.meta.env);

export const config = {
  apiBase: env.VITE_API_BASE,
  vapidPublicKey: env.VITE_VAPID_PUBLIC_KEY,
  tgBot: env.VITE_TG_BOT,
  mapTileUrl: env.VITE_MAP_TILE_URL,
  villageName: env.VITE_VILLAGE_NAME,
} as const;
