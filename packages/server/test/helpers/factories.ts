import { uuidv7 } from "uuidv7";
import type { Db } from "../../src/db/client.js";
import { houses, users } from "../../src/db/schema.js";

export async function makeHouse(db: Db, address = `Дом ${Math.floor(Math.random() * 1e6)}`) {
  const [h] = await db.insert(houses).values({ address }).returning();
  return h!;
}

export async function makeUser(
  db: Db,
  opts: { role?: "resident" | "commander"; houseId?: string; tg?: string; name?: string } = {},
) {
  const houseId = opts.houseId ?? (await makeHouse(db)).id;
  const [u] = await db
    .insert(users)
    .values({
      telegramUserId: opts.tg ?? `tg-${uuidv7()}`,
      name: opts.name ?? "Тест Житель",
      houseId,
      role: opts.role ?? "resident",
    })
    .returning();
  return u!;
}
