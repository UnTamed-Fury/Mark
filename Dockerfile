# Stage 1: Build and compile
FROM node:22-slim AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm prune --prod

# Stage 2: Minimal production runtime
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Create persistent data and logs directory with node user permissions
RUN mkdir -p /data /app/logs && chown -R node:node /data /app

# Copy production artifacts and dependencies
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/.config.mark.example ./
COPY --from=builder --chown=node:node /app/.env.example ./

USER node

# Direct node execution ensures clean SIGINT/SIGTERM signal propagation
CMD ["node", "--max-old-space-size=256", "dist/index.js"]
