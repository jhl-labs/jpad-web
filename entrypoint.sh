#!/bin/sh
bunx prisma db push --skip-generate
bunx prisma db seed
bun run src/server/ws.ts &
bun run start
