import { pino } from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: { err: pino.stdSerializers.err },
});

export type Logger = typeof log;
