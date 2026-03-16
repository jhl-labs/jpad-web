#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "=== jpad 원클릭 셋업 ==="
echo ""

# 1. .env.example → .env 복사 (이미 있으면 스킵)
if [ -f .env ]; then
  echo "[1/5] .env already exists, skipping copy."
else
  cp .env.example .env
  echo "[1/5] .env.example → .env copied. Edit .env to configure secrets."
fi

# 2. docker compose up -d
echo "[2/5] Starting Docker services (PostgreSQL, Redis)..."
docker compose up -d

# Docker 서비스가 ready 될 때까지 대기
echo "  Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U jpad > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 3. bun install
echo "[3/5] Installing dependencies..."
bun install

# 4. bunx prisma db push
echo "[4/5] Pushing database schema..."
bunx prisma db push

# 5. DB seed (선택)
echo ""
read -r -p "[5/5] Run database seed? (creates admin account + sample workspace) [y/N] " SEED_ANSWER
if [[ "$SEED_ANSWER" =~ ^[Yy]$ ]]; then
  bun run db:seed
  echo "  Database seeded."
else
  echo "  Skipping seed."
fi

echo ""
echo "=== Setup complete! ==="
echo "Run: bun run dev"
echo ""
