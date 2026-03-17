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
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/src/server ./src/server
COPY entrypoint.sh ./
EXPOSE 3000 1234
CMD ["sh", "entrypoint.sh"]
