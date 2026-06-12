import { getDb } from "../db/idb";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
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
