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
