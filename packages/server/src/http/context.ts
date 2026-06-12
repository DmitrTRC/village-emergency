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
