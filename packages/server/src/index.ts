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
