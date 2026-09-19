import { defineRailway, project, service } from "railway/iac";

export default defineRailway(() => {
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
  });

  return project("Mark", {
    resources: [bot],
  });
});
