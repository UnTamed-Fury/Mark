import { defineRailway, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const data = volume("mark-data", {
    sizeMB: 500,
  });

  const bot = service("Mark", {
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build",
    },
    deploy: {
      startCommand: "pnpm start",
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    volumeMounts: {
      "/data": data,
    },
  });

  return project("Mark", {
    resources: [bot, data],
  });
});
