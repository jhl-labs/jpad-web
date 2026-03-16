# 배포 및 설정

## 필수 요구사항

- **Bun** (런타임 + 패키지 매니저)
- **PostgreSQL** 15+
- **Redis** 7+
- **Node.js** 18+ (Next.js 호환)

## 환경 변수

### `.env` 파일

```env
# 데이터베이스
DATABASE_URL="postgresql://user:password@localhost:5432/jpad"

# NextAuth
NEXTAUTH_SECRET="랜덤_시크릿_키"
NEXTAUTH_URL="http://localhost:3000"
APP_ENCRYPTION_KEY="워크스페이스_비밀_암호화용_랜덤_시크릿"
PLATFORM_ADMIN_EMAILS="ops-admin@example.com"
AUTH_ALLOW_CREDENTIALS_LOGIN=1
AUTH_ALLOW_SELF_SIGNUP=1
OIDC_ENABLED=0
OIDC_NAME="Acme SSO"
OIDC_ISSUER="https://sso.example.com/realms/acme"
OIDC_CLIENT_ID="jpad"
OIDC_CLIENT_SECRET="client-secret"
OIDC_SCOPE="openid profile email"
OIDC_REQUIRE_VERIFIED_EMAIL=1
OIDC_ALLOW_EMAIL_LINKING=0
SAML_ENABLED=0
SAML_NAME="Acme SAML"
SAML_ENTRY_POINT="https://sso.example.com/realms/acme/protocol/saml"
SAML_ISSUER="http://localhost:3000/api/auth/saml/metadata"
SAML_CALLBACK_URL="http://localhost:3000/api/auth/saml/acs"
SAML_IDP_ISSUER="https://sso.example.com/realms/acme"
SAML_IDP_CERT="-----BEGIN CERTIFICATE-----..."
SAML_REQUIRE_EMAIL=1
SAML_ALLOW_EMAIL_LINKING=0
SAML_ACCEPTED_CLOCK_SKEW_MS=5000
SAML_REQUEST_ID_EXPIRATION_PERIOD_MS=300000

# CORS (쉼표 구분, NEXTAUTH_URL 외 추가 origin)
CORS_ALLOWED_ORIGINS=""

# WebSocket
NEXT_PUBLIC_WS_URL="ws://localhost:1234"
WS_PORT=1234
WS_SECRET="WebSocket_HMAC_시크릿_키"

# Redis
REDIS_URL="redis://localhost:6379"

# Retention
TRASH_RETENTION_DAYS=30
AI_CHAT_RETENTION_DAYS=90
REVOKED_SHARE_RETENTION_DAYS=30
AUDIT_LOG_RETENTION_DAYS=365
AUDIT_LOG_WEBHOOK_URL="https://siem.example.com/ingest/jpad"
AUDIT_LOG_WEBHOOK_SECRET="공유_HMAC_시크릿"
AUDIT_LOG_WEBHOOK_LABEL="primary"
AUDIT_LOG_WEBHOOK_TIMEOUT_MS=10000
AUDIT_LOG_WEBHOOK_BATCH_LIMIT=50
AUDIT_LOG_WEBHOOK_MAX_ATTEMPTS=5

# Backup / Restore
BACKUP_ROOT_DIR="data/backups"
BACKUP_DATABASE_STRATEGY="auto" # "auto" | "pg_dump" | "logical_json"
BACKUP_INCLUDE_REPOS=1
BACKUP_INCLUDE_UPLOADS=1
BACKUP_INCLUDE_YJS=1
BACKUP_PG_DUMP_BIN="pg_dump"
BACKUP_TAR_BIN="tar"
BACKUP_GIT_BIN="git"
RESTORE_DRILL_REPO_SAMPLE_LIMIT=3

# Semantic vector store
VECTOR_STORE_BACKEND="json" # "json" | "pgvector" | "qdrant"
PGVECTOR_AUTO_INIT=1
QDRANT_URL=""
QDRANT_API_KEY=""
QDRANT_COLLECTION_PREFIX="jpad_page_embeddings"
QDRANT_AUTO_INIT=1
QDRANT_TIMEOUT_MS=10000

# Upload security
UPLOAD_MALWARE_SCAN_MODE="off" # "off" | "best_effort" | "required"
UPLOAD_CLAMAV_HOST=""
UPLOAD_CLAMAV_PORT=3310
UPLOAD_CLAMAV_TIMEOUT_MS=10000
UPLOAD_ENABLE_BUILTIN_EICAR=1
UPLOAD_ALLOW_SVG=0
UPLOAD_ENFORCE_FILENAME_POLICY=1
UPLOAD_BLOCKED_INTERMEDIATE_EXTENSIONS=".exe,.bat,.cmd,.com,.scr,.js,.mjs,.cjs,.jar,.ps1,.sh,.php,.html,.htm"
UPLOAD_DLP_SCAN_MODE="off" # "off" | "best_effort" | "required"
UPLOAD_DLP_DETECTORS="credit_card,us_ssn,korean_rrn,aws_access_key,private_key"
UPLOAD_DLP_MAX_EXTRACTED_CHARACTERS=50000

# AI fallback keys
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-proj-..."
GEMINI_API_KEY="AIza..."
GOOGLE_API_KEY=""
OLLAMA_API_KEY=""
AI_MODEL="claude-sonnet-4-20250514"

# 파일 스토리지 (선택)
STORAGE_TYPE="local"  # "local" | "s3"
# S3 설정 (STORAGE_TYPE=s3인 경우)
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="..."
S3_SECRET_KEY="..."
S3_REGION="ap-northeast-2"
S3_BUCKET="jpad-uploads"
```

- `APP_ENCRYPTION_KEY`는 워크스페이스별 AI API 키 같은 비밀값을 DB에 암호화 저장할 때 사용합니다.
- AI 설정은 이제 워크스페이스별 `provider profile + task routing` 구조입니다. 각 프로필에 직접 API 키를 저장할 수 있고, 비워두면 provider별 fallback env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `OLLAMA_API_KEY`)를 사용합니다.
- OpenAI-compatible/Ollama/Gemini는 설정 화면에서 base URL과 모델 목록 조회, 연결 테스트, 실제 LLM 테스트를 지원합니다.
- 운영 환경에서는 `NEXTAUTH_SECRET`, `WS_SECRET`, `APP_ENCRYPTION_KEY`를 각각 분리된 강한 랜덤값으로 관리해야 합니다.
- `PLATFORM_ADMIN_EMAILS`는 `/admin/ops`와 운영 API에 접근할 수 있는 전역 관리자 이메일 목록입니다. 쉼표로 여러 개를 지정할 수 있습니다.
- `AUTH_ALLOW_CREDENTIALS_LOGIN=0`이면 이메일/비밀번호 로그인 폼과 Credentials provider가 비활성화됩니다.
- `AUTH_ALLOW_SELF_SIGNUP=0`이면 `/register` UI와 `POST /api/auth/register` 셀프 가입이 막힙니다.
- `OIDC_ENABLED=1`이면 글로벌 OIDC SSO가 활성화됩니다. `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`이 모두 필요합니다.
- `OIDC_REQUIRE_VERIFIED_EMAIL=1`이 기본값이며, 검증된 이메일을 제공하지 않는 IdP는 로그인되지 않습니다.
- `OIDC_ALLOW_EMAIL_LINKING=1`은 기존 로컬 계정을 같은 이메일의 OIDC 계정과 자동 연결합니다. 마이그레이션 기간에만 일시적으로 켜는 것을 권장합니다.
- `SAML_ENABLED=1`이면 `/api/auth/saml/login`, `/api/auth/saml/acs`, `/api/auth/saml/metadata`가 활성화됩니다.
- `SAML_ENTRY_POINT`, `SAML_IDP_CERT`는 필수이고, `SAML_ISSUER`/`SAML_CALLBACK_URL`은 비우면 `NEXTAUTH_URL` 기준 기본값을 사용합니다.
- `SAML_REQUIRE_EMAIL=1`이면 assertion에서 이메일을 찾지 못한 로그인을 거부합니다. 다만 NameID가 이메일 형식이면 그것을 이메일로 사용합니다.
- `SAML_ALLOW_EMAIL_LINKING=1`은 기존 로컬 계정을 같은 이메일의 SAML 계정과 자동 연결합니다. 마이그레이션 기간에만 일시적으로 켜는 것을 권장합니다.
- SAML request ID 검증은 Redis를 우선 사용합니다. Redis 연결이 실패하면 단일 프로세스 메모리 fallback으로만 동작하므로, 운영 환경에서는 Redis를 반드시 유지하는 편이 안전합니다.
- 조직 도메인 검증은 `_jpad.<domain>` TXT 레코드에 `jpad-domain-verification=<token>` 값을 넣는 방식입니다. 검증된 도메인만 auto-join에 사용됩니다.
- SCIM 프로비저닝은 환경 변수로 켜는 방식이 아니라, 조직 `owner/admin`이 `/organizations` 화면 또는 조직 API에서 org-scoped bearer token을 발급해 연동합니다.
- group push를 쓰는 IdP는 같은 Base URL에서 `/Groups` endpoint도 함께 사용합니다.
- `TRASH_RETENTION_DAYS`, `AI_CHAT_RETENTION_DAYS`, `REVOKED_SHARE_RETENTION_DAYS`, `AUDIT_LOG_RETENTION_DAYS`는 retention job 기준값입니다.
- `AUDIT_LOG_WEBHOOK_URL`을 설정하면 감사 로그가 outbox(`AuditLogWebhookDelivery`)를 통해 외부 SIEM/webhook으로 전달됩니다. 요청 본문은 JSON 단건 이벤트이고, `AUDIT_LOG_WEBHOOK_SECRET`이 있으면 `x-jpad-signature`(`sha256=`) HMAC 서명이 함께 전송됩니다.
- `AUDIT_LOG_WEBHOOK_BATCH_LIMIT`, `AUDIT_LOG_WEBHOOK_TIMEOUT_MS`, `AUDIT_LOG_WEBHOOK_MAX_ATTEMPTS`는 전달 워커의 배치 크기, 타임아웃, 최대 재시도 횟수입니다.
- `BACKUP_DATABASE_STRATEGY=auto`는 `pg_dump`가 있으면 SQL dump를, 없으면 `logical_json` fallback을 사용합니다. 운영 환경에서는 `pg_dump` 사용을 권장합니다.
- `VECTOR_STORE_BACKEND=pgvector`를 쓰면 semantic search가 PostgreSQL 내 `pgvector` 테이블을 함께 사용합니다. 권한이 충분하면 앱이 `CREATE EXTENSION vector`와 보조 테이블을 자동 초기화하고, 실패하면 JSON backend로 자동 fallback 합니다.
- `VECTOR_STORE_BACKEND=qdrant`를 쓰면 semantic search가 외부 Qdrant 컬렉션을 사용합니다. `QDRANT_URL`이 필요하고, `QDRANT_AUTO_INIT=1`이면 dimension별 컬렉션과 payload index(`workspaceId`, `pageId`)를 앱이 자동 생성합니다. Qdrant 연결 실패 시에도 검색은 JSON backend로 자동 fallback 합니다.
- `pgvector` 또는 `qdrant`로 전환한 뒤에는 기존 JSON 임베딩을 외부 vector store로 채우기 위해 `semantic:reindex`를 한 번 실행하는 편이 안전합니다.
- 워크스페이스 `AI 설정 > Semantic Search 운영`과 `/admin/ops`에서는 현재 configured backend, 실제 read backend, chunk count, pgvector/Qdrant fallback 원인을 바로 확인할 수 있습니다. 운영 중 DB 확장 또는 Qdrant 연결을 수정했다면 상태 재검사 버튼으로 재확인할 수 있습니다.
- `UPLOAD_MALWARE_SCAN_MODE=required`면 ClamAV 검사 성공 후 `clean`으로 판정된 업로드만 허용합니다. `best_effort`는 검사 실패 시 경고 상태(`error`)로 허용하고, `off`는 검사 자체를 생략합니다.
- `UPLOAD_ENABLE_BUILTIN_EICAR=1`이면 개발/테스트 환경에서 EICAR 문자열을 로컬에서도 바로 차단합니다. 실제 ClamAV smoke를 돌릴 때는 `0`으로 내려 실제 엔진 감지를 검증합니다.
- `UPLOAD_ALLOW_SVG=0`이 기본값이며, SVG 같은 active content는 명시적으로 허용하기 전까지 차단됩니다.
- `UPLOAD_ENFORCE_FILENAME_POLICY=1`이면 `invoice.exe.pdf` 같은 위험한 중간 확장자를 차단합니다.
- `UPLOAD_DLP_SCAN_MODE`는 문서 내용 기반 DLP 검사 모드입니다. 현재는 `pdf`, `docx`, `xlsx`, `svg`에서 텍스트를 추출해 검사하고, `doc`/`xls`/이미지는 DLP를 우회합니다.
- `UPLOAD_DLP_DETECTORS`는 내장 탐지기 목록입니다. 현재 `credit_card`, `us_ssn`, `korean_rrn`, `aws_access_key`, `private_key`를 지원합니다.
- `UPLOAD_DLP_MAX_EXTRACTED_CHARACTERS`는 DLP 텍스트 추출 상한입니다. 너무 큰 문서는 이 길이까지만 검사하고 감사/운영 화면에는 여전히 차단 또는 경고 결과가 남습니다.
- `STORAGE_TYPE=s3`인 경우 앱 내부 백업은 로컬 uploads 아카이브를 만들지 않고, 버킷 versioning/lifecycle 정책으로 별도 보호해야 합니다.

## 로컬 개발

### 1. 의존성 설치

```bash
bun install
```

개발용 인프라를 한 번에 띄우려면:

```bash
docker compose up -d postgres redis minio clamav qdrant keycloak
```

### 2. 데이터베이스 설정

```bash
# Prisma 클라이언트 생성
bun run db:generate

# 스키마 푸시 (개발용)
bun run db:push

# 또는 마이그레이션 (프로덕션용)
bun run db:migrate
```

### 3. 개발 서버 실행

```bash
# Next.js + WebSocket 서버 동시 실행
bun run dev

# 또는 개별 실행
bun run dev:next  # Next.js만
bun run dev:ws    # WebSocket만
```

### 4. 외부 접속 허용

```bash
# 특정 포트 + 외부 접근
bunx next dev --turbopack -H 0.0.0.0 -p 32323
```

### 5. Prisma Studio

```bash
bun run db:studio
```

### 6. Retention Dry Run

```bash
set -a && source .env && set +a
bun run retention:run --dry-run
```

실제 정리를 실행하려면 `--dry-run` 없이 실행합니다.

### 7. Retention 배치 실행

```bash
set -a && source .env && set +a
bun run retention:run --trigger=scheduled
```

- 운영 환경에서는 cron 또는 job runner로 주기 실행합니다.
- 실행 결과는 `RetentionRun`, `RetentionRunWorkspace`, `AuditLog`에 남아서 워크스페이스 설정의 감사 로그 탭에서 확인할 수 있습니다.

### 8. Backup Dry Run

```bash
set -a && source .env && set +a
bun run backup:run --dry-run
```

- 실제 파일은 만들지 않고, 어떤 아티팩트를 생성/스킵할지와 DB 백업 전략을 출력합니다.
- `pg_dump`가 없으면 `logical_json`으로 자동 fallback 됩니다.

### 9. Backup 실행

```bash
set -a && source .env && set +a
bun run backup:run --trigger=scheduled
```

- 기본 출력 위치는 `BACKUP_ROOT_DIR` 아래의 타임스탬프 디렉토리입니다.
- 생성 결과는 `BackupRun`, `BackupArtifact` 테이블에 남습니다.
- local storage일 때는 `repos.tar.gz`, `uploads.tar.gz`, `yjs.tar.gz`, DB dump/export, `manifest.json`이 생성됩니다.

### 10. Restore Drill 실행

```bash
set -a && source .env && set +a
bun run restore-drill:run
```

특정 백업 기준으로 검증하려면:

```bash
set -a && source .env && set +a
bun run restore-drill:run --backup-run-id=<backup_run_id>
```

- 최신 성공 백업을 기준으로 checksum 검증, archive list 검증, repo sample `git fsck`를 수행합니다.
- 결과는 `RestoreDrillRun`에 남습니다.

### 11. Semantic Search 재색인

```bash
set -a && source .env && set +a
bun run semantic:reindex --dry-run --workspace-id=<workspace_id>
```

전체 워크스페이스 재색인은:

```bash
set -a && source .env && set +a
bun run semantic:reindex --trigger=scheduled
```

- 큐에 쌓인 인덱싱 작업만 소비하려면:

```bash
set -a && source .env && set +a
bun run semantic:index-jobs --trigger=scheduled --limit=50
```

- 워크스페이스 설정의 AI 탭에서도 현재 워크스페이스 단위 재색인을 실행할 수 있습니다.
- 워크스페이스 설정의 AI 탭에서 최근 인덱싱 큐와 수동 `큐 처리`도 확인할 수 있습니다.
- 워커 실행 결과는 `SearchIndexWorkerRun`, `SearchIndexWorkerRunWorkspace`, `AuditLog`에 남습니다.
- 임베딩 모델이 설정되지 않은 워크스페이스는 `disabledPages`로 집계됩니다.
- 대량 재색인은 운영 배치 또는 작업 큐 워커(`semantic:index-jobs`)에서 실행하는 편이 안전합니다.

### 12. Audit Log Delivery 실행

```bash
set -a && source .env && set +a
bun run audit-log:deliveries --trigger=scheduled --limit=50
```

- `AuditLogWebhookDelivery` outbox에서 아직 전달되지 않은 이벤트를 꺼내 외부 webhook/SIEM으로 POST 합니다.
- 성공 시 `delivered`, 재시도 중이면 `pending`, 최대 재시도 초과 시 `error`로 남습니다.
- `/admin/ops`에서는 전체 전달 상태를, 워크스페이스 설정의 감사 로그 탭에서는 NDJSON export를 확인할 수 있습니다.
- 수동 smoke 검증은 `bun run audit-log:delivery:smoke`로 할 수 있습니다.

### 13. 스케줄러 템플릿

- 운영 템플릿은 [deploy/schedulers/README.md](deploy/schedulers/README.md)에 정리돼 있습니다.
- `cron`: [jpad-ops.cron](deploy/schedulers/cron/jpad-ops.cron)
- `systemd`: [jpad-scheduled-job@.service](deploy/schedulers/systemd/jpad-scheduled-job@.service)
- `kubernetes`: [cronjobs.yaml](deploy/schedulers/kubernetes/cronjobs.yaml)
- 공통 실행 래퍼: [run-scheduled-job.sh](deploy/scripts/run-scheduled-job.sh)

권장 기본 주기:

1. `audit-log-deliveries`: 2분 간격
2. `attachment-security-rescan`: 1시간 간격
3. `semantic-index-jobs`: 5분 간격
4. `backup`: 매일 02:00
5. `retention`: 매일 03:15
6. `restore-drill`: 매주 일요일 04:30
7. `semantic-reindex`: 기본은 비활성 또는 주 1회

- 템플릿 적용 전 경로(`/srv/jpad`), 서비스 계정(`jpad`), PVC/Secret 이름을 환경에 맞게 바꿔야 합니다.
- `deploy/scripts/run-scheduled-job.sh`는 `flock`이 있으면 중복 실행을 자동으로 막습니다.
- Kubernetes처럼 env file 대신 Secret/ConfigMap으로 직접 주입하는 환경은 `JPAD_ALLOW_MISSING_ENV_FILE=1`을 사용합니다.

### 14. Upload Security Smoke Test

```bash
set -a && source .env && set +a
bun run upload-security:smoke
```

- SVG 정책 차단, EICAR 테스트 시그니처 차단, scanner 미설정 best-effort 허용 경계를 확인합니다.

실제 ClamAV 데몬까지 확인하려면:

```bash
bun run upload-security:clamav:smoke
```

- `docker compose up -d clamav`를 내부에서 실행하고, 실제 ClamAV `INSTREAM` 경로로 clean / EICAR 검사를 확인합니다.

문서 내용 기반 DLP까지 확인하려면:

```bash
set -a && source .env && set +a
bun run upload-dlp:smoke
```

- 간단한 PDF 안의 카드 번호, DOCX 안의 AWS access key를 탐지해 차단하는지 확인합니다.
- 이미지처럼 현재 DLP 텍스트 추출을 지원하지 않는 타입은 `bypassed`로 남는 것도 함께 확인합니다.

### 15. Attachment Security Rescan

```bash
set -a && source .env && set +a
bun run attachment-security:rescan --limit=50
```

- 기존 `error`, `bypassed`, `not_scanned` 첨부를 다시 검사합니다.
- 재검사 결과가 `blocked`면 첨부는 격리되고 `/api/upload/[attachmentId]` 다운로드가 `423`으로 막힙니다.
- 워크스페이스 UI에서도 `재검사` 버튼으로 개별 첨부를 다시 검사할 수 있습니다.
- `/admin/ops`의 `첨부 격리 검토` 섹션에서는 `격리`, `수동 허용`, `경고` 대기열을 보고 `재검사`, `수동 허용`, `다시 격리`를 수행할 수 있습니다.
- 수동 허용은 스캔 결과를 삭제하지 않고 `securityDisposition="released"`만 기록합니다. 다시 검사해서 다시 `blocked`가 나오면 허용 상태는 자동으로 초기화됩니다.

### 16. Qdrant Smoke Test

실제 `Qdrant` 연동을 검증하려면:

```bash
docker compose up -d qdrant
set -a && source .env && set +a
VECTOR_STORE_BACKEND=qdrant \
QDRANT_URL=http://localhost:6333 \
bun run vector-store:smoke --expect-backend=qdrant
```

- 임시 사용자/워크스페이스/페이지를 만들고, vector upsert/search/delete를 실제로 수행한 뒤 정리합니다.
- `--keep-data`를 주면 검증 후 데이터를 남겨둘 수 있습니다.
- `QDRANT_URL`이 없거나 Qdrant가 죽어 있으면 smoke test는 실패해야 정상입니다. 운영 UI에서는 이 경우 JSON fallback 상태로 보입니다.

### 14. SCIM 연동

1. `/organizations`에서 대상 조직의 `SCIM 토큰 발급`
2. IdP에 Base URL `/api/scim/v2`와 bearer token 등록
3. 연결 확인용 endpoint:
   - `GET /api/scim/v2/ServiceProviderConfig`
   - `GET /api/scim/v2/ResourceTypes`
4. 실제 프로비저닝 endpoint:
   - `GET /api/scim/v2/Schemas`
   - `GET/POST /api/scim/v2/Users`
   - `GET/PATCH/DELETE /api/scim/v2/Users/{id}`
   - `GET/POST /api/scim/v2/Groups`
   - `GET/PATCH/DELETE /api/scim/v2/Groups/{id}`

- 현재는 `Users` lifecycle과 `Groups -> workspace role mapping`까지 지원하고, 다음 단계는 실제 IdP 제품과의 실연동 검증입니다.
- `active=false` 또는 `DELETE /Users/{id}`는 조직 멤버십을 제거합니다.
- 조직 화면에서 SCIM group을 조직 소속 워크스페이스 role에 매핑할 수 있습니다.
- SCIM-managed 워크스페이스 멤버는 수동 제거/role 변경 대신 IdP group 또는 mapping 변경으로 관리해야 합니다.
- 이미 수동으로 초대된 멤버는 SCIM mapping이 role을 강제로 승격/강등하지 않습니다. 완전한 IdP 관리가 필요하면 기존 수동 멤버십을 먼저 정리한 뒤 group mapping을 적용하세요.

### 15. Keycloak OIDC Smoke

개발용 Keycloak realm import는 [jpad-realm.json](deploy/idp/keycloak/realm-import/jpad-realm.json)에 들어 있습니다.

```bash
docker compose up -d keycloak
bun run oidc:keycloak:smoke
```

- 기본 realm: `jpad`
- 테스트 사용자: `oidc-smoke-user`
- 테스트 비밀번호: `SmokePassword123!`
- client id: `jpad`
- smoke는 실행 전 같은 이메일의 로컬 smoke 계정을 정리하고, `Keycloak 로그인 -> NextAuth callback -> /workspace redirect -> OIDC 사용자 JIT 생성`까지 확인합니다.

### 16. Keycloak SAML Smoke

SAML smoke는 실행 시점에 테스트용 SAML client와 사용자를 동적으로 만들고, SP metadata entity ID를 `SAML_ISSUER`와 일치시킵니다.

```bash
docker compose up -d keycloak
bun run saml:keycloak:smoke
```

- 기본 realm: `jpad`
- 테스트 사용자: `saml-smoke-user@example.com`
- 테스트 비밀번호: `SmokePassword123!`
- client id / entity id: `http://localhost:3101/api/auth/saml/metadata` 기본값
- smoke는 실행 전 같은 이메일의 로컬 smoke 계정을 정리하고, `SAML AuthnRequest -> Keycloak 로그인 -> ACS 검증 -> /saml/complete -> /workspace redirect -> SAML 사용자 JIT 생성`까지 확인합니다.

## npm 스크립트

| 스크립트 | 설명 |
|---------|------|
| `dev` | Next.js + WS 서버 동시 실행 (concurrently) |
| `dev:next` | Next.js 개발 서버 (Turbopack) |
| `dev:ws` | WebSocket 서버 |
| `build` | 프로덕션 빌드 |
| `start` | 프로덕션 실행 |
| `lint` | ESLint |
| `db:generate` | Prisma 클라이언트 생성 |
| `db:push` | 스키마 DB 동기화 |
| `db:migrate` | Prisma 마이그레이션 |
| `db:studio` | Prisma Studio |
| `backup:run` | 백업 실행 / dry-run |
| `restore-drill:run` | 최신 백업 복구 검증 |
| `semantic:reindex` | 검색 임베딩 재색인 |
| `semantic:index-jobs` | 검색 인덱싱 큐 워커 실행 |
| `test:e2e` | Playwright E2E 테스트 |
| `test:e2e:ui` | Playwright UI 모드 |

## Docker 구성 (예시)

### PostgreSQL

```bash
docker run -d \
  --name jpad-postgres \
  -e POSTGRES_USER=jpad \
  -e POSTGRES_PASSWORD=jpad_password \
  -e POSTGRES_DB=jpad \
  -p 5432:5432 \
  -v jpad-pgdata:/var/lib/postgresql/data \
  postgres:15
```

### Redis

```bash
docker run -d \
  --name jpad-redis \
  -p 6379:6379 \
  redis:7-alpine
```

## 디렉토리 구조 (런타임 데이터)

```
data/
├── repos/          # Git 저장소 (워크스페이스별)
│   └── {workspaceId}/
│       ├── .git/
│       └── *.md
├── uploads/        # 로컬 파일 첨부 (STORAGE_TYPE=local)
└── yjs/            # Yjs 스냅샷 (파일 기반 폴백)
```

- `data/` 디렉토리는 `.gitignore`에 포함
- 프로덕션에서는 적절한 볼륨 마운트 필요

## 프로덕션 체크리스트

1. **환경 변수** 설정 확인 (특히 시크릿 키)
2. **PostgreSQL** 연결 및 마이그레이션
3. **Redis** 연결 확인
4. **WebSocket 서버** 포트 및 URL 설정
5. **CORS** 설정 (필요 시)
6. **리버스 프록시** 설정 (nginx 등)
   - Next.js: HTTP
   - WebSocket: WS 프로토콜 업그레이드 지원
7. **SSL/TLS** 설정 (wss:// 프로토콜)
8. **data/** 디렉토리 볼륨 마운트
9. **Rate Limiting** 설정 확인 (`src/lib/rateLimit.ts`)
10. **파일 업로드** 크기 제한 확인
11. **백업 스케줄** 설정 확인 (`backup:run`, `restore-drill:run`)
12. **S3 versioning / lifecycle** 또는 외부 백업 정책 확인

## 포트 기본값

| 서비스 | 기본 포트 | 환경 변수 |
|--------|----------|----------|
| Next.js | 3000 | - |
| WebSocket (Yjs) | 1234 | `WS_PORT` |
| PostgreSQL | 5432 | `DATABASE_URL` |
| Redis | 6379 | `REDIS_URL` |
| Prisma Studio | 5555 | - |
