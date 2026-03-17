#!/bin/sh

echo "Waiting for PostgreSQL..."
until bunx prisma db push --skip-generate 2>/dev/null; do
  echo "PostgreSQL not ready, retrying in 2s..."
  sleep 2
done
echo "Database schema pushed."

bun run prisma/seed.ts
echo "Seed complete."

bun run src/server/ws.ts &
bun run start
