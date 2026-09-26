import { defineRailway, github, preserve, project, service } from "railway/iac";

// This repository manages only its own resources in the environment.
export const partial = "animex-mark-bot";

export default defineRailway((ctx) => {
  const isTest = ctx?.isEnvironment?.("test") || ctx?.environment === "test";

  const animex_mark_bot = service("animex-mark-bot", {
    source: github("UnTamed-Fury/Mark"),
    build: {
      builder: "NIXPACKS",
      buildCommand: "pnpm build",
      watchPatterns: isTest
        ? ["src/**", "tests/**", "package.json", "pnpm-lock.yaml", "tsconfig.json"]
        : ["src/**", "package.json", "pnpm-lock.yaml", "tsconfig.json"],
    },
    deploy: {
      startCommand: isTest ? "pnpm test" : "pnpm start",
      restartPolicyType: isTest ? "NEVER" : "ON_FAILURE",
      restartPolicyMaxRetries: isTest ? 0 : 10,
      sleepApplication: !isTest,
    },
    variables: {
      DISCORD_BOT_TOKEN: preserve(),
      FLUXER_BOT_TOKEN: preserve(),
      PREFIX: preserve(),
      LOG_CHANNEL_ID: preserve(),
      AFK_LOG_CHANNEL_ID: preserve(),
      SYNC_LOG_CHANNEL_ID: preserve(),
      LOG_SERVER_ID: preserve(),
      DISCORD_SERVER_ID: preserve(),
      FLUXER_SERVER_ID: preserve(),
      CLOUD_BACKUP_ENABLED: preserve(),
      CLOUD_BACKUP_INTERVAL_MIN: preserve(),
      CLOUD_BACKUP_CHANNEL_ID: preserve(),
      CLOUD_BACKUP_SERVER_ID: preserve(),
    },
  });

  return project("Fury", {
    resources: [animex_mark_bot],
  });
});
