import webpush from "web-push";
import type { TestPg } from "./pg.js";
import { buildApp } from "../../src/http/app.js";
import { createSseHub } from "../../src/services/sse.js";
import { createSessionService } from "../../src/auth/sessions.js";
import { createRegistrationService } from "../../src/auth/registration.js";
import { createPushService } from "../../src/services/push.js";
import { createMediaService } from "../../src/services/media.js";

const SECRET = "x".repeat(64);
const VAPID = webpush.generateVAPIDKeys();

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
    push: createPushService({ publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: "mailto:a@b.c" }),
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
