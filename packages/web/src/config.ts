import { z } from "zod";

const schema = z.object({
  VITE_API_BASE: z.string().default(""),
  VITE_VAPID_PUBLIC_KEY: z.string().optional(),
  VITE_TG_BOT: z.string().optional(),
  VITE_MAP_TILE_URL: z
    .string()
    .default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
  VITE_VILLAGE_NAME: z.string().default("КП Лукоморье"),
  // Центр карты по умолчанию — Воейково (индекс 188685)
  VITE_DEFAULT_LAT: z.coerce.number().default(59.9534),
  VITE_DEFAULT_LNG: z.coerce.number().default(30.7029),
});

const env = schema.parse(import.meta.env);

export const config = {
  apiBase: env.VITE_API_BASE,
  vapidPublicKey: env.VITE_VAPID_PUBLIC_KEY,
  tgBot: env.VITE_TG_BOT,
  mapTileUrl: env.VITE_MAP_TILE_URL,
  villageName: env.VITE_VILLAGE_NAME,
  defaultCenter: { lat: env.VITE_DEFAULT_LAT, lng: env.VITE_DEFAULT_LNG },
} as const;
