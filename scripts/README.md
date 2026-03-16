# scripts/ - 운영 스크립트

배포 환경에서 cron 또는 수동으로 실행하는 운영(ops) 스크립트입니다.

## 스크립트 목록

### run-backup.ts

데이터베이스와 파일 스토리지(repos, uploads, yjs)를 백업합니다.

```bash
bun run scripts/run-backup.ts              # 실행
bun run scripts/run-backup.ts --dry-run    # 계획만 확인
bun run scripts/run-backup.ts --trigger=cron
```

**환경변수**: `DATABASE_URL`, `BACKUP_ROOT_DIR`, `BACKUP_DATABASE_STRATEGY` (auto|pg_dump|logical_json), `STORAGE_TYPE`

### run-restore-drill.ts

가장 최근 백업의 무결성을 검증합니다 (체크섬, 아카이브 해제, git fsck 등).

```bash
bun run scripts/run-restore-drill.ts
bun run scripts/run-restore-drill.ts --backup-run-id=<id>
bun run scripts/run-restore-drill.ts --trigger=cron
```

**환경변수**: `DATABASE_URL`

### run-retention.ts

휴지통 페이지, 만료된 공유 링크, 오래된 AI 채팅, 감사 로그를 보존 정책에 따라 정리합니다.

```bash
bun run scripts/run-retention.ts              # 실행
bun run scripts/run-retention.ts --dry-run    # 삭제 대상만 확인
bun run scripts/run-retention.ts --trigger=cron
```

**환경변수**: `DATABASE_URL`, `TRASH_RETENTION_DAYS`, `AI_CHAT_RETENTION_DAYS`, `REVOKED_SHARE_RETENTION_DAYS`, `AUDIT_LOG_RETENTION_DAYS`

### run-attachment-security-rescan.ts

기존 첨부파일을 대상으로 악성코드 재검사를 수행합니다.

```bash
bun run scripts/run-attachment-security-rescan.ts
bun run scripts/run-attachment-security-rescan.ts --limit=100
bun run scripts/run-attachment-security-rescan.ts --workspace-id=<id>
```

**환경변수**: `DATABASE_URL`, `UPLOAD_MALWARE_SCAN_MODE`, `UPLOAD_CLAMAV_HOST`, `UPLOAD_CLAMAV_PORT`

### run-audit-log-deliveries.ts

미전송 감사 로그를 webhook 엔드포인트로 전달합니다.

```bash
bun run scripts/run-audit-log-deliveries.ts
bun run scripts/run-audit-log-deliveries.ts --limit=100
bun run scripts/run-audit-log-deliveries.ts --trigger=cron
```

**환경변수**: `DATABASE_URL`, `AUDIT_LOG_WEBHOOK_URL`, `AUDIT_LOG_WEBHOOK_SECRET`, `AUDIT_LOG_WEBHOOK_LABEL`

### run-semantic-index-jobs.ts

대기 중인 시맨틱 검색 인덱싱 작업을 처리합니다.

```bash
bun run scripts/run-semantic-index-jobs.ts
bun run scripts/run-semantic-index-jobs.ts --limit=100
bun run scripts/run-semantic-index-jobs.ts --workspace-id=<id>
```

**환경변수**: `DATABASE_URL`, `VECTOR_STORE_BACKEND`, `OPENAI_API_KEY` (임베딩 생성 시)

### run-semantic-reindex.ts

전체 또는 특정 워크스페이스/페이지의 시맨틱 임베딩을 재생성합니다.

```bash
bun run scripts/run-semantic-reindex.ts
bun run scripts/run-semantic-reindex.ts --workspace-id=<id>
bun run scripts/run-semantic-reindex.ts --page-id=<id>
bun run scripts/run-semantic-reindex.ts --dry-run
bun run scripts/run-semantic-reindex.ts --limit=50
```

**환경변수**: `DATABASE_URL`, `VECTOR_STORE_BACKEND`, `OPENAI_API_KEY` (임베딩 생성 시)
