import type { Role } from "@village/shared";
import { getDb } from "../db/idb";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessClaims {
  id: string;
  role: Role;
}

// Достаём sub/role из payload access-JWT без проверки подписи: на клиенте
// доверяем токену, выданному сервером. Нужно, чтобы роль пережила reload,
// когда user в памяти потерян, а сессия восстановлена по refresh.
export function decodeAccessClaims(token: string): AccessClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { sub?: string; role?: string };
    if (!claims.sub || !claims.role) return null;
    return { id: claims.sub, role: claims.role as Role };
  } catch {
    return null;
  }
}

let accessToken: string | null = null;

export function getAccess(): string | null {
  return accessToken;
}

export async function setTokens(pair: TokenPair): Promise<void> {
  accessToken = pair.accessToken;
  const db = await getDb();
  await db.put("tokens", { key: "refresh", value: pair.refreshToken });
}

export async function loadRefresh(): Promise<string | null> {
  const db = await getDb();
  const record = await db.get("tokens", "refresh");
  return record?.value ?? null;
}

export async function clear(): Promise<void> {
  accessToken = null;
  const db = await getDb();
  await db.delete("tokens", "refresh");
}
