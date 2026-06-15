import { pino, stdSerializers } from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: { err: stdSerializers.err },
});

export type Logger = typeof log;
