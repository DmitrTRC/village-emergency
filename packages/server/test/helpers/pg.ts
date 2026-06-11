import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { runMigrations } from "../../src/db/migrate.js";
import { createDb, type Db } from "../../src/db/client.js";
import type postgres from "postgres";

export interface TestPg {
  db: Db;
  sql: ReturnType<typeof postgres>;
  url: string;
  stop: () => Promise<void>;
}

let container: StartedPostgreSqlContainer | undefined;

export async function startPg(): Promise<TestPg> {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const { db, sql } = createDb(url);
  return {
    db, sql, url,
    stop: async () => {
      await sql.end();
      await container?.stop();
    },
  };
}
