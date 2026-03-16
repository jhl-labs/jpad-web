#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:18080}"
WELL_KNOWN_URL="${OIDC_WELL_KNOWN_URL:-$KEYCLOAK_URL/realms/jpad/.well-known/openid-configuration}"

docker compose up -d --force-recreate keycloak >/dev/null

for attempt in $(seq 1 60); do
  if curl -fsS "$WELL_KNOWN_URL" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "Keycloak did not become ready in time: $WELL_KNOWN_URL" >&2
    exit 1
  fi
  sleep 2
done

set -a
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env >/dev/null 2>&1 || true
fi
set +a

SMOKE_EMAIL="oidc-smoke-user@example.com" bun -e '
  import { PrismaClient } from "@prisma/client";

  const prisma = new PrismaClient();

  await prisma.user.deleteMany({
    where: {
      email: {
        equals: process.env.SMOKE_EMAIL,
        mode: "insensitive",
      },
    },
  });

  await prisma.$disconnect();
'

OIDC_ENABLED=1 \
OIDC_NAME="${OIDC_NAME:-Keycloak SSO}" \
OIDC_ISSUER="${OIDC_ISSUER:-$KEYCLOAK_URL/realms/jpad}" \
OIDC_WELL_KNOWN_URL="$WELL_KNOWN_URL" \
OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-jpad}" \
OIDC_CLIENT_SECRET="${OIDC_CLIENT_SECRET:-jpad-keycloak-dev-secret}" \
OIDC_SCOPE="${OIDC_SCOPE:-openid profile email}" \
OIDC_REQUIRE_VERIFIED_EMAIL=1 \
AUTH_ALLOW_CREDENTIALS_LOGIN=0 \
AUTH_ALLOW_SELF_SIGNUP=0 \
DISABLE_RATE_LIMITS=1 \
NEXTAUTH_URL="http://localhost:3100" \
PLAYWRIGHT_BASE_URL="http://localhost:3100" \
PLAYWRIGHT_WEB_SERVER_URL="http://localhost:3100" \
PLAYWRIGHT_WEB_SERVER_COMMAND="bunx next dev --turbopack -p 3100" \
PLAYWRIGHT_REUSE_EXISTING_SERVER=0 \
bunx playwright test e2e/oidc-keycloak.spec.ts
