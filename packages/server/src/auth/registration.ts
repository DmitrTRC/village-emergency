import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { houses, users, registrationRequests } from "../db/schema.js";

export interface SubmitInput {
  telegramUserId: string;
  name: string;
  claimedHouseAddress: string;
  phone: string | null;
}

export type SubmitResult =
  | { kind: "existing"; userId: string }
  | { kind: "approved"; user: typeof users.$inferSelect }
  | { kind: "pending"; requestId: string };

export interface RegistrationConfig { bootstrapCommanderTg: string; }

export function createRegistrationService(db: Db, cfg: RegistrationConfig) {
  async function resolveHouse(address: string): Promise<string> {
    const h = await db.query.houses.findFirst({ where: eq(houses.address, address) });
    if (!h) throw new Error(`unknown house address: ${address}`);
    return h.id;
  }

  async function submit(input: SubmitInput): Promise<SubmitResult & { requestId?: string; user?: typeof users.$inferSelect }> {
    const existing = await db.query.users.findFirst({
      where: eq(users.telegramUserId, input.telegramUserId),
    });
    if (existing) return { kind: "existing", userId: existing.id };

    if (input.telegramUserId === cfg.bootstrapCommanderTg) {
      const houseId = await resolveHouse(input.claimedHouseAddress);
      const [user] = await db
        .insert(users)
        .values({
          telegramUserId: input.telegramUserId, name: input.name,
          phone: input.phone, houseId, role: "commander",
        })
        .returning();
      return { kind: "approved", user: user! };
    }

    const [req] = await db
      .insert(registrationRequests)
      .values({
        telegramUserId: input.telegramUserId, name: input.name,
        claimedHouseAddress: input.claimedHouseAddress, phone: input.phone,
      })
      .returning();
    return { kind: "pending", requestId: req!.id };
  }

  async function approve(requestId: string, commanderId: string): Promise<typeof users.$inferSelect> {
    const req = await db.query.registrationRequests.findFirst({
      where: eq(registrationRequests.id, requestId),
    });
    if (!req) throw new Error("registration request not found");
    const houseId = await resolveHouse(req.claimedHouseAddress);

    return db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          telegramUserId: req.telegramUserId, name: req.name,
          phone: req.phone, houseId, role: "resident",
        })
        .returning();
      await tx
        .update(registrationRequests)
        .set({ status: "approved", decidedAt: new Date(), decidedBy: commanderId })
        .where(eq(registrationRequests.id, requestId));
      return user!;
    });
  }

  async function reject(requestId: string, commanderId: string): Promise<void> {
    await db
      .update(registrationRequests)
      .set({ status: "rejected", decidedAt: new Date(), decidedBy: commanderId })
      .where(eq(registrationRequests.id, requestId));
  }

  return { submit, approve, reject };
}
