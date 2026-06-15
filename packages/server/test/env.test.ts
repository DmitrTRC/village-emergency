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
  it("LOG_LEVEL по умолчанию info", () => {
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
    expect(env.LOG_LEVEL).toBe("info");
  });
});
