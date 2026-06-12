import { readFileSync } from "node:fs";
import { parseEnv } from "./env.js";
import { createDb } from "./db/client.js";
import { houses } from "./db/schema.js";

const env = parseEnv();
const path = process.argv[2] ?? "data/houses.private.csv";
const lines = readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);

const { db, sql } = createDb(env.DATABASE_URL);
for (const address of lines) {
  await db.insert(houses).values({ address }).onConflictDoNothing();
}
await sql.end();
console.log(`seeded ${lines.length} houses`);
