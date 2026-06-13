import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Incident } from "@village/shared";

export interface OutboxMedia {
  id: string;
  blob: Blob;
  mime: string;
}

export interface OutboxItem {
  id: string;
  input: unknown;
  media: OutboxMedia[];
  status: "pending" | "delivered";
  createdAtClient: string;
}

export interface TokenRecord {
  key: "refresh";
  value: string;
}

interface VillageDB extends DBSchema {
  outbox: { key: string; value: OutboxItem };
  incidents: { key: string; value: Incident };
  tokens: { key: string; value: TokenRecord };
}

const DB_NAME = "village-emrg";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<VillageDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<VillageDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VillageDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("incidents")) {
          db.createObjectStore("incidents", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("tokens")) {
          db.createObjectStore("tokens", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
}

export async function resetDbForTests(): Promise<void> {
  await closeDb();
  await deleteDB(DB_NAME);
}
