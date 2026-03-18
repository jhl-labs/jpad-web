FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN bun install --frozen-lockfile
COPY . .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    NEXTAUTH_SECRET="build-secret" \
    NEXTAUTH_URL="http://localhost:3000" \
    APP_ENCRYPTION_KEY="build-encryption-key" \
    REDIS_URL="redis://localhost:6379"
RUN bunx prisma generate && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
USER nextjs
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/package.json ./
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/prisma.config.ts ./
COPY --from=build --chown=nextjs:nodejs /app/src/server ./src/server
COPY --chown=nextjs:nodejs entrypoint.sh ./
EXPOSE 3000 1234
CMD ["sh", "entrypoint.sh"]
