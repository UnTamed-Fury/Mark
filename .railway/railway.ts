import { defineRailway, github, preserve, project, service } from "railway/iac";

// This repository manages only its own resources in the environment.
export const partial = "animex-mark-bot";

export default defineRailway(() => {
  const animex_mark_bot = service("animex-mark-bot", {
    source: github("UnTamed-Fury/Mark"),
    build: {
      buildCommand: "pnpm build",
      builder: "NIXPACKS",
    },
    deploy: {
      startCommand: "pnpm start",
      sleepApplication: true,
    },
    variables: {
      DISCORD_BOT_TOKEN: preserve(),
      FLUXER_BOT_TOKEN: preserve(),
      PREFIX: preserve(),
    },
  });

  return project("Fury", {
    resources: [animex_mark_bot],
  });
});
