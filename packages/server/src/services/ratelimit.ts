import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { incidents } from "../db/schema.js";
import type { IncidentLevel } from "@village/shared";

export interface RateResult { allowed: boolean; reason?: string; }

const EMERGENCY_PER_HOUR = 5;
const ANY_PER_DAY = 20;

export async function checkIncidentRate(
  db: Db, authorId: string, level: IncidentLevel,
): Promise<RateResult> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [dayRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(incidents)
    .where(and(eq(incidents.authorId, authorId), gte(incidents.createdAtClient, dayAgo)));
  if ((dayRow?.n ?? 0) >= ANY_PER_DAY) {
    return { allowed: false, reason: `daily incident limit ${ANY_PER_DAY} reached` };
  }

  if (level === "emergency") {
    const [hourRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(incidents)
      .where(
        and(
          eq(incidents.authorId, authorId),
          eq(incidents.level, "emergency"),
          gte(incidents.createdAtClient, hourAgo),
        ),
      );
    if ((hourRow?.n ?? 0) >= EMERGENCY_PER_HOUR) {
      return { allowed: false, reason: `emergency limit ${EMERGENCY_PER_HOUR}/hour reached` };
    }
  }

  return { allowed: true };
}
