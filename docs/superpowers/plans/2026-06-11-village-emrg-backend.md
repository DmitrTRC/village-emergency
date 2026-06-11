# village-emrg Backend (Plan 1/2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий backend для village-emrg — REST API + Telegram-bot auth + жизненный цикл инцидентов + SSE real-time + web-push + pre-signed media, всё под интеграционными тестами.

**Architecture:** pnpm-монорепо. `packages/shared` — Zod-схемы и доменные типы, общие для будущего фронта. `packages/server` — Node 22 + Hono, Drizzle ORM поверх PostgreSQL. Real-time через Postgres `LISTEN/NOTIFY` → SSE. Auth через grammy-бота в том же процессе. Тесты — Vitest + testcontainers (реальный PostgreSQL в Docker).

**Tech Stack:** TypeScript, Node 22, Hono, Zod, Drizzle ORM, PostgreSQL 16, grammy, web-push, @aws-sdk/client-s3 (S3-совместимый Selectel), Vitest, testcontainers.

**Спек:** `docs/superpowers/specs/2026-06-11-village-emrg-design.md`

---

## File Structure

```
package.json                         # корень монорепо (pnpm workspaces)
pnpm-workspace.yaml
tsconfig.base.json
.env.example
.gitignore (уже есть — дополнить)

packages/shared/
  package.json
  tsconfig.json
  src/
    index.ts                         # реэкспорт
    incident.ts                      # Zod: level, status, visibility, closeReason, Incident
    user.ts                          # Zod: role, User, notifyPrefs
    media.ts                         # Zod: mediaKind, Media, uploadStatus
    events.ts                        # Zod: SSE-сообщения {type, id}
    api.ts                           # Zod: request/response DTO

packages/server/
  package.json
  tsconfig.json
  vitest.config.ts
  drizzle.config.ts
  src/
    env.ts                           # парсинг и валидация process.env через Zod
    db/
      schema.ts                      # Drizzle-таблицы
      client.ts                      # пул соединений
      migrate.ts                     # запуск миграций на старте
    domain/
      lifecycle.ts                   # transition() чистая функция
      policy.ts                      # canView/canAccept/canClose/canComment
    services/
      incidents.ts                   # создание, переходы, выборки
      sse.ts                         # LISTEN/NOTIFY хаб
      push.ts                        # web-push dispatcher
      media.ts                       # pre-signed URL (S3)
      ratelimit.ts                   # sliding window на incident_events
    auth/
      jwt.ts                         # подпись/верификация access+refresh
      sessions.ts                    # ротация refresh, reuse-detection
      telegram.ts                    # grammy bot, регистрация, login-link
    http/
      app.ts                         # сборка Hono-приложения
      middleware.ts                  # auth-middleware, error-handler
      routes/
        auth.ts                      # /auth/tg
        incidents.ts                 # /incidents CRUD + transitions
        media.ts                     # /incidents/:id/media
        events.ts                    # /events (SSE)
        registrations.ts             # /registrations (модерация)
    index.ts                         # bootstrap: migrate → bot → server
  test/
    helpers/
      pg.ts                          # testcontainers PostgreSQL fixture
      factories.ts                   # фабрики user/incident для тестов
    domain/
      lifecycle.test.ts
      policy.test.ts
    services/
      incidents.test.ts
      sse.test.ts
      ratelimit.test.ts
    auth/
      sessions.test.ts
      telegram.test.ts
    http/
      incidents.test.ts
      registrations.test.ts
      media.test.ts
```

---

## Task 1: pnpm-монорепо и tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Создать корневой `package.json`**

```json
{
  "name": "village-emrg",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 2: Создать `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Создать `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 4: Создать `.env.example` (только плейсхолдеры)**

```bash
DATABASE_URL=postgres://user:password@localhost:5432/village_emrg
JWT_SECRET=replace-with-64-hex-chars
TG_BOT_TOKEN=000000:replace-with-telegram-bot-token
BOOTSTRAP_COMMANDER_TG=000000000
VAPID_PUBLIC=replace-with-vapid-public-key
VAPID_PRIVATE=replace-with-vapid-private-key
VAPID_SUBJECT=mailto:admin@example.com
S3_ENDPOINT=https://s3.ru-1.storage.selcloud.ru
S3_REGION=ru-1
S3_BUCKET=village-emrg-media
S3_ACCESS_KEY=replace-with-access-key
S3_SECRET_KEY=replace-with-secret-key
PUBLIC_BASE_URL=http://localhost:5173
PORT=8787
```

- [ ] **Step 5: Дополнить `.gitignore`**

Добавить в конец файла:

```
node_modules/
dist/
.env
data/houses.private.csv
```

- [ ] **Step 6: Установить корневые зависимости и проверить pnpm**

Run: `pnpm install`
Expected: создаётся `pnpm-lock.yaml`, ошибок нет.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .env.example .gitignore pnpm-lock.yaml
git commit -m "chore: pnpm monorepo skeleton + env template"
```

---

## Task 2: packages/shared — Zod-схемы домена

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/{index,incident,user,media,events,api}.ts`
- Test: `packages/shared/test/incident.test.ts`

- [ ] **Step 1: Создать `packages/shared/package.json`**

```json
{
  "name": "@village/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```

- [ ] **Step 2: Создать `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Написать падающий тест `packages/shared/test/incident.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { IncidentLevel, NewIncidentInput } from "../src/incident.js";

describe("IncidentLevel", () => {
  it("принимает три уровня", () => {
    expect(IncidentLevel.parse("emergency")).toBe("emergency");
    expect(IncidentLevel.parse("offence")).toBe("offence");
    expect(IncidentLevel.parse("attention")).toBe("attention");
  });
  it("отвергает чужой уровень", () => {
    expect(() => IncidentLevel.parse("warning")).toThrow();
  });
});

describe("NewIncidentInput", () => {
  it("emergency без текста и медиа — допустим", () => {
    const r = NewIncidentInput.safeParse({
      id: "0192f000-0000-7000-8000-000000000000",
      level: "emergency",
    });
    expect(r.success).toBe(true);
  });
  it("attention без текста, без медиа и без гео — отказ", () => {
    const r = NewIncidentInput.safeParse({
      id: "0192f000-0000-7000-8000-000000000000",
      level: "attention",
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 4: Запустить тест — должен упасть**

Run: `pnpm --filter @village/shared test`
Expected: FAIL — модуль `../src/incident.js` не найден.

- [ ] **Step 5: Создать `packages/shared/src/incident.ts`**

```ts
import { z } from "zod";

export const IncidentLevel = z.enum(["emergency", "offence", "attention"]);
export type IncidentLevel = z.infer<typeof IncidentLevel>;

export const IncidentStatus = z.enum(["draft", "delivered", "accepted", "closed"]);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const Visibility = z.enum(["private", "public"]);
export type Visibility = z.infer<typeof Visibility>;

export const CloseReason = z.enum(["resolved", "false", "duplicate"]);
export type CloseReason = z.infer<typeof CloseReason>;

export const Geo = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().nullable(),
  capturedAt: z.string().datetime(),
});
export type Geo = z.infer<typeof Geo>;

export const MediaManifestItem = z.object({
  id: z.string().uuid(),
  kind: z.enum(["photo", "voice", "video"]),
  mime: z.string(),
  bytes: z.number().int().positive(),
});

export const NewIncidentInput = z
  .object({
    id: z.string().uuid(),
    level: IncidentLevel,
    text: z.string().max(4000).optional(),
    geo: Geo.optional(),
    media: z.array(MediaManifestItem).max(5).optional(),
  })
  .refine(
    (v) =>
      v.level === "emergency" ||
      Boolean(v.text?.trim()) ||
      (v.media?.length ?? 0) > 0 ||
      Boolean(v.geo),
    { message: "non-emergency incident requires text, media or geo" },
  );
export type NewIncidentInput = z.infer<typeof NewIncidentInput>;

export const Incident = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  level: IncidentLevel,
  status: IncidentStatus,
  visibility: Visibility,
  closeReason: CloseReason.nullable(),
  text: z.string().nullable(),
  geo: Geo.nullable(),
  createdAtClient: z.string().datetime(),
  deliveredAtServer: z.string().datetime().nullable(),
  acceptedAt: z.string().datetime().nullable(),
  closedAt: z.string().datetime().nullable(),
});
export type Incident = z.infer<typeof Incident>;
```

- [ ] **Step 6: Создать `packages/shared/src/user.ts`**

```ts
import { z } from "zod";

export const Role = z.enum(["resident", "commander"]);
export type Role = z.infer<typeof Role>;

export const NotifyPrefs = z.object({
  offence: z.boolean().default(false),
  attention: z.boolean().default(false),
});
export type NotifyPrefs = z.infer<typeof NotifyPrefs>;

export const User = z.object({
  id: z.string().uuid(),
  telegramUserId: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  houseId: z.string().uuid(),
  role: Role,
  notifyPrefs: NotifyPrefs,
});
export type User = z.infer<typeof User>;
```

- [ ] **Step 7: Создать `packages/shared/src/media.ts`**

```ts
import { z } from "zod";

export const MediaKind = z.enum(["photo", "voice", "video"]);
export type MediaKind = z.infer<typeof MediaKind>;

export const UploadStatus = z.enum(["pending", "uploaded"]);
export type UploadStatus = z.infer<typeof UploadStatus>;

export const Media = z.object({
  id: z.string().uuid(),
  incidentId: z.string().uuid(),
  kind: MediaKind,
  s3Key: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  uploadStatus: UploadStatus,
});
export type Media = z.infer<typeof Media>;
```

- [ ] **Step 8: Создать `packages/shared/src/events.ts`**

```ts
import { z } from "zod";

export const SseEvent = z.object({
  type: z.enum([
    "incident.delivered",
    "incident.accepted",
    "incident.closed",
    "incident.commented",
  ]),
  id: z.string().uuid(),
});
export type SseEvent = z.infer<typeof SseEvent>;
```

- [ ] **Step 9: Создать `packages/shared/src/api.ts`**

```ts
import { z } from "zod";
import { Incident, NewIncidentInput, CloseReason } from "./incident.js";
import { Media } from "./media.js";

export const PresignedUpload = z.object({
  mediaId: z.string().uuid(),
  url: z.string().url(),
  s3Key: z.string(),
});

export const CreateIncidentResponse = z.object({
  incident: Incident,
  uploads: z.array(PresignedUpload),
});
export type CreateIncidentResponse = z.infer<typeof CreateIncidentResponse>;

export const CloseIncidentInput = z.object({ reason: CloseReason });
export const CommentInput = z.object({ text: z.string().min(1).max(2000) });

export { NewIncidentInput, Incident, Media };
```

- [ ] **Step 10: Создать `packages/shared/src/index.ts`**

```ts
export * from "./incident.js";
export * from "./user.js";
export * from "./media.js";
export * from "./events.js";
export * from "./api.js";
```

- [ ] **Step 11: Запустить тест — должен пройти**

Run: `pnpm --filter @village/shared test`
Expected: PASS — оба describe зелёные.

- [ ] **Step 12: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): Zod-схемы инцидентов, пользователей, медиа, событий"
```

---

## Task 3: packages/server — каркас, env, зависимости

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/vitest.config.ts`
- Create: `packages/server/src/env.ts`
- Test: `packages/server/test/env.test.ts`

- [ ] **Step 1: Создать `packages/server/package.json`**

```json
{
  "name": "@village/server",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@village/shared": "workspace:*",
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.0",
    "grammy": "^1.30.0",
    "web-push": "^3.6.0",
    "@aws-sdk/client-s3": "^3.670.0",
    "@aws-sdk/s3-request-presigner": "^3.670.0",
    "jose": "^5.9.0",
    "uuidv7": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "typescript": "^5.6.0",
    "testcontainers": "^10.13.0",
    "@types/web-push": "^3.6.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Создать `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Создать `packages/server/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: "forks",
    fileParallelism: false,
  },
});
```

- [ ] **Step 4: Написать падающий тест `packages/server/test/env.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/env.js";

describe("parseEnv", () => {
  it("парсит валидное окружение", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@h:5432/db",
      JWT_SECRET: "x".repeat(64),
      TG_BOT_TOKEN: "123:abc",
      BOOTSTRAP_COMMANDER_TG: "42",
      VAPID_PUBLIC: "pub",
      VAPID_PRIVATE: "priv",
      VAPID_SUBJECT: "mailto:a@b.c",
      S3_ENDPOINT: "https://s3",
      S3_REGION: "ru-1",
      S3_BUCKET: "b",
      S3_ACCESS_KEY: "ak",
      S3_SECRET_KEY: "sk",
      PUBLIC_BASE_URL: "http://localhost:5173",
      PORT: "8787",
    });
    expect(env.PORT).toBe(8787);
    expect(env.S3_BUCKET).toBe("b");
  });
  it("отвергает короткий JWT_SECRET", () => {
    expect(() => parseEnv({ JWT_SECRET: "short" } as never)).toThrow();
  });
});
```

- [ ] **Step 5: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test env`
Expected: FAIL — `../src/env.js` не найден.

- [ ] **Step 6: Создать `packages/server/src/env.ts`**

```ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  TG_BOT_TOKEN: z.string().min(1),
  BOOTSTRAP_COMMANDER_TG: z.string().min(1),
  VAPID_PUBLIC: z.string().min(1),
  VAPID_PRIVATE: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(8787),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}
```

- [ ] **Step 7: Установить зависимости**

Run: `pnpm install`
Expected: server-зависимости встают, `@village/shared` линкуется как `workspace:*`.

- [ ] **Step 8: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test env`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/server pnpm-lock.yaml
git commit -m "feat(server): каркас пакета + валидация env через Zod"
```

---

## Task 4: Drizzle-схема БД

**Files:**
- Create: `packages/server/src/db/schema.ts`
- Create: `packages/server/src/db/client.ts`
- Create: `packages/server/drizzle.config.ts`

- [ ] **Step 1: Создать `packages/server/src/db/schema.ts`**

```ts
import {
  pgTable, uuid, text, timestamp, jsonb, integer, boolean, pgEnum,
} from "drizzle-orm/pg-core";

export const levelEnum = pgEnum("incident_level", ["emergency", "offence", "attention"]);
export const statusEnum = pgEnum("incident_status", ["draft", "delivered", "accepted", "closed"]);
export const visibilityEnum = pgEnum("visibility", ["private", "public"]);
export const closeReasonEnum = pgEnum("close_reason", ["resolved", "false", "duplicate"]);
export const roleEnum = pgEnum("role", ["resident", "commander"]);
export const mediaKindEnum = pgEnum("media_kind", ["photo", "voice", "video"]);
export const uploadStatusEnum = pgEnum("upload_status", ["pending", "uploaded"]);
export const regStatusEnum = pgEnum("reg_status", ["pending", "approved", "rejected"]);
export const eventTypeEnum = pgEnum("event_type", [
  "created", "delivered", "accepted", "closed", "commented", "hidden", "reopened",
]);

export const houses = pgTable("houses", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull().unique(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  houseId: uuid("house_id").notNull().references(() => houses.id),
  role: roleEnum("role").notNull().default("resident"),
  pushSubscription: jsonb("push_subscription"),
  notifyPrefs: jsonb("notify_prefs").notNull().default({ offence: false, attention: false }),
  isBlocked: boolean("is_blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registrationRequests = pgTable("registration_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramUserId: text("telegram_user_id").notNull(),
  name: text("name").notNull(),
  claimedHouseAddress: text("claimed_house_address").notNull(),
  phone: text("phone"),
  status: regStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by").references(() => users.id),
});

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey(),
  authorId: uuid("author_id").notNull().references(() => users.id),
  level: levelEnum("level").notNull(),
  status: statusEnum("status").notNull().default("delivered"),
  visibility: visibilityEnum("visibility").notNull().default("private"),
  closeReason: closeReasonEnum("close_reason"),
  text: text("text"),
  geoLat: integer("geo_lat_e6"),
  geoLng: integer("geo_lng_e6"),
  geoAccuracyM: integer("geo_accuracy_m"),
  geoCapturedAt: timestamp("geo_captured_at", { withTimezone: true }),
  createdAtClient: timestamp("created_at_client", { withTimezone: true }).notNull(),
  deliveredAtServer: timestamp("delivered_at_server", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const incidentMedia = pgTable("incident_media", {
  id: uuid("id").primaryKey(),
  incidentId: uuid("incident_id").notNull().references(() => incidents.id),
  kind: mediaKindEnum("kind").notNull(),
  s3Key: text("s3_key").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  uploadStatus: uploadStatusEnum("upload_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incidentComments = pgTable("incident_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").notNull().references(() => incidents.id),
  authorId: uuid("author_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
});

export const incidentEvents = pgTable("incident_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").notNull().references(() => incidents.id),
  actorId: uuid("actor_id").references(() => users.id),
  type: eventTypeEnum("type").notNull(),
  payload: jsonb("payload"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  refreshHash: text("refresh_hash").notNull(),
  prevRefreshHash: text("prev_refresh_hash"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginNonces = pgTable("login_nonces", {
  nonce: text("nonce").primaryKey(),
  telegramUserId: text("telegram_user_id"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Примечание: гео хранится как `*_e6` (целое = градусы × 1e6) — избегаем float-погрешностей, удобно индексировать. Конверсия в/из `Geo` — в сервисном слое (Task 7).

- [ ] **Step 2: Создать `packages/server/src/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(databaseUrl: string): { db: Db; sql: ReturnType<typeof postgres> } {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}
```

- [ ] **Step 3: Создать `packages/server/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 4: Сгенерировать миграцию**

Run: `pnpm --filter @village/server db:generate`
Expected: появляется `packages/server/drizzle/0000_*.sql` с CREATE TABLE для всех таблиц.

- [ ] **Step 5: Проверить компиляцию**

Run: `pnpm --filter @village/server typecheck`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db packages/server/drizzle.config.ts packages/server/drizzle
git commit -m "feat(server): Drizzle-схема БД + первая миграция"
```

---

## Task 5: Миграции на старте + testcontainers-фикстура

**Files:**
- Create: `packages/server/src/db/migrate.ts`
- Create: `packages/server/test/helpers/pg.ts`
- Create: `packages/server/test/helpers/factories.ts`
- Test: `packages/server/test/db/migrate.test.ts`

- [ ] **Step 1: Создать `packages/server/src/db/migrate.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: join(here, "..", "..", "drizzle") });
  await sql.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  await runMigrations(url);
  console.log("migrations applied");
}
```

- [ ] **Step 2: Создать `packages/server/test/helpers/pg.ts`**

```ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "testcontainers";
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
```

- [ ] **Step 3: Создать `packages/server/test/helpers/factories.ts`**

```ts
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
```

- [ ] **Step 4: Написать тест `packages/server/test/db/migrate.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("migrations", () => {
  it("создают таблицы и позволяют вставку user+house", async () => {
    const u = await makeUser(pg.db, { role: "commander" });
    expect(u.role).toBe("commander");
  });
  it("incidents-таблица существует", async () => {
    const r = await pg.db.execute(sql`select count(*)::int as n from incidents`);
    expect(r[0]).toMatchObject({ n: 0 });
  });
});
```

- [ ] **Step 5: Запустить тест — должен пройти (Docker должен быть запущен)**

Run: `pnpm --filter @village/server test migrate`
Expected: PASS. Если Docker не запущен — поднять Docker Desktop.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/migrate.ts packages/server/test/helpers packages/server/test/db
git commit -m "test(server): testcontainers PostgreSQL + миграции на старте"
```

---

## Task 6: Жизненный цикл инцидента (чистая функция)

**Files:**
- Create: `packages/server/src/domain/lifecycle.ts`
- Test: `packages/server/test/domain/lifecycle.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/domain/lifecycle.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { transition, type IncidentState } from "../../src/domain/lifecycle.js";

const base: IncidentState = {
  level: "offence", status: "delivered", visibility: "private", closeReason: null,
};

describe("transition", () => {
  it("emergency при создании сразу public", () => {
    const r = transition({ ...base, level: "emergency", status: "draft" }, { type: "deliver" });
    expect(r.status).toBe("delivered");
    expect(r.visibility).toBe("public");
  });
  it("offence при доставке остаётся private", () => {
    const r = transition({ ...base, status: "draft" }, { type: "deliver" });
    expect(r.status).toBe("delivered");
    expect(r.visibility).toBe("private");
  });
  it("accept делает любой уровень public", () => {
    const r = transition(base, { type: "accept" });
    expect(r.status).toBe("accepted");
    expect(r.visibility).toBe("public");
  });
  it("close с reason=false оставляет visibility private", () => {
    const r = transition(base, { type: "close", reason: "false" });
    expect(r.status).toBe("closed");
    expect(r.visibility).toBe("private");
    expect(r.closeReason).toBe("false");
  });
  it("close из accepted сохраняет visibility public", () => {
    const accepted = transition(base, { type: "accept" });
    const r = transition(accepted, { type: "close", reason: "resolved" });
    expect(r.status).toBe("closed");
    expect(r.visibility).toBe("public");
  });
  it("нельзя accept уже closed", () => {
    const closed = transition(base, { type: "close", reason: "duplicate" });
    expect(() => transition(closed, { type: "accept" })).toThrow();
  });
  it("нельзя comment-переход через transition (не наш case) — accept из accepted запрещён", () => {
    const accepted = transition(base, { type: "accept" });
    expect(() => transition(accepted, { type: "accept" })).toThrow();
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test lifecycle`
Expected: FAIL — `../../src/domain/lifecycle.js` не найден.

- [ ] **Step 3: Создать `packages/server/src/domain/lifecycle.ts`**

```ts
import type {
  IncidentLevel, IncidentStatus, Visibility, CloseReason,
} from "@village/shared";

export interface IncidentState {
  level: IncidentLevel;
  status: IncidentStatus;
  visibility: Visibility;
  closeReason: CloseReason | null;
}

export type Action =
  | { type: "deliver" }
  | { type: "accept" }
  | { type: "close"; reason: CloseReason };

export class IllegalTransition extends Error {
  constructor(status: IncidentStatus, action: Action["type"]) {
    super(`illegal transition: ${action} from ${status}`);
    this.name = "IllegalTransition";
  }
}

export function transition(state: IncidentState, action: Action): IncidentState {
  switch (action.type) {
    case "deliver": {
      if (state.status !== "draft") throw new IllegalTransition(state.status, "deliver");
      return {
        ...state,
        status: "delivered",
        visibility: state.level === "emergency" ? "public" : "private",
      };
    }
    case "accept": {
      if (state.status !== "delivered") throw new IllegalTransition(state.status, "accept");
      return { ...state, status: "accepted", visibility: "public" };
    }
    case "close": {
      if (state.status !== "delivered" && state.status !== "accepted") {
        throw new IllegalTransition(state.status, "close");
      }
      const keepHidden = action.reason === "false";
      return {
        ...state,
        status: "closed",
        closeReason: action.reason,
        visibility: keepHidden ? "private" : state.visibility,
      };
    }
  }
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test lifecycle`
Expected: PASS — все 7 кейсов зелёные.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/domain/lifecycle.ts packages/server/test/domain/lifecycle.test.ts
git commit -m "feat(server): жизненный цикл инцидента как чистая функция transition()"
```

---

## Task 7: Политики доступа (policy.ts)

**Files:**
- Create: `packages/server/src/domain/policy.ts`
- Test: `packages/server/test/domain/policy.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/domain/policy.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { canView, canAccept, canClose, canComment } from "../../src/domain/policy.js";

const commander = { id: "c1", role: "commander" as const };
const author = { id: "a1", role: "resident" as const };
const other = { id: "o1", role: "resident" as const };

function inc(over: Partial<Parameters<typeof canView>[1]> = {}) {
  return {
    authorId: "a1", level: "offence" as const, status: "delivered" as const,
    visibility: "private" as const, ...over,
  };
}

describe("canView", () => {
  it("public виден всем", () => {
    const i = inc({ visibility: "public" });
    expect(canView(other, i)).toBe(true);
  });
  it("private offence виден автору", () => {
    expect(canView(author, inc())).toBe(true);
  });
  it("private offence виден командиру", () => {
    expect(canView(commander, inc())).toBe(true);
  });
  it("private offence НЕ виден другому жителю", () => {
    expect(canView(other, inc())).toBe(false);
  });
});

describe("canAccept", () => {
  it("только командир и только из delivered", () => {
    expect(canAccept(commander, inc())).toBe(true);
    expect(canAccept(author, inc())).toBe(false);
    expect(canAccept(commander, inc({ status: "accepted" }))).toBe(false);
  });
});

describe("canClose", () => {
  it("командир закрывает из delivered или accepted", () => {
    expect(canClose(commander, inc())).toBe(true);
    expect(canClose(commander, inc({ status: "accepted" }))).toBe(true);
    expect(canClose(commander, inc({ status: "closed" }))).toBe(false);
    expect(canClose(author, inc())).toBe(false);
  });
});

describe("canComment", () => {
  it("любой, кто видит accepted-инцидент", () => {
    const i = inc({ status: "accepted", visibility: "public" });
    expect(canComment(other, i)).toBe(true);
  });
  it("нельзя комментировать closed", () => {
    const i = inc({ status: "closed", visibility: "public" });
    expect(canComment(other, i)).toBe(false);
  });
  it("нельзя комментировать ещё не accepted", () => {
    const i = inc({ status: "delivered", visibility: "private" });
    expect(canComment(author, i)).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test policy`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/domain/policy.ts`**

```ts
import type { IncidentLevel, IncidentStatus, Visibility, Role } from "@village/shared";

export interface Viewer {
  id: string;
  role: Role;
}

export interface IncidentView {
  authorId: string;
  level: IncidentLevel;
  status: IncidentStatus;
  visibility: Visibility;
}

export function canView(viewer: Viewer, i: IncidentView): boolean {
  if (i.visibility === "public") return true;
  if (viewer.role === "commander") return true;
  return viewer.id === i.authorId;
}

export function canAccept(viewer: Viewer, i: IncidentView): boolean {
  return viewer.role === "commander" && i.status === "delivered";
}

export function canClose(viewer: Viewer, i: IncidentView): boolean {
  return viewer.role === "commander" && (i.status === "delivered" || i.status === "accepted");
}

export function canComment(viewer: Viewer, i: IncidentView): boolean {
  return i.status === "accepted" && canView(viewer, i);
}

export function canHideComment(viewer: Viewer): boolean {
  return viewer.role === "commander";
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test policy`
Expected: PASS — все describe зелёные.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/domain/policy.ts packages/server/test/domain/policy.test.ts
git commit -m "feat(server): policy.ts — canView/canAccept/canClose/canComment"
```

---

## Task 8: Сервис инцидентов — создание и выборки

**Files:**
- Create: `packages/server/src/services/incidents.ts`
- Test: `packages/server/test/services/incidents.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/services/incidents.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { createIncident, getIncident, listVisible } from "../../src/services/incidents.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("createIncident", () => {
  it("emergency создаётся public+delivered", async () => {
    const u = await makeUser(pg.db);
    const id = uuidv7();
    const res = await createIncident(pg.db, u.id, {
      id, level: "emergency", text: "Пожар!",
    });
    expect(res.incident.status).toBe("delivered");
    expect(res.incident.visibility).toBe("public");
    expect(res.incident.deliveredAtServer).not.toBeNull();
  });

  it("повторный POST того же UUID идемпотентен", async () => {
    const u = await makeUser(pg.db);
    const id = uuidv7();
    const a = await createIncident(pg.db, u.id, { id, level: "emergency", text: "x" });
    const b = await createIncident(pg.db, u.id, { id, level: "emergency", text: "x" });
    expect(b.incident.id).toBe(a.incident.id);
    const all = await listVisible(pg.db, { id: u.id, role: "resident" });
    expect(all.filter((i) => i.id === id)).toHaveLength(1);
  });

  it("offence создаётся private — другой житель его не видит", async () => {
    const author = await makeUser(pg.db);
    const other = await makeUser(pg.db);
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "offence", text: "шумят" });
    const seenByOther = await listVisible(pg.db, { id: other.id, role: "resident" });
    expect(seenByOther.find((i) => i.id === id)).toBeUndefined();
    const seenByAuthor = await listVisible(pg.db, { id: author.id, role: "resident" });
    expect(seenByAuthor.find((i) => i.id === id)).toBeDefined();
  });

  it("создаёт media-манифест и возвращает заглушки upload (s3Key проставлен)", async () => {
    const u = await makeUser(pg.db);
    const id = uuidv7();
    const res = await createIncident(pg.db, u.id, {
      id, level: "attention", text: "машина",
      media: [{ id: uuidv7(), kind: "photo", mime: "image/webp", bytes: 100 }],
    });
    expect(res.uploads).toHaveLength(1);
    expect(res.uploads[0]!.s3Key).toContain(id);
  });

  it("пишет incident_events: created+delivered", async () => {
    const u = await makeUser(pg.db);
    const id = uuidv7();
    await createIncident(pg.db, u.id, { id, level: "emergency", text: "x" });
    const inc = await getIncident(pg.db, id);
    expect(inc).not.toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test services/incidents`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/services/incidents.ts`**

```ts
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { incidents, incidentMedia, incidentEvents } from "../db/schema.js";
import type { NewIncidentInput, Incident } from "@village/shared";
import { transition, type IncidentState } from "../domain/lifecycle.js";
import type { Viewer } from "../domain/policy.js";

function s3KeyFor(incidentId: string, mediaId: string, kind: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = kind === "photo" ? "webp" : "webm";
  return `incidents/${yyyy}/${mm}/${incidentId}/${mediaId}.${ext}`;
}

interface UploadStub { mediaId: string; s3Key: string; }

function rowToIncident(r: typeof incidents.$inferSelect): Incident {
  return {
    id: r.id,
    authorId: r.authorId,
    level: r.level,
    status: r.status,
    visibility: r.visibility,
    closeReason: r.closeReason,
    text: r.text,
    geo:
      r.geoLat !== null && r.geoLng !== null
        ? {
            lat: r.geoLat / 1e6,
            lng: r.geoLng / 1e6,
            accuracyM: r.geoAccuracyM,
            capturedAt: (r.geoCapturedAt ?? new Date()).toISOString(),
          }
        : null,
    createdAtClient: r.createdAtClient.toISOString(),
    deliveredAtServer: r.deliveredAtServer?.toISOString() ?? null,
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
  };
}

export async function createIncident(
  db: Db,
  authorId: string,
  input: NewIncidentInput,
): Promise<{ incident: Incident; uploads: UploadStub[] }> {
  const existing = await db.query.incidents.findFirst({ where: eq(incidents.id, input.id) });
  if (existing) {
    const uploads = (
      await db.query.incidentMedia.findMany({ where: eq(incidentMedia.incidentId, input.id) })
    ).map((m) => ({ mediaId: m.id, s3Key: m.s3Key }));
    return { incident: rowToIncident(existing), uploads };
  }

  const draft: IncidentState = {
    level: input.level, status: "draft", visibility: "private", closeReason: null,
  };
  const delivered = transition(draft, { type: "deliver" });
  const now = new Date();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(incidents)
      .values({
        id: input.id,
        authorId,
        level: input.level,
        status: delivered.status,
        visibility: delivered.visibility,
        text: input.text ?? null,
        geoLat: input.geo ? Math.round(input.geo.lat * 1e6) : null,
        geoLng: input.geo ? Math.round(input.geo.lng * 1e6) : null,
        geoAccuracyM: input.geo?.accuracyM ?? null,
        geoCapturedAt: input.geo ? new Date(input.geo.capturedAt) : null,
        createdAtClient: now,
        deliveredAtServer: now,
      })
      .returning();

    const uploads: UploadStub[] = [];
    for (const m of input.media ?? []) {
      const s3Key = s3KeyFor(input.id, m.id, m.kind);
      await tx.insert(incidentMedia).values({
        id: m.id, incidentId: input.id, kind: m.kind, s3Key, mime: m.mime, bytes: m.bytes,
      });
      uploads.push({ mediaId: m.id, s3Key });
    }

    await tx.insert(incidentEvents).values([
      { incidentId: input.id, actorId: authorId, type: "created", payload: { level: input.level } },
      { incidentId: input.id, actorId: authorId, type: "delivered", payload: null },
    ]);

    return { incident: rowToIncident(row!), uploads };
  });
}

export async function getIncident(db: Db, id: string): Promise<Incident | null> {
  const r = await db.query.incidents.findFirst({ where: eq(incidents.id, id) });
  return r ? rowToIncident(r) : null;
}

export async function listVisible(db: Db, viewer: Viewer): Promise<Incident[]> {
  const where =
    viewer.role === "commander"
      ? undefined
      : or(eq(incidents.visibility, "public"), eq(incidents.authorId, viewer.id));
  const rows = await db.query.incidents.findMany({
    where, orderBy: [desc(incidents.deliveredAtServer)],
  });
  return rows.map(rowToIncident);
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test services/incidents`
Expected: PASS — все 5 кейсов зелёные.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/incidents.ts packages/server/test/services/incidents.test.ts
git commit -m "feat(server): сервис инцидентов — создание (идемпотентное), выборки по видимости"
```

---

## Task 9: Сервис инцидентов — accept / close / comment

**Files:**
- Modify: `packages/server/src/services/incidents.ts` (добавить функции)
- Test: `packages/server/test/services/incidents-transitions.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/services/incidents-transitions.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { eq } from "drizzle-orm";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import {
  createIncident, acceptIncident, closeIncident, addComment,
} from "../../src/services/incidents.js";
import { incidentEvents, incidentComments } from "../../src/db/schema.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("acceptIncident", () => {
  it("командир принимает offence → public+accepted, событие accepted", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "offence", text: "шум" });
    const r = await acceptIncident(pg.db, cmd, id);
    expect(r.status).toBe("accepted");
    expect(r.visibility).toBe("public");
    const ev = await pg.db.query.incidentEvents.findMany({ where: eq(incidentEvents.incidentId, id) });
    expect(ev.some((e) => e.type === "accepted")).toBe(true);
  });

  it("житель не может принять", async () => {
    const author = await makeUser(pg.db);
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "offence", text: "x" });
    await expect(acceptIncident(pg.db, { id: author.id, role: "resident" }, id)).rejects.toThrow();
  });
});

describe("closeIncident", () => {
  it("close false из delivered делает private", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "attention", text: "ложь" });
    const r = await closeIncident(pg.db, cmd, id, "false");
    expect(r.status).toBe("closed");
    expect(r.visibility).toBe("private");
    expect(r.closeReason).toBe("false");
  });
});

describe("addComment", () => {
  it("в accepted можно, в closed нельзя", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "offence", text: "x" });
    await acceptIncident(pg.db, cmd, id);
    const c = await addComment(pg.db, author, id, "я тоже видел");
    expect(c.text).toBe("я тоже видел");
    const rows = await pg.db.query.incidentComments.findMany({ where: eq(incidentComments.incidentId, id) });
    expect(rows).toHaveLength(1);
    await closeIncident(pg.db, cmd, id, "resolved");
    await expect(addComment(pg.db, author, id, "поздно")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test incidents-transitions`
Expected: FAIL — `acceptIncident`/`closeIncident`/`addComment` не экспортированы.

- [ ] **Step 3: Дополнить `packages/server/src/services/incidents.ts`**

Добавить импорты в начало файла (к существующим):

```ts
import { canAccept, canClose, canComment, type Viewer } from "../domain/policy.js";
import type { CloseReason } from "@village/shared";
import { incidentComments } from "../db/schema.js";
```

(уберите дублирующий импорт `Viewer`, если он уже есть — оставьте один.)

Добавить функции в конец файла:

```ts
async function loadState(db: Db, id: string) {
  const r = await db.query.incidents.findFirst({ where: eq(incidents.id, id) });
  if (!r) throw new Error(`incident ${id} not found`);
  return r;
}

export async function acceptIncident(db: Db, viewer: Viewer, id: string): Promise<Incident> {
  const r = await loadState(db, id);
  if (!canAccept(viewer, r)) throw new Error("forbidden: accept");
  const next = transition(
    { level: r.level, status: r.status, visibility: r.visibility, closeReason: r.closeReason },
    { type: "accept" },
  );
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(incidents)
      .set({ status: next.status, visibility: next.visibility, acceptedAt: now })
      .where(eq(incidents.id, id))
      .returning();
    await tx.insert(incidentEvents).values({
      incidentId: id, actorId: viewer.id, type: "accepted", payload: null,
    });
    return rowToIncident(row!);
  });
}

export async function closeIncident(
  db: Db, viewer: Viewer, id: string, reason: CloseReason,
): Promise<Incident> {
  const r = await loadState(db, id);
  if (!canClose(viewer, r)) throw new Error("forbidden: close");
  const next = transition(
    { level: r.level, status: r.status, visibility: r.visibility, closeReason: r.closeReason },
    { type: "close", reason },
  );
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(incidents)
      .set({
        status: next.status, visibility: next.visibility,
        closeReason: next.closeReason, closedAt: now,
      })
      .where(eq(incidents.id, id))
      .returning();
    await tx.insert(incidentEvents).values({
      incidentId: id, actorId: viewer.id, type: "closed", payload: { reason },
    });
    return rowToIncident(row!);
  });
}

export async function addComment(
  db: Db, viewer: Viewer, id: string, text: string,
): Promise<{ id: string; text: string }> {
  const r = await loadState(db, id);
  if (!canComment(viewer, r)) throw new Error("forbidden: comment");
  return db.transaction(async (tx) => {
    const [c] = await tx
      .insert(incidentComments)
      .values({ incidentId: id, authorId: viewer.id, text })
      .returning();
    await tx.insert(incidentEvents).values({
      incidentId: id, actorId: viewer.id, type: "commented", payload: { commentId: c!.id },
    });
    return { id: c!.id, text: c!.text };
  });
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test incidents-transitions`
Expected: PASS — все describe зелёные.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/incidents.ts packages/server/test/services/incidents-transitions.test.ts
git commit -m "feat(server): accept/close/comment с проверкой политик и записью событий"
```

---

## Task 10: SSE-хаб на Postgres LISTEN/NOTIFY

**Files:**
- Create: `packages/server/src/services/sse.ts`
- Test: `packages/server/test/services/sse.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/services/sse.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { createSseHub } from "../../src/services/sse.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("SseHub", () => {
  it("доставляет notify подписчику", async () => {
    const hub = await createSseHub(pg.url);
    const got: unknown[] = [];
    const unsub = hub.subscribe((e) => got.push(e));
    const id = uuidv7();
    await hub.publish({ type: "incident.delivered", id });
    await new Promise((r) => setTimeout(r, 300));
    expect(got).toContainEqual({ type: "incident.delivered", id });
    unsub();
    await hub.close();
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test services/sse`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/services/sse.ts`**

```ts
import postgres from "postgres";
import { SseEvent } from "@village/shared";

const CHANNEL = "incident_events";

export interface SseHub {
  subscribe: (listener: (e: SseEvent) => void) => () => void;
  publish: (e: SseEvent) => Promise<void>;
  close: () => Promise<void>;
}

export async function createSseHub(databaseUrl: string): Promise<SseHub> {
  const listeners = new Set<(e: SseEvent) => void>();
  const sql = postgres(databaseUrl, { max: 1 });

  await sql.listen(CHANNEL, (payload) => {
    const parsed = SseEvent.safeParse(JSON.parse(payload));
    if (parsed.success) for (const l of listeners) l(parsed.data);
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async publish(e) {
      await sql.notify(CHANNEL, JSON.stringify(e));
    },
    async close() {
      listeners.clear();
      await sql.end();
    },
  };
}
```

Примечание: payload NOTIFY ограничен ~8 КБ — мы шлём только `{type, id}`, клиент тянет полный объект отдельным GET (как в спеке §7).

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test services/sse`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/sse.ts packages/server/test/services/sse.test.ts
git commit -m "feat(server): SSE-хаб поверх Postgres LISTEN/NOTIFY"
```

---

## Task 11: Rate-limit (sliding window на incident_events)

**Files:**
- Create: `packages/server/src/services/ratelimit.ts`
- Test: `packages/server/test/services/ratelimit.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/services/ratelimit.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { createIncident } from "../../src/services/incidents.js";
import { checkIncidentRate } from "../../src/services/ratelimit.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("checkIncidentRate", () => {
  it("разрешает при отсутствии истории", async () => {
    const u = await makeUser(pg.db);
    const r = await checkIncidentRate(pg.db, u.id, "emergency");
    expect(r.allowed).toBe(true);
  });

  it("блокирует 6-й emergency в течение часа", async () => {
    const u = await makeUser(pg.db);
    for (let n = 0; n < 5; n++) {
      await createIncident(pg.db, u.id, { id: uuidv7(), level: "emergency", text: "x" });
    }
    const r = await checkIncidentRate(pg.db, u.id, "emergency");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("emergency");
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test ratelimit`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/services/ratelimit.ts`**

```ts
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { incidents, incidentEvents } from "../db/schema.js";
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
```

Примечание: `incidentEvents` импортирован для будущего комментарий-лимита (фаза доработки); пока считаем по `incidents` — это и есть sliding window по времени создания.

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test ratelimit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/ratelimit.ts packages/server/test/services/ratelimit.test.ts
git commit -m "feat(server): rate-limit инцидентов (5 emergency/час, 20/сутки)"
```

---

## Task 12: Media — pre-signed S3 URL

**Files:**
- Create: `packages/server/src/services/media.ts`
- Test: `packages/server/test/services/media.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/services/media.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createMediaService } from "../../src/services/media.js";

const cfg = {
  endpoint: "https://s3.example.com",
  region: "ru-1",
  bucket: "village-emrg-media",
  accessKey: "ak",
  secretKey: "sk",
};

describe("media service", () => {
  it("presignPut возвращает URL с ключом и хостом бакета", async () => {
    const svc = createMediaService(cfg);
    const url = await svc.presignPut("incidents/2026/06/x/y.webp", "image/webp");
    expect(url).toContain("village-emrg-media");
    expect(url).toContain("X-Amz-Signature");
  });

  it("presignGet возвращает URL на чтение", async () => {
    const svc = createMediaService(cfg);
    const url = await svc.presignGet("incidents/2026/06/x/y.webp");
    expect(url).toContain("X-Amz-Signature");
  });

  it("отвергает слишком большой размер при validatePhotoSize", () => {
    const svc = createMediaService(cfg);
    expect(svc.validatePhotoSize(2_000_000)).toBe(false);
    expect(svc.validatePhotoSize(500_000)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test services/media`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/services/media.ts`**

```ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface MediaConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

const MAX_PHOTO_BYTES = 1_000_000;

export interface MediaService {
  presignPut: (key: string, mime: string) => Promise<string>;
  presignGet: (key: string) => Promise<string>;
  validatePhotoSize: (bytes: number) => boolean;
}

export function createMediaService(cfg: MediaConfig): MediaService {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  });

  return {
    async presignPut(key, mime) {
      const cmd = new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: mime });
      return getSignedUrl(client, cmd, { expiresIn: 900 });
    },
    async presignGet(key) {
      const cmd = new GetObjectCommand({ Bucket: cfg.bucket, Key: key });
      return getSignedUrl(client, cmd, { expiresIn: 3600 });
    },
    validatePhotoSize(bytes) {
      return bytes <= MAX_PHOTO_BYTES;
    },
  };
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test services/media`
Expected: PASS — pre-signed URL содержит подпись и имя бакета.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/media.ts packages/server/test/services/media.test.ts
git commit -m "feat(server): pre-signed S3 PUT/GET для медиа"
```

---

## Task 13: JWT (access + refresh)

**Files:**
- Create: `packages/server/src/auth/jwt.ts`
- Test: `packages/server/test/auth/jwt.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/auth/jwt.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createJwt } from "../../src/auth/jwt.js";

const secret = "x".repeat(64);

describe("jwt", () => {
  it("подписывает и верифицирует access-токен", async () => {
    const j = createJwt(secret);
    const token = await j.signAccess({ sub: "u1", role: "resident" });
    const claims = await j.verifyAccess(token);
    expect(claims.sub).toBe("u1");
    expect(claims.role).toBe("resident");
  });

  it("отвергает подделанный токен", async () => {
    const j = createJwt(secret);
    await expect(j.verifyAccess("not.a.jwt")).rejects.toThrow();
  });

  it("refresh-токен содержит jti", async () => {
    const j = createJwt(secret);
    const { token, jti } = await j.signRefresh("u1");
    const claims = await j.verifyRefresh(token);
    expect(claims.jti).toBe(jti);
    expect(claims.sub).toBe("u1");
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test auth/jwt`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/auth/jwt.ts`**

```ts
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
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test auth/jwt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/jwt.ts packages/server/test/auth/jwt.test.ts
git commit -m "feat(server): JWT access+refresh через jose"
```

---

## Task 14: Сессии с ротацией refresh и reuse-detection

**Files:**
- Create: `packages/server/src/auth/sessions.ts`
- Test: `packages/server/test/auth/sessions.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/auth/sessions.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { createSessionService } from "../../src/auth/sessions.js";
import { sessions } from "../../src/db/schema.js";

let pg: TestPg;
const secret = "x".repeat(64);
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("sessions", () => {
  it("issue выдаёт access+refresh", async () => {
    const u = await makeUser(pg.db);
    const svc = createSessionService(pg.db, secret);
    const pair = await svc.issue(u.id, u.role);
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
  });

  it("rotate выдаёт новый refresh, старый больше не работает", async () => {
    const u = await makeUser(pg.db);
    const svc = createSessionService(pg.db, secret);
    const first = await svc.issue(u.id, u.role);
    const second = await svc.rotate(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(svc.rotate(first.refreshToken)).rejects.toThrow();
  });

  it("повторное использование старого refresh инвалидирует все сессии user", async () => {
    const u = await makeUser(pg.db);
    const svc = createSessionService(pg.db, secret);
    const first = await svc.issue(u.id, u.role);
    const second = await svc.rotate(first.refreshToken);
    await svc.rotate(first.refreshToken).catch(() => {});
    await expect(svc.rotate(second.refreshToken)).rejects.toThrow();
    const rows = await pg.db.query.sessions.findMany({ where: eq(sessions.userId, u.id) });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test auth/sessions`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/auth/sessions.ts`**

```ts
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
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test auth/sessions`
Expected: PASS — все 3 кейса зелёные.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/sessions.ts packages/server/test/auth/sessions.test.ts
git commit -m "feat(server): сессии с ротацией refresh и reuse-detection"
```

---

## Task 15: Регистрация и login-link (сервис, без grammy-IO)

Логику регистрации держим в чистом сервисе, тестируемом без реального Telegram. grammy-обёртка (Task 19) только вызывает эти функции.

**Files:**
- Create: `packages/server/src/auth/registration.ts`
- Test: `packages/server/test/auth/registration.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/auth/registration.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeHouse, makeUser } from "../helpers/factories.js";
import { createRegistrationService } from "../../src/auth/registration.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("registration", () => {
  it("новый telegram_user_id создаёт pending-заявку", async () => {
    const house = await makeHouse(pg.db, "Лесная 1");
    const svc = createRegistrationService(pg.db, { bootstrapCommanderTg: "999" });
    const res = await svc.submit({
      telegramUserId: "111", name: "Пётр", claimedHouseAddress: "Лесная 1", phone: "+700",
    });
    expect(res.kind).toBe("pending");
  });

  it("approve создаёт user, привязанного к дому", async () => {
    const house = await makeHouse(pg.db, "Лесная 2");
    const commander = await makeUser(pg.db, { role: "commander" });
    const svc = createRegistrationService(pg.db, { bootstrapCommanderTg: "999" });
    const sub = await svc.submit({
      telegramUserId: "222", name: "Анна", claimedHouseAddress: "Лесная 2", phone: null,
    });
    const user = await svc.approve(sub.requestId!, commander.id);
    expect(user.role).toBe("resident");
    expect(user.telegramUserId).toBe("222");
  });

  it("bootstrap-командир при submit сразу получает роль commander и user без модерации", async () => {
    await makeHouse(pg.db, "Лесная 3");
    const svc = createRegistrationService(pg.db, { bootstrapCommanderTg: "777" });
    const res = await svc.submit({
      telegramUserId: "777", name: "Командир", claimedHouseAddress: "Лесная 3", phone: null,
    });
    expect(res.kind).toBe("approved");
    expect(res.user?.role).toBe("commander");
  });

  it("уже существующий пользователь при submit получает kind=existing", async () => {
    const house = await makeHouse(pg.db, "Лесная 4");
    const u = await makeUser(pg.db, { tg: "444", houseId: house.id });
    const svc = createRegistrationService(pg.db, { bootstrapCommanderTg: "999" });
    const res = await svc.submit({
      telegramUserId: "444", name: "x", claimedHouseAddress: "Лесная 4", phone: null,
    });
    expect(res.kind).toBe("existing");
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test auth/registration`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/auth/registration.ts`**

```ts
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
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test auth/registration`
Expected: PASS — все 4 кейса зелёные.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/registration.ts packages/server/test/auth/registration.test.ts
git commit -m "feat(server): сервис регистрации + bootstrap-командир"
```

---

## Task 16: Web-push dispatcher

**Files:**
- Create: `packages/server/src/services/push.ts`
- Test: `packages/server/test/services/push.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/services/push.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { computePushTargets } from "../../src/services/push.js";

const sub = { endpoint: "https://x", keys: { p256dh: "a", auth: "b" } };

describe("computePushTargets", () => {
  it("emergency идёт всем с подпиской, плюс командиру", () => {
    const users = [
      { id: "c", role: "commander" as const, pushSubscription: sub, notifyPrefs: { offence: false, attention: false } },
      { id: "r1", role: "resident" as const, pushSubscription: sub, notifyPrefs: { offence: false, attention: false } },
      { id: "r2", role: "resident" as const, pushSubscription: null, notifyPrefs: { offence: false, attention: false } },
    ];
    const t = computePushTargets(users, "emergency");
    expect(t.map((u) => u.id).sort()).toEqual(["c", "r1"]);
  });

  it("offence идёт командиру всегда и жителям с notifyPrefs.offence=true", () => {
    const users = [
      { id: "c", role: "commander" as const, pushSubscription: sub, notifyPrefs: { offence: false, attention: false } },
      { id: "r1", role: "resident" as const, pushSubscription: sub, notifyPrefs: { offence: true, attention: false } },
      { id: "r2", role: "resident" as const, pushSubscription: sub, notifyPrefs: { offence: false, attention: false } },
    ];
    const t = computePushTargets(users, "offence");
    expect(t.map((u) => u.id).sort()).toEqual(["c", "r1"]);
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test services/push`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/services/push.ts`**

```ts
import webpush from "web-push";
import type { IncidentLevel, NotifyPrefs, Role } from "@village/shared";

export interface PushUser {
  id: string;
  role: Role;
  pushSubscription: unknown;
  notifyPrefs: NotifyPrefs;
}

export interface VapidConfig { publicKey: string; privateKey: string; subject: string; }

export function computePushTargets(users: PushUser[], level: IncidentLevel): PushUser[] {
  return users.filter((u) => {
    if (!u.pushSubscription) return false;
    if (u.role === "commander") return true;
    if (level === "emergency") return true;
    if (level === "offence") return u.notifyPrefs.offence;
    return u.notifyPrefs.attention;
  });
}

export function createPushService(cfg: VapidConfig) {
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);

  async function send(user: PushUser, payload: { title: string; body: string; url: string }): Promise<boolean> {
    try {
      await webpush.sendNotification(
        user.pushSubscription as webpush.PushSubscription,
        JSON.stringify(payload),
      );
      return true;
    } catch {
      return false;
    }
  }

  async function broadcast(
    users: PushUser[], level: IncidentLevel,
    payload: { title: string; body: string; url: string },
  ): Promise<number> {
    const targets = computePushTargets(users, level);
    const results = await Promise.all(targets.map((u) => send(u, payload)));
    return results.filter(Boolean).length;
  }

  return { send, broadcast };
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test services/push`
Expected: PASS — оба кейса зелёные.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/push.ts packages/server/test/services/push.test.ts
git commit -m "feat(server): web-push dispatcher + матрица адресатов по уровню"
```

---

## Task 17: HTTP-каркас Hono + auth-middleware + AppContext

**Files:**
- Create: `packages/server/src/http/context.ts` (контейнер зависимостей)
- Create: `packages/server/src/http/middleware.ts`
- Create: `packages/server/src/http/app.ts`
- Test: `packages/server/test/http/health.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/http/health.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, type TestPg } from "../helpers/pg.js";
import { buildTestApp } from "../helpers/app.js";

let pg: TestPg;
let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => { pg = await startPg(); app = await buildTestApp(pg); });
afterAll(async () => { await app.close(); await pg.stop(); });

describe("health", () => {
  it("GET /health → 200 ok", async () => {
    const res = await app.fetch(new Request("http://x/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("защищённый роут без токена → 401", async () => {
    const res = await app.fetch(new Request("http://x/incidents"));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Создать `packages/server/src/http/context.ts`**

```ts
import type { Db } from "../db/client.js";
import type { SseHub } from "../services/sse.js";
import type { MediaService } from "../services/media.js";
import { createSessionService } from "../auth/sessions.js";
import { createRegistrationService } from "../auth/registration.js";
import { createPushService } from "../services/push.js";

export interface AppContext {
  db: Db;
  sse: SseHub;
  media: MediaService;
  sessions: ReturnType<typeof createSessionService>;
  registration: ReturnType<typeof createRegistrationService>;
  push: ReturnType<typeof createPushService>;
  jwtSecret: string;
  publicBaseUrl: string;
}
```

- [ ] **Step 3: Создать `packages/server/src/http/middleware.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import { createJwt } from "../auth/jwt.js";
import type { Role } from "@village/shared";

export interface AuthedVars {
  user: { id: string; role: Role };
}

export function authMiddleware(jwtSecret: string): MiddlewareHandler<{ Variables: AuthedVars }> {
  const jwt = createJwt(jwtSecret);
  return async (c, next) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) return c.json({ error: "unauthorized" }, 401);
    try {
      const claims = await jwt.verifyAccess(header.slice(7));
      c.set("user", { id: claims.sub, role: claims.role });
    } catch {
      return c.json({ error: "invalid token" }, 401);
    }
    return next();
  };
}

export const errorHandler = (err: Error, c: import("hono").Context) => {
  const status = /forbidden/.test(err.message) ? 403
    : /not found/.test(err.message) ? 404
    : /illegal transition/.test(err.message) ? 409
    : 400;
  return c.json({ error: err.message }, status);
};
```

- [ ] **Step 4: Создать `packages/server/src/http/app.ts`**

```ts
import { Hono } from "hono";
import type { AppContext } from "./context.js";
import { authMiddleware, errorHandler, type AuthedVars } from "./middleware.js";
import { incidentsRoutes } from "./routes/incidents.js";
import { registrationsRoutes } from "./routes/registrations.js";
import { mediaRoutes } from "./routes/media.js";
import { eventsRoutes } from "./routes/events.js";
import { authRoutes } from "./routes/auth.js";

export function buildApp(ctx: AppContext): Hono<{ Variables: AuthedVars }> {
  const app = new Hono<{ Variables: AuthedVars }>();
  app.onError(errorHandler);

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/auth", authRoutes(ctx));

  const protectedApp = new Hono<{ Variables: AuthedVars }>();
  protectedApp.use("*", authMiddleware(ctx.jwtSecret));
  protectedApp.route("/incidents", incidentsRoutes(ctx));
  protectedApp.route("/registrations", registrationsRoutes(ctx));
  protectedApp.route("/incidents", mediaRoutes(ctx));
  protectedApp.route("/events", eventsRoutes(ctx));
  app.route("/", protectedApp);

  return app;
}
```

- [ ] **Step 5: Создать тест-хелпер `packages/server/test/helpers/app.ts`**

```ts
import type { TestPg } from "./pg.js";
import { buildApp } from "../../src/http/app.js";
import { createSseHub } from "../../src/services/sse.js";
import { createSessionService } from "../../src/auth/sessions.js";
import { createRegistrationService } from "../../src/auth/registration.js";
import { createPushService } from "../../src/services/push.js";
import { createMediaService } from "../../src/services/media.js";

const SECRET = "x".repeat(64);

export async function buildTestApp(pg: TestPg) {
  const sse = await createSseHub(pg.url);
  const ctx = {
    db: pg.db,
    sse,
    media: createMediaService({
      endpoint: "https://s3.example.com", region: "ru-1", bucket: "test",
      accessKey: "ak", secretKey: "sk",
    }),
    sessions: createSessionService(pg.db, SECRET),
    registration: createRegistrationService(pg.db, { bootstrapCommanderTg: "999" }),
    push: createPushService({ publicKey: "BPpub", privateKey: "priv", subject: "mailto:a@b.c" }),
    jwtSecret: SECRET,
    publicBaseUrl: "http://localhost:5173",
  };
  const app = buildApp(ctx);
  return {
    fetch: (req: Request) => app.fetch(req),
    ctx,
    secret: SECRET,
    close: async () => { await sse.close(); },
  };
}
```

Примечание: VAPID-ключи в тесте — заглушки; `createPushService` не шлёт реальных пушей в integration-тестах (роуты не вызывают broadcast без подписок).

- [ ] **Step 6: Запустить тест — должен упасть/собраться постепенно**

Run: `pnpm --filter @village/server test http/health`
Expected: FAIL — роуты `./routes/*` ещё не существуют. Это нормально: создаём их в Tasks 18-19. Сейчас зафиксируем заглушки роутов, чтобы health-тест прошёл.

- [ ] **Step 7: Создать пустые заглушки роутов, чтобы app собрался**

Создать `packages/server/src/http/routes/incidents.ts`, `registrations.ts`, `media.ts`, `events.ts`, `auth.ts`, каждый временно:

```ts
import { Hono } from "hono";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";

export function incidentsRoutes(_ctx: AppContext) {
  return new Hono<{ Variables: AuthedVars }>();
}
```

(для остальных — то же с именами `registrationsRoutes`, `mediaRoutes`, `eventsRoutes`, `authRoutes`; `authRoutes` не использует `AuthedVars`-middleware, но тип оставить тем же для единообразия.)

- [ ] **Step 8: Запустить health-тест — должен пройти**

Run: `pnpm --filter @village/server test http/health`
Expected: PASS — `/health` 200, `/incidents` без токена 401.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/http packages/server/test/helpers/app.ts packages/server/test/http/health.test.ts
git commit -m "feat(server): Hono-каркас, auth-middleware, error-handler, заглушки роутов"
```

---

## Task 18: Роуты инцидентов (CRUD + переходы + комментарии)

**Files:**
- Modify: `packages/server/src/http/routes/incidents.ts`
- Modify: `packages/server/test/helpers/app.ts` (добавить хелпер `authHeader`)
- Test: `packages/server/test/http/incidents.test.ts`

- [ ] **Step 1: Добавить хелпер выдачи токена в `packages/server/test/helpers/app.ts`**

В конец файла:

```ts
export async function authHeaderFor(
  appBundle: Awaited<ReturnType<typeof buildTestApp>>,
  userId: string,
  role: "resident" | "commander",
): Promise<Record<string, string>> {
  const pair = await appBundle.ctx.sessions.issue(userId, role);
  return { authorization: `Bearer ${pair.accessToken}` };
}
```

- [ ] **Step 2: Написать падающий тест `packages/server/test/http/incidents.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { buildTestApp, authHeaderFor } from "../helpers/app.js";

let pg: TestPg;
let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => { pg = await startPg(); app = await buildTestApp(pg); });
afterAll(async () => { await app.close(); await pg.stop(); });

function post(path: string, headers: Record<string, string>, body: unknown) {
  return app.fetch(new Request(`http://x${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }));
}

describe("POST /incidents", () => {
  it("создаёт emergency и возвращает incident+uploads", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    const res = await post("/incidents", h, { id: uuidv7(), level: "emergency", text: "Пожар" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.incident.visibility).toBe("public");
    expect(Array.isArray(body.uploads)).toBe(true);
  });

  it("отвергает attention без текста/медиа/гео → 400", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    const res = await post("/incidents", h, { id: uuidv7(), level: "attention" });
    expect(res.status).toBe(400);
  });

  it("rate-limit: 6-й emergency → 429", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    for (let n = 0; n < 5; n++) {
      await post("/incidents", h, { id: uuidv7(), level: "emergency", text: "x" });
    }
    const res = await post("/incidents", h, { id: uuidv7(), level: "emergency", text: "x" });
    expect(res.status).toBe(429);
  });
});

describe("incident transitions", () => {
  it("командир accept → 200 accepted; житель accept → 403", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await post("/incidents", await authHeaderFor(app, author.id, "resident"), { id, level: "offence", text: "шум" });

    const forbidden = await post(`/incidents/${id}/accept`, await authHeaderFor(app, author.id, "resident"), {});
    expect(forbidden.status).toBe(403);

    const ok = await post(`/incidents/${id}/accept`, await authHeaderFor(app, cmd.id, "commander"), {});
    expect(ok.status).toBe(200);
    expect((await ok.json()).status).toBe("accepted");
  });

  it("close false → 200, инцидент исчезает из ленты другого жителя", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const other = await makeUser(pg.db);
    const id = uuidv7();
    await post("/incidents", await authHeaderFor(app, author.id, "resident"), { id, level: "attention", text: "ложь" });
    await post(`/incidents/${id}/close`, await authHeaderFor(app, cmd.id, "commander"), { reason: "false" });

    const list = await app.fetch(new Request("http://x/incidents", {
      headers: await authHeaderFor(app, other.id, "resident"),
    }));
    const items = await list.json();
    expect(items.find((i: { id: string }) => i.id === id)).toBeUndefined();
  });

  it("комментарий в accepted → 201, в closed → 403", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await post("/incidents", await authHeaderFor(app, author.id, "resident"), { id, level: "offence", text: "x" });
    await post(`/incidents/${id}/accept`, await authHeaderFor(app, cmd.id, "commander"), {});
    const ok = await post(`/incidents/${id}/comments`, await authHeaderFor(app, author.id, "resident"), { text: "видел" });
    expect(ok.status).toBe(201);
    await post(`/incidents/${id}/close`, await authHeaderFor(app, cmd.id, "commander"), { reason: "resolved" });
    const late = await post(`/incidents/${id}/comments`, await authHeaderFor(app, author.id, "resident"), { text: "поздно" });
    expect(late.status).toBe(403);
  });
});
```

- [ ] **Step 3: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test http/incidents`
Expected: FAIL — роуты пока заглушки (404/нет хендлеров).

- [ ] **Step 4: Реализовать `packages/server/src/http/routes/incidents.ts`**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { NewIncidentInput, CloseIncidentInput, CommentInput } from "@village/shared";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";
import {
  createIncident, listVisible, getIncident,
  acceptIncident, closeIncident, addComment,
} from "../../services/incidents.js";
import { checkIncidentRate } from "../../services/ratelimit.js";
import { canView } from "../../domain/policy.js";

export function incidentsRoutes(ctx: AppContext) {
  const app = new Hono<{ Variables: AuthedVars }>();

  app.get("/", async (c) => {
    const user = c.get("user");
    return c.json(await listVisible(ctx.db, user));
  });

  app.get("/:id", async (c) => {
    const user = c.get("user");
    const inc = await getIncident(ctx.db, c.req.param("id"));
    if (!inc) return c.json({ error: "not found" }, 404);
    if (!canView(user, inc)) return c.json({ error: "forbidden" }, 403);
    return c.json(inc);
  });

  app.post("/", zValidator("json", NewIncidentInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const rate = await checkIncidentRate(ctx.db, user.id, input.level);
    if (!rate.allowed) return c.json({ error: rate.reason }, 429);

    const res = await createIncident(ctx.db, user.id, input);
    const uploads = await Promise.all(
      res.uploads.map(async (u) => ({
        mediaId: u.mediaId,
        s3Key: u.s3Key,
        url: await ctx.media.presignPut(u.s3Key, "application/octet-stream"),
      })),
    );
    await ctx.sse.publish({ type: "incident.delivered", id: res.incident.id });
    return c.json({ incident: res.incident, uploads }, 201);
  });

  app.post("/:id/accept", async (c) => {
    const user = c.get("user");
    const inc = await acceptIncident(ctx.db, user, c.req.param("id"));
    await ctx.sse.publish({ type: "incident.accepted", id: inc.id });
    return c.json(inc);
  });

  app.post("/:id/close", zValidator("json", CloseIncidentInput), async (c) => {
    const user = c.get("user");
    const { reason } = c.req.valid("json");
    const inc = await closeIncident(ctx.db, user, c.req.param("id"), reason);
    await ctx.sse.publish({ type: "incident.closed", id: inc.id });
    return c.json(inc);
  });

  app.post("/:id/comments", zValidator("json", CommentInput), async (c) => {
    const user = c.get("user");
    const { text } = c.req.valid("json");
    const comment = await addComment(ctx.db, user, c.req.param("id"), text);
    await ctx.sse.publish({ type: "incident.commented", id: c.req.param("id") });
    return c.json(comment, 201);
  });

  return app;
}
```

- [ ] **Step 5: Добавить зависимость `@hono/zod-validator`**

Run: `pnpm --filter @village/server add @hono/zod-validator`
Expected: пакет добавлен в dependencies.

- [ ] **Step 6: Запустить тест — должен пройти**

Run: `pnpm --filter @village/server test http/incidents`
Expected: PASS — все describe зелёные (создание, валидация, rate-limit, переходы, комментарии).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/http/routes/incidents.ts packages/server/test/http/incidents.test.ts packages/server/test/helpers/app.ts packages/server/package.json pnpm-lock.yaml
git commit -m "feat(server): роуты инцидентов — CRUD, переходы, комментарии, rate-limit, SSE-publish"
```

---

## Task 19: Роуты registrations, media, events (SSE), auth

**Files:**
- Modify: `packages/server/src/http/routes/registrations.ts`
- Modify: `packages/server/src/http/routes/media.ts`
- Modify: `packages/server/src/http/routes/events.ts`
- Modify: `packages/server/src/http/routes/auth.ts`
- Test: `packages/server/test/http/registrations.test.ts`
- Test: `packages/server/test/http/media.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/http/registrations.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeHouse, makeUser } from "../helpers/factories.js";
import { buildTestApp, authHeaderFor } from "../helpers/app.js";
import { eq } from "drizzle-orm";
import { registrationRequests } from "../../src/db/schema.js";

let pg: TestPg;
let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => { pg = await startPg(); app = await buildTestApp(pg); });
afterAll(async () => { await app.close(); await pg.stop(); });

describe("registrations moderation", () => {
  it("командир видит pending и одобряет", async () => {
    await makeHouse(pg.db, "Полевая 1");
    await app.ctx.registration.submit({
      telegramUserId: "5551", name: "Сидор", claimedHouseAddress: "Полевая 1", phone: null,
    });
    const cmd = await makeUser(pg.db, { role: "commander" });
    const h = await authHeaderFor(app, cmd.id, "commander");

    const list = await app.fetch(new Request("http://x/registrations", { headers: h }));
    expect(list.status).toBe(200);
    const items = await list.json();
    const req = items.find((r: { telegramUserId: string }) => r.telegramUserId === "5551");
    expect(req).toBeDefined();

    const approve = await app.fetch(new Request(`http://x/registrations/${req.id}/approve`, {
      method: "POST", headers: h,
    }));
    expect(approve.status).toBe(200);

    const row = await pg.db.query.registrationRequests.findFirst({
      where: eq(registrationRequests.id, req.id),
    });
    expect(row?.status).toBe("approved");
  });

  it("житель не имеет доступа к /registrations → 403", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    const res = await app.fetch(new Request("http://x/registrations", { headers: h }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Реализовать `packages/server/src/http/routes/registrations.ts`**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";
import { registrationRequests } from "../../db/schema.js";

export function registrationsRoutes(ctx: AppContext) {
  const app = new Hono<{ Variables: AuthedVars }>();

  app.use("*", async (c, next) => {
    if (c.get("user").role !== "commander") return c.json({ error: "forbidden" }, 403);
    return next();
  });

  app.get("/", async (c) => {
    const rows = await ctx.db.query.registrationRequests.findMany({
      where: eq(registrationRequests.status, "pending"),
    });
    return c.json(rows);
  });

  app.post("/:id/approve", async (c) => {
    const user = await ctx.registration.approve(c.req.param("id"), c.get("user").id);
    return c.json({ ok: true, userId: user.id });
  });

  app.post("/:id/reject", async (c) => {
    await ctx.registration.reject(c.req.param("id"), c.get("user").id);
    return c.json({ ok: true });
  });

  return app;
}
```

- [ ] **Step 3: Написать падающий тест `packages/server/test/http/media.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { buildTestApp, authHeaderFor } from "../helpers/app.js";

let pg: TestPg;
let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => { pg = await startPg(); app = await buildTestApp(pg); });
afterAll(async () => { await app.close(); await pg.stop(); });

describe("PATCH media uploaded", () => {
  it("автор помечает медиа uploaded", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    const incidentId = uuidv7();
    const mediaId = uuidv7();
    await app.fetch(new Request("http://x/incidents", {
      method: "POST", headers: { "content-type": "application/json", ...h },
      body: JSON.stringify({
        id: incidentId, level: "attention", text: "фото",
        media: [{ id: mediaId, kind: "photo", mime: "image/webp", bytes: 5000 }],
      }),
    }));

    const res = await app.fetch(new Request(`http://x/incidents/${incidentId}/media/${mediaId}`, {
      method: "PATCH", headers: { "content-type": "application/json", ...h },
      body: JSON.stringify({ uploaded: true }),
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).uploadStatus).toBe("uploaded");
  });
});
```

- [ ] **Step 4: Реализовать `packages/server/src/http/routes/media.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";
import { incidentMedia, incidents } from "../../db/schema.js";

const PatchBody = z.object({ uploaded: z.literal(true) });

export function mediaRoutes(ctx: AppContext) {
  const app = new Hono<{ Variables: AuthedVars }>();

  app.patch("/:id/media/:mediaId", zValidator("json", PatchBody), async (c) => {
    const user = c.get("user");
    const incidentId = c.req.param("id");
    const mediaId = c.req.param("mediaId");

    const inc = await ctx.db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) });
    if (!inc) return c.json({ error: "not found" }, 404);
    if (inc.authorId !== user.id) return c.json({ error: "forbidden" }, 403);

    const [row] = await ctx.db
      .update(incidentMedia)
      .set({ uploadStatus: "uploaded" })
      .where(and(eq(incidentMedia.id, mediaId), eq(incidentMedia.incidentId, incidentId)))
      .returning();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ uploadStatus: row.uploadStatus });
  });

  return app;
}
```

- [ ] **Step 5: Реализовать `packages/server/src/http/routes/events.ts` (SSE)**

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";

export function eventsRoutes(ctx: AppContext) {
  const app = new Hono<{ Variables: AuthedVars }>();

  app.get("/", (c) =>
    streamSSE(c, async (stream) => {
      const queue: string[] = [];
      const unsub = ctx.sse.subscribe((e) => queue.push(JSON.stringify(e)));
      try {
        while (!stream.closed) {
          while (queue.length) await stream.writeSSE({ data: queue.shift()! });
          await stream.sleep(500);
        }
      } finally {
        unsub();
      }
    }),
  );

  return app;
}
```

Примечание: фильтрация по видимости делается на клиенте через повторный GET `/incidents/:id` (он вернёт 403, если нельзя) — сам сигнал `{type,id}` не раскрывает содержимое.

- [ ] **Step 6: Реализовать `packages/server/src/http/routes/auth.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { loginNonces, users } from "../../db/schema.js";

const ExchangeBody = z.object({ token: z.string().min(1) });
const RefreshBody = z.object({ refreshToken: z.string().min(1) });

export function authRoutes(ctx: AppContext) {
  const app = new Hono();

  app.post("/tg/exchange", zValidator("json", ExchangeBody), async (c) => {
    const { token } = c.req.valid("json");
    const nonce = await ctx.db.query.loginNonces.findFirst({ where: eq(loginNonces.nonce, token) });
    if (!nonce || nonce.usedAt || nonce.expiresAt < new Date() || !nonce.telegramUserId) {
      return c.json({ error: "invalid or expired token" }, 401);
    }
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.telegramUserId, nonce.telegramUserId),
    });
    if (!user) return c.json({ error: "user not found" }, 404);

    await ctx.db.update(loginNonces).set({ usedAt: new Date() }).where(eq(loginNonces.nonce, token));
    const pair = await ctx.sessions.issue(user.id, user.role);
    return c.json({ ...pair, user: { id: user.id, name: user.name, role: user.role } });
  });

  app.post("/refresh", zValidator("json", RefreshBody), async (c) => {
    try {
      const pair = await ctx.sessions.rotate(c.req.valid("json").refreshToken);
      return c.json(pair);
    } catch {
      return c.json({ error: "invalid refresh" }, 401);
    }
  });

  return app;
}
```

- [ ] **Step 7: Запустить тесты — должны пройти**

Run: `pnpm --filter @village/server test http/registrations http/media`
Expected: PASS — модерация (одобрение + 403 жителю), media PATCH uploaded.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/http/routes packages/server/test/http/registrations.test.ts packages/server/test/http/media.test.ts
git commit -m "feat(server): роуты модерации, media-uploaded, SSE-стрим, telegram-exchange + refresh"
```

---

## Task 20: Telegram-бот (grammy) + выдача login-nonce

Бот — тонкая обёртка над сервисом регистрации (Task 15) и таблицей `login_nonces`. Тестируем логику генерации nonce без реального Telegram; grammy-handlers собираем, но их сетевой запуск проверяется вручную в staging (см. спек §11).

**Files:**
- Create: `packages/server/src/auth/telegram.ts`
- Test: `packages/server/test/auth/telegram.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/server/test/auth/telegram.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { issueLoginNonce, consumableNonceExists } from "../../src/auth/telegram.js";
import { loginNonces } from "../../src/db/schema.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("login nonce", () => {
  it("issueLoginNonce создаёт nonce, привязанный к telegram_user_id", async () => {
    const u = await makeUser(pg.db, { tg: "9001" });
    const nonce = await issueLoginNonce(pg.db, "9001");
    expect(nonce).toBeTruthy();
    const row = await pg.db.query.loginNonces.findFirst({ where: eq(loginNonces.nonce, nonce) });
    expect(row?.telegramUserId).toBe("9001");
    expect(row?.usedAt).toBeNull();
  });

  it("consumableNonceExists true для свежего, false для просроченного", async () => {
    const nonce = await issueLoginNonce(pg.db, "9002");
    expect(await consumableNonceExists(pg.db, nonce)).toBe(true);
    expect(await consumableNonceExists(pg.db, "no-such")).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pnpm --filter @village/server test auth/telegram`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `packages/server/src/auth/telegram.ts`**

```ts
import { Bot, InlineKeyboard } from "grammy";
import { uuidv7 } from "uuidv7";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { houses, loginNonces } from "../db/schema.js";
import { createRegistrationService } from "./registration.js";

const NONCE_TTL_MS = 15 * 60 * 1000;

export async function issueLoginNonce(db: Db, telegramUserId: string): Promise<string> {
  const nonce = uuidv7();
  await db.insert(loginNonces).values({
    nonce, telegramUserId, expiresAt: new Date(Date.now() + NONCE_TTL_MS),
  });
  return nonce;
}

export async function consumableNonceExists(db: Db, nonce: string): Promise<boolean> {
  const row = await db.query.loginNonces.findFirst({ where: eq(loginNonces.nonce, nonce) });
  return Boolean(row && !row.usedAt && row.expiresAt > new Date());
}

export interface BotDeps {
  db: Db;
  token: string;
  publicBaseUrl: string;
  bootstrapCommanderTg: string;
  notifyCommander: (text: string) => Promise<void>;
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token);
  const registration = createRegistrationService(deps.db, {
    bootstrapCommanderTg: deps.bootstrapCommanderTg,
  });

  bot.command("start", async (ctx) => {
    const tgId = String(ctx.from?.id ?? "");
    const existing = await deps.db.query.users.findFirst({
      where: (u, { eq: e }) => e(u.telegramUserId, tgId),
    });
    if (existing) {
      const nonce = await issueLoginNonce(deps.db, tgId);
      await ctx.reply(`Войти: ${deps.publicBaseUrl}/auth/tg?token=${nonce}`);
      return;
    }
    const allHouses = await deps.db.query.houses.findMany();
    const kb = new InlineKeyboard();
    for (const h of allHouses) kb.text(h.address, `house:${h.address}`).row();
    await ctx.reply("Регистрация. Выберите ваш дом:", { reply_markup: kb });
  });

  bot.callbackQuery(/^house:(.+)$/, async (ctx) => {
    const address = ctx.match[1]!;
    const tgId = String(ctx.from.id);
    const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "Житель";
    const res = await registration.submit({
      telegramUserId: tgId, name, claimedHouseAddress: address, phone: null,
    });
    if (res.kind === "approved") {
      const nonce = await issueLoginNonce(deps.db, tgId);
      await ctx.reply(`Вы командир. Войти: ${deps.publicBaseUrl}/auth/tg?token=${nonce}`);
    } else if (res.kind === "existing") {
      const nonce = await issueLoginNonce(deps.db, tgId);
      await ctx.reply(`Вы уже зарегистрированы. Войти: ${deps.publicBaseUrl}/auth/tg?token=${nonce}`);
    } else {
      await deps.notifyCommander(`Заявка на регистрацию: ${name}, ${address}`);
      await ctx.reply("Заявка отправлена командиру. Ожидайте одобрения.");
    }
    await ctx.answerCallbackQuery();
  });

  return bot;
}
```

- [ ] **Step 4: Установить зависимости (grammy уже в Task 3) и запустить тест**

Run: `pnpm --filter @village/server test auth/telegram`
Expected: PASS — оба кейса про nonce зелёные.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/telegram.ts packages/server/test/auth/telegram.test.ts
git commit -m "feat(server): grammy-бот регистрации + выдача login-nonce"
```

---

## Task 21: Bootstrap, seed домов, Docker, финальная проверка

**Files:**
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/seed-houses.ts`
- Create: `Dockerfile`, `docker-compose.yml`, `Caddyfile`
- Create: `data/houses.example.csv`

- [ ] **Step 1: Создать `packages/server/src/index.ts`**

```ts
import { serve } from "@hono/node-server";
import { parseEnv } from "./env.js";
import { runMigrations } from "./db/migrate.js";
import { createDb } from "./db/client.js";
import { createSseHub } from "./services/sse.js";
import { createMediaService } from "./services/media.js";
import { createSessionService } from "./auth/sessions.js";
import { createRegistrationService } from "./auth/registration.js";
import { createPushService } from "./services/push.js";
import { createBot } from "./auth/telegram.js";
import { buildApp } from "./http/app.js";

const env = parseEnv();
await runMigrations(env.DATABASE_URL);

const { db } = createDb(env.DATABASE_URL);
const sse = await createSseHub(env.DATABASE_URL);

const bot = createBot({
  db,
  token: env.TG_BOT_TOKEN,
  publicBaseUrl: env.PUBLIC_BASE_URL,
  bootstrapCommanderTg: env.BOOTSTRAP_COMMANDER_TG,
  notifyCommander: async (text) => {
    const commander = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.role, "commander"),
    });
    if (commander) await bot.api.sendMessage(Number(commander.telegramUserId), text);
  },
});

const ctx = {
  db, sse,
  media: createMediaService({
    endpoint: env.S3_ENDPOINT, region: env.S3_REGION, bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY, secretKey: env.S3_SECRET_KEY,
  }),
  sessions: createSessionService(db, env.JWT_SECRET),
  registration: createRegistrationService(db, { bootstrapCommanderTg: env.BOOTSTRAP_COMMANDER_TG }),
  push: createPushService({
    publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE, subject: env.VAPID_SUBJECT,
  }),
  jwtSecret: env.JWT_SECRET,
  publicBaseUrl: env.PUBLIC_BASE_URL,
};

const app = buildApp(ctx);

void bot.start();
serve({ fetch: app.fetch, port: env.PORT });
console.log(`village-emrg server on :${env.PORT}`);
```

- [ ] **Step 2: Создать `packages/server/src/seed-houses.ts`**

```ts
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
```

Добавить в `packages/server/package.json` скрипт:

```json
"seed:houses": "tsx src/seed-houses.ts"
```

- [ ] **Step 3: Создать `data/houses.example.csv`**

```
Лесная 1
Лесная 2
Полевая 1
Полевая 2
```

- [ ] **Step 4: Создать `Dockerfile`**

```dockerfile
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @village/shared build && pnpm --filter @village/server build

FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/server/dist packages/server/dist/
COPY --from=build /app/packages/server/drizzle packages/server/drizzle/
RUN pnpm install --frozen-lockfile --prod
WORKDIR /app/packages/server
CMD ["node", "dist/index.js"]
```

Примечание: `@village/shared` main/types в проде должны указывать на `dist/index.js` — для прод-сборки добавьте в `packages/shared/package.json` поля `"exports"` с условием на `dist`. В dev TS-резолвер берёт `src`. Если упрётесь — простейший вариант: в обоих package.json указать `"main": "dist/index.js"` и всегда вызывать `build` перед стартом (уже в Dockerfile).

- [ ] **Step 5: Создать `Caddyfile`**

```
{$DOMAIN} {
    reverse_proxy app:8787
}
```

- [ ] **Step 6: Создать `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    env_file: .env
    restart: unless-stopped
    expose:
      - "8787"
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN: ${DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app

volumes:
  caddy_data:
  caddy_config:
```

Примечание: PostgreSQL — managed на Selectel (не в compose). `DATABASE_URL` в `.env` указывает на managed-инстанс по приватной сети. `DOMAIN` добавить в `.env`.

- [ ] **Step 7: Прогнать весь тест-сьют и typecheck**

Run: `pnpm -r typecheck && pnpm --filter @village/server test`
Expected: PASS — все unit+integration зелёные, типы без ошибок.

- [ ] **Step 8: Проверить production-сборку Docker-образа**

Run: `docker build -t village-emrg:dev .`
Expected: образ собирается без ошибок (multi-stage build проходит).

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/index.ts packages/server/src/seed-houses.ts packages/server/package.json data/houses.example.csv Dockerfile docker-compose.yml Caddyfile
git commit -m "feat(server): bootstrap, seed домов, Docker+Caddy для деплоя на Selectel"
```

---

## Финальная проверка плана (для исполнителя)

После Task 21 backend готов: REST API под auth, жизненный цикл инцидентов, SSE, push-матрица, pre-signed media, Telegram-регистрация, Docker-сборка. Всё под integration-тестами на реальном PostgreSQL.

Не покрыто в Plan 1 (уходит в Plan 2 — PWA + Deploy):
- фронт PWA (React, Service Worker, IndexedDB-очередь, Background Sync);
- клиентская компрессия фото в WebP, MapLibre-карта;
- реальная проверка iOS web-push после A2HS;
- CI/CD pipeline, бэкап-cron, health-мониторинг;
- наполнение `notify_prefs` через UI настроек;
- санитизация/рендер markdown текста инцидентов и комментариев (спек §10) — на стороне рендера во фронте (React по умолчанию экранирует; markdown-whitelist при выводе); backend хранит сырой текст.
