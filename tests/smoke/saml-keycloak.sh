#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:18080}"
APP_BASE_URL="${PLAYWRIGHT_WEB_SERVER_URL:-http://localhost:3101}"
APP_BASE_URL="${APP_BASE_URL%/}"
SAML_SP_ENTITY_ID="${SAML_ISSUER:-$APP_BASE_URL/api/auth/saml/metadata}"
SAML_CALLBACK_URL="${SAML_CALLBACK_URL:-$APP_BASE_URL/api/auth/saml/acs}"
SAML_SMOKE_USERNAME="${SAML_SMOKE_USERNAME:-saml-smoke-user@example.com}"
SAML_SMOKE_PASSWORD="${SAML_SMOKE_PASSWORD:-SmokePassword123!}"

docker compose up -d --force-recreate keycloak >/dev/null

for attempt in $(seq 1 60); do
  if curl -fsS "$KEYCLOAK_URL/realms/jpad/protocol/saml/descriptor" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "Keycloak SAML descriptor did not become ready in time" >&2
    exit 1
  fi
  sleep 2
done

docker compose exec -T keycloak \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin >/dev/null

existing_client_id="$(
  docker compose exec -T keycloak \
    /opt/keycloak/bin/kcadm.sh get clients -r jpad -q "clientId=$SAML_SP_ENTITY_ID" |
    node -e 'let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>{const clients=JSON.parse(data);if(clients[0]?.id)process.stdout.write(clients[0].id);});'
)"

if [[ -n "$existing_client_id" ]]; then
  docker compose exec -T keycloak \
    /opt/keycloak/bin/kcadm.sh delete "clients/$existing_client_id" -r jpad >/dev/null
fi

client_payload="$(mktemp)"
trap 'rm -f "$client_payload"' EXIT

cat >"$client_payload" <<JSON
{
  "clientId": "$SAML_SP_ENTITY_ID",
  "name": "JPAD SAML Smoke",
  "enabled": true,
  "protocol": "saml",
  "baseUrl": "$APP_BASE_URL",
  "adminUrl": "$SAML_CALLBACK_URL",
  "redirectUris": ["$SAML_CALLBACK_URL"],
  "webOrigins": ["$APP_BASE_URL"],
  "attributes": {
    "saml.force.post.binding": "true",
    "saml.server.signature": "true",
    "saml.assertion.signature": "true",
    "saml.client.signature": "false",
    "saml.authnstatement": "true",
    "saml_force_name_id_format": "false",
    "saml_name_id_format": "username"
  }
}
JSON

docker compose exec -T keycloak /bin/sh -lc \
  "/opt/keycloak/bin/kcadm.sh create clients -r jpad -f /dev/stdin >/dev/null" \
  <"$client_payload"

existing_user_id="$(
  docker compose exec -T keycloak \
    /opt/keycloak/bin/kcadm.sh get users -r jpad -q "username=$SAML_SMOKE_USERNAME" |
    node -e 'let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>{const users=JSON.parse(data);if(users[0]?.id)process.stdout.write(users[0].id);});'
)"

if [[ -z "$existing_user_id" ]]; then
  docker compose exec -T keycloak \
    /opt/keycloak/bin/kcadm.sh create users -r jpad \
    -s "username=$SAML_SMOKE_USERNAME" \
    -s "email=$SAML_SMOKE_USERNAME" \
    -s "enabled=true" \
    -s "emailVerified=true" \
    -s "firstName=SAML" \
    -s "lastName=Smoke" >/dev/null
fi

docker compose exec -T keycloak \
  /opt/keycloak/bin/kcadm.sh set-password -r jpad \
  --username "$SAML_SMOKE_USERNAME" \
  --new-password "$SAML_SMOKE_PASSWORD" >/dev/null

SAML_IDP_CERT="$(
  curl -fsS "$KEYCLOAK_URL/realms/jpad/protocol/saml/descriptor" |
    node -e 'let xml="";process.stdin.on("data",c=>xml+=c);process.stdin.on("end",()=>{const match=xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/);if(!match){process.exit(1);}process.stdout.write(match[1]);});'
)"

set -a
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env >/dev/null 2>&1 || true
fi
set +a

SMOKE_EMAIL="$SAML_SMOKE_USERNAME" bun -e '
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

SAML_ENABLED=1 \
SAML_NAME="${SAML_NAME:-Keycloak SAML}" \
SAML_ENTRY_POINT="${SAML_ENTRY_POINT:-$KEYCLOAK_URL/realms/jpad/protocol/saml}" \
SAML_ISSUER="$SAML_SP_ENTITY_ID" \
SAML_CALLBACK_URL="$SAML_CALLBACK_URL" \
SAML_IDP_ISSUER="${SAML_IDP_ISSUER:-$KEYCLOAK_URL/realms/jpad}" \
SAML_IDP_CERT="$SAML_IDP_CERT" \
SAML_REQUIRE_EMAIL=1 \
AUTH_ALLOW_CREDENTIALS_LOGIN=0 \
AUTH_ALLOW_SELF_SIGNUP=0 \
DISABLE_RATE_LIMITS=1 \
NEXTAUTH_URL="$APP_BASE_URL" \
PLAYWRIGHT_BASE_URL="$APP_BASE_URL" \
PLAYWRIGHT_WEB_SERVER_URL="$APP_BASE_URL" \
PLAYWRIGHT_WEB_SERVER_COMMAND="bunx next dev --turbopack -p 3101" \
PLAYWRIGHT_REUSE_EXISTING_SERVER=0 \
bunx playwright test e2e/saml-keycloak.spec.ts
