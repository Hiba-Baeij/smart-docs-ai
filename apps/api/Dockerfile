# Build context: the repository root (npm workspaces need the root lockfile).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci
COPY packages/contracts packages/contracts
COPY apps/api apps/api
# prisma generate only reads DATABASE_URL from its config; no database is contacted.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run db:generate -w api \
 && npm run build:contracts \
 && npm run build -w api

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
# node_modules is kept whole: the Prisma CLI (a dev dependency) runs the migrations at start.
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/contracts packages/contracts
COPY --from=build /app/apps/api/package.json /app/apps/api/prisma.config.ts apps/api/
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
# The failure logs (ERROR_LOG_DIR=logs) are the only files the API writes; the rest stays root-owned.
RUN mkdir -p logs && chown node:node logs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply committed migrations, then start the single API process.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main"]
