import { SignJWT, jwtVerify } from "jose";
import { uuidv7 } from "uuidv7";
import type { Role } from "@village/shared";

export interface AccessClaims { sub: string; role: Role; }
export interface RefreshClaims { sub: string; jti: string; }

const ACCESS_TTL = "1h";
const REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60;

export function createJwt(secret: string) {
  const key = new TextEncoder().encode(secret);
  return {
    async signAccess(claims: AccessClaims): Promise<string> {
      return new SignJWT({ role: claims.role })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(claims.sub)
        .setIssuedAt()
        .setExpirationTime(ACCESS_TTL)
        .sign(key);
    },
    async verifyAccess(token: string): Promise<AccessClaims> {
      const { payload } = await jwtVerify(token, key);
      return { sub: String(payload.sub), role: payload.role as Role };
    },
    async signRefresh(sub: string): Promise<{ token: string; jti: string }> {
      const jti = uuidv7();
      const token = await new SignJWT({ jti })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + REFRESH_TTL_SECONDS)
        .sign(key);
      return { token, jti };
    },
    async verifyRefresh(token: string): Promise<RefreshClaims> {
      const { payload } = await jwtVerify(token, key);
      return { sub: String(payload.sub), jti: String(payload.jti) };
    },
  };
}
