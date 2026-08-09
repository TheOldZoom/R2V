import pino from "pino";

export const logger = pino(
  process.env.NODE_ENV === "production"
    ? {
        level: process.env.LOG_LEVEL ?? "info",
      }
    : {
        level: process.env.LOG_LEVEL ?? "debug",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      },
);
