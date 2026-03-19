#!/bin/sh

echo "Waiting for PostgreSQL..."
until bunx prisma db push 2>/dev/null; do
  echo "PostgreSQL not ready, retrying in 2s..."
  sleep 2
done
echo "Database schema pushed."

if [ ! -f /app/data/.seeded ]; then
  bun run prisma/seed.ts
  touch /app/data/.seeded
  echo "Seed complete."
else
  echo "Seed already done, skipping."
fi

(while true; do bun run src/server/ws.ts; echo "WS server crashed, restarting in 2s..."; sleep 2; done) &
bun run start
