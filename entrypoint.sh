#!/bin/sh
bunx prisma db push --skip-generate
bun run prisma/seed.ts
bun run src/server/ws.ts &
bun run start
