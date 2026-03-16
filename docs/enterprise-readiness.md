# 엔터프라이즈 기능 현황

JPAD의 엔터프라이즈 수준 보안, 운영, 통합 기능 구현 현황을 정리한 문서입니다.

## 인증 / SSO

### OIDC SSO
- `OIDC_ENABLED=1`로 활성화
- NextAuth OAuth provider로 등록되며, PKCE + state 검증 사용
- `oidcIssuer + oidcSubject` 기준으로 사용자 매칭/JIT 생성
- `OIDC_REQUIRE_VERIFIED_EMAIL=1` (기본값): IdP의 `email_verified` 클레임 필수
- `OIDC_ALLOW_EMAIL_LINKING=0` (기본값): 기존 로컬 계정과 이메일 기반 자동 연결 차단
- 이메일 충돌 시 `OIDCEmailConflict`, 기존 SSO 계정 충돌 시 `OIDCAccountConflict` 반환
- 구현: `src/lib/auth/oidc.ts`

### SAML SSO
- `SAML_ENABLED=1`로 활성화
- `@node-saml/node-saml` 라이브러리 사용
- `validateInResponseTo=always` + Redis 기반 request ID 캐시 (Redis 실패 시 프로세스 메모리 fallback)
- `wantAssertionsSigned=true`로 서명 검증
- 이메일 추출: `profile.email`, `mail`, OID 속성, SAML claims, `nameID` 순서로 시도
- ACS 검증 후 `samlIssuer + samlSubject` 기준으로 사용자 연결/JIT 생성
- 일회성 `SsoLoginToken`으로 NextAuth 세션 확정
- `SAML_REQUIRE_EMAIL=1` (기본값), `SAML_ALLOW_EMAIL_LINKING=0` (기본값)
- 엔드포인트: `GET /api/auth/saml/login`, `POST /api/auth/saml/acs`, `GET /api/auth/saml/metadata`
- 구현: `src/lib/auth/saml.ts`

### 인증 정책 제어
- `AUTH_ALLOW_CREDENTIALS_LOGIN=0`: 이메일/비밀번호 로그인 비활성화
- `AUTH_ALLOW_SELF_SIGNUP=0`: 회원가입 비활성화
- 로그인 rate limit: IP당 10회/분 (Redis 기반)

## SCIM v2 프로비저닝

조직 단위로 IdP 사용자/그룹 동기화를 지원합니다.

### 사용자 프로비저닝
- 엔드포인트 base URL: `/api/scim/v2`
- Bearer token 인증 (조직 `owner/admin`이 발급/폐기)
- Rate limit: 토큰당 600회/분
- 지원 리소스:
  - `GET /ServiceProviderConfig`, `GET /ResourceTypes`, `GET /Schemas`
  - `GET/POST /Users`, `GET/PATCH/DELETE /Users/{id}`
  - `GET/POST /Groups`, `GET/PATCH/DELETE /Groups/{id}`
- `User.active=false` 또는 `DELETE /Users/{id}` → 해당 조직 멤버십 제거
- `owner/admin`으로 승격된 멤버는 SCIM deprovision으로 자동 제거되지 않음 (409 반환)
- 비활성 SCIM identity가 있는 조직은 도메인 auto-join에서 제외
- 구현: `src/lib/scim.ts`

### 그룹 프로비저닝 및 워크스페이스 매핑
- SCIM group을 조직 소속 워크스페이스 role에 매핑 가능
- 지원 역할: `admin`, `maintainer`, `editor`, `viewer`
- 복수 그룹에 속한 사용자는 가장 높은 role이 적용됨
- SCIM-managed 워크스페이스 멤버는 수동 role 변경/제거 API로 수정 불가 (IdP group 또는 mapping 변경으로만 갱신)
- 기존 수동 멤버십이 있으면 SCIM mapping이 강제로 덮어쓰지 않음
- 워크스페이스 멤버 변경 시 감사 로그 기록 (`workspace.member.provisioned_by_scim`, `workspace.member.scim_role_updated`, `workspace.member.deprovisioned_by_scim`)
- 구현: `src/lib/scimGroups.ts`

## 조직 / 도메인 관리

- 조직(Organization) 모델: `owner`, `admin`, `member` 3단계 역할
- `owner/admin`만 조직 관리 및 워크스페이스 생성 가능
- 도메인 검증: DNS TXT 레코드 기반 (`_jpad.{domain}` → `jpad-domain-verification={token}`)
- 검증된 도메인의 `autoJoin=true` 설정 시, 해당 이메일 도메인 사용자가 로그인하면 조직 멤버십 자동 생성
- 비활성 SCIM identity가 있는 조직은 auto-join에서 제외 (deprovision된 사용자의 재가입 방지)
- 구현: `src/lib/organizations.ts`

## 감사 로그

### 이벤트 기록
- `AuditLog` 테이블에 모든 감사 이벤트 저장
- 기록 필드: `action`, `status`(success/denied/error), `actorId`, `actorEmail`, `actorName`, `actorRole`, `workspaceId`, `pageId`, `targetId`, `targetType`, `ipAddress`, `userAgent`, `metadata`, `requestId`
- `DISABLE_AUDIT_LOGS=1`로 비활성화 가능
- 구현: `src/lib/audit.ts`

### Webhook 전달
- 감사 로그 생성 시 자동으로 webhook 전달 큐에 적재
- 환경변수: `AUDIT_LOG_WEBHOOK_URL`, `AUDIT_LOG_WEBHOOK_SECRET`, `AUDIT_LOG_WEBHOOK_LABEL`
- HMAC-SHA256 서명 (`x-jpad-signature` 헤더)
- 재시도: 지수 백오프, 기본 최대 5회 (`AUDIT_LOG_WEBHOOK_MAX_ATTEMPTS`)
- 배치 처리: 기본 50건/배치 (`AUDIT_LOG_WEBHOOK_BATCH_LIMIT`)
- 타임아웃: 기본 10초 (`AUDIT_LOG_WEBHOOK_TIMEOUT_MS`)
- 페이로드 형식: `{ source: "jpad.audit_log", version: 1, event: { ... } }`
- 상태 조회 API: pending/error/delivered 건수 및 최근 전달 기록
- 구현: `src/lib/auditWebhook.ts`

## 업로드 보안

### 파일명 정책
- SVG 업로드 차단 (기본, `UPLOAD_ALLOW_SVG=1`로 허용)
- 위험 중간 확장자 차단: `.exe`, `.bat`, `.cmd`, `.com`, `.scr`, `.js`, `.mjs`, `.cjs`, `.jar`, `.ps1`, `.sh`, `.php`, `.html`, `.htm`
- `UPLOAD_ENFORCE_FILENAME_POLICY=1` (기본)

### 악성코드 스캔
- 모드: `off` (기본) / `best_effort` / `required` (`UPLOAD_MALWARE_SCAN_MODE`)
- EICAR 테스트 시그니처 내장 탐지 (`UPLOAD_ENABLE_BUILTIN_EICAR=1` 기본)
- ClamAV 연동: `UPLOAD_CLAMAV_HOST`, `UPLOAD_CLAMAV_PORT` (기본 3310)
- `required` 모드에서 ClamAV 미설정 또는 스캔 실패 시 업로드 차단
- 구현: `src/lib/uploadSecurity.ts`

### DLP (데이터 유출 방지)
- 모드: `off` (기본) / `best_effort` / `required` (`UPLOAD_DLP_SCAN_MODE`)
- **워크스페이스별 정책 오버라이드**: `WorkspaceSettings`의 `uploadDlpScanMode`, `uploadDlpDetectors`, `uploadDlpMaxExtractedCharacters` 필드로 워크스페이스 단위 DLP 정책 설정 가능
- 내장 감지기:
  - `credit_card`: Luhn 알고리즘 검증 포함 신용카드 번호
  - `us_ssn`: 미국 사회보장번호
  - `korean_rrn`: 한국 주민등록번호
  - `aws_access_key`: AWS 액세스 키 (AKIA/ASIA 접두사)
  - `private_key`: RSA/EC/DSA/OPENSSH/PGP 개인키
- 지원 파일 형식: PDF, DOCX, XLSX, SVG (텍스트 추출 후 패턴 매칭)
- 최대 텍스트 추출 크기: 기본 50,000자 (`UPLOAD_DLP_MAX_EXTRACTED_CHARACTERS`)
- 탐지 시 업로드 차단, 마스킹된 미리보기 포함
- 구현: `src/lib/uploadDlp.ts`

## 백업 / 복구

### 백업 구성
- 데이터베이스 전략: `auto` (기본) / `pg_dump` / `logical_json` (`BACKUP_DATABASE_STRATEGY`)
- `pg_dump` 미사용 환경에서 `logical_json` fallback 지원
- 백업 대상: PostgreSQL DB, Git 저장소 (`data/repos/`), 업로드 파일 (`data/uploads/`), Yjs 데이터 (`data/yjs/`)
- 각 대상별 포함 여부 개별 설정 가능 (`BACKUP_INCLUDE_REPOS`, `BACKUP_INCLUDE_UPLOADS`, `BACKUP_INCLUDE_YJS`)
- 백업 실행 증적: `BackupRun`, `BackupArtifact` 모델에 기록
- 아티팩트 메니페스트: 종류, 상태, 파일 경로, 크기, SHA256 체크섬
- 구현: `src/lib/backup.ts`

### 복구 검증 (Restore Drill)
- 최신 성공 백업의 checksum 검증, archive 무결성 검증
- Git 저장소 샘플 `git fsck` 수행 (기본 3개, 최대 20개)
- 검증 결과: `verifiedArtifactCount`, `checksumVerifiedCount`, `archiveVerifiedCount`, `sampledRepoCount`, `repoFsckPassedCount`

## 데이터 보존 정책

환경변수로 보존 기간을 설정하며, retention job이 만료 데이터를 자동 삭제합니다.

| 항목 | 환경변수 | 기본값 |
|------|----------|--------|
| 휴지통 보존 | `TRASH_RETENTION_DAYS` | 30일 |
| AI 대화 보존 | `AI_CHAT_RETENTION_DAYS` | 90일 |
| 폐기 공유 링크 보존 | `REVOKED_SHARE_RETENTION_DAYS` | 30일 |
| 감사 로그 보존 | `AUDIT_LOG_RETENTION_DAYS` | 365일 |

- 삭제 대상: 휴지통 페이지, 첨부파일, 공유 링크, AI 대화, 감사 로그
- 워크스페이스 단위 삭제 집계 제공 (`WorkspaceRetentionSummary`)
- 구현: `src/lib/retention.ts`

## Google Calendar 연동

### OAuth2 인증
- 워크스페이스별 Google OAuth2 credentials 설정 (`WorkspaceSettings.googleCalendarClientId`, `googleCalendarClientSecret`)
- `googleCalendarClientSecret`은 암호화 저장
- 사용자별/워크스페이스별 연결 (`GoogleCalendarConnection`): access token, refresh token (암호화), 토큰 만료, 캘린더 ID, 동기화 활성화 여부
- 토큰 자동 갱신: 만료 60초 전에 refresh token으로 갱신
- 구현: `src/lib/googleCalendar.ts`

### 양방향 동기화
- **Pull (Google -> jpad)**: Google Calendar 이벤트를 `CalendarEvent` 테이블에 동기화 (6개월 전 ~ 12개월 후)
  - 신규 생성, 변경분 업데이트, 삭제된 이벤트 제거
- **Push (jpad -> Google)**: `googleEventId`가 없는 로컬 이벤트를 Google Calendar에 생성, 마지막 동기화 이후 수정된 이벤트 업데이트
- **Full sync**: pull 후 push 순서로 양방향 동기화
- 동기화 시점 기록: `GoogleCalendarConnection.lastSyncAt`
- 구현: `src/lib/googleCalendarSync.ts`

## 관측성 / 운영

### 로그
- 구조화 로그(JSON) 기본
- request id / user id / workspace id / page id / actor role 포함
- 감사 이벤트: 인증 실패, 권한 거부, 공유 링크 발급/폐기, 역할 변경, AI 호출, 업로드, SCIM 프로비저닝

### 메트릭 (권장)
- API latency/error rate
- WebSocket 연결 수, sync 실패율
- Git commit 실패율, lock 대기 시간
- 업로드 실패율, DLP 탐지 빈도
- AI 호출 횟수, 토큰 사용량
- 백업 성공/실패, 복구 검증 결과

### 알림 (권장)
- 5xx 급증, 로그인 실패 급증
- AI 비용 급증
- Git lock timeout 급증
- 백업 실패, 복구 검증 실패
- 감사 webhook 전달 실패 누적
