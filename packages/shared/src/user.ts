import { z } from "zod";

export const Role = z.enum(["resident", "commander"]);
export type Role = z.infer<typeof Role>;

export const NotifyPrefs = z.object({
  offence: z.boolean().default(false),
  attention: z.boolean().default(false),
});
export type NotifyPrefs = z.infer<typeof NotifyPrefs>;

export const User = z.object({
  id: z.string().uuid(),
  telegramUserId: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  houseId: z.string().uuid(),
  role: Role,
  notifyPrefs: NotifyPrefs,
});
export type User = z.infer<typeof User>;
