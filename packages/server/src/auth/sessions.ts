import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { sessions } from "../db/schema.js";
import { createJwt } from "./jwt.js";
import type { Role } from "@village/shared";

const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface TokenPair { accessToken: string; refreshToken: string; }

export function createSessionService(db: Db, secret: string) {
  const jwt = createJwt(secret);

  async function issue(userId: string, role: Role): Promise<TokenPair> {
    const accessToken = await jwt.signAccess({ sub: userId, role });
    const { token: refreshToken } = await jwt.signRefresh(userId);
    await db.insert(sessions).values({
      userId,
      refreshHash: hash(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return { accessToken, refreshToken };
  }

  async function revokeAllForUser(userId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async function rotate(oldRefresh: string): Promise<TokenPair> {
    const claims = await jwt.verifyRefresh(oldRefresh);
    const oldHash = hash(oldRefresh);

    const reused = await db.query.sessions.findFirst({
      where: eq(sessions.prevRefreshHash, oldHash),
    });
    if (reused) {
      await revokeAllForUser(claims.sub);
      throw new Error("refresh reuse detected — all sessions revoked");
    }

    const current = await db.query.sessions.findFirst({
      where: and(eq(sessions.refreshHash, oldHash), isNull(sessions.revokedAt)),
    });
    if (!current) throw new Error("refresh not found or revoked");

    const role = (await db.query.users.findFirst({
      where: (u, { eq: e }) => e(u.id, claims.sub),
    }))?.role ?? "resident";

    const accessToken = await jwt.signAccess({ sub: claims.sub, role });
    const { token: refreshToken } = await jwt.signRefresh(claims.sub);

    await db
      .update(sessions)
      .set({
        refreshHash: hash(refreshToken),
        prevRefreshHash: oldHash,
        revokedAt: null,
      })
      .where(eq(sessions.id, current.id));

    return { accessToken, refreshToken };
  }

  return { issue, rotate, revokeAllForUser };
}
