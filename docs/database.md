# 데이터베이스 스키마

PostgreSQL + Prisma ORM 기반. 스키마 파일: `prisma/schema.prisma`

## 모델 관계도

```
User ──┬── WorkspaceMember ──── Workspace ──── WorkspaceSettings
       ├── OrganizationMember ─── Organization ─── OrganizationDomain
       ├── Comment                  │
       ├── Attachment               │
       ├── Favorite                 │
       ├── PagePermission           │
       ├── CalendarEvent            │
       ├── Todo (assignee/creator)  │
       ├── Notification             │
       ├── PageTemplate             │
       └── GoogleCalendarConnection │
                                    │
                               Page ──┬── Backlink (from/to)
                                      ├── Comment (thread)
                                      ├── Attachment
                                      ├── Favorite
                                      ├── PagePermission
                                      ├── PageShareLink
                                      ├── PageEmbeddingChunk
                                      ├── CalendarEvent
                                      └── Todo
```

## 모델 상세

### User
사용자 계정 정보.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| email | String | 고유, 로그인 식별자 |
| name | String | 표시 이름 |
| hashedPassword | String? | 로컬 로그인용 bcrypt 해시. SSO 전용 계정은 null |
| oidcIssuer | String? | 연결된 OIDC issuer |
| oidcSubject | String? | 연결된 OIDC subject |
| samlIssuer | String? | 연결된 SAML issuer |
| samlSubject | String? | 연결된 SAML subject / NameID |
| lastLoginAt | DateTime? | 마지막 로그인 시각 |
| createdAt | DateTime | 생성일 |
| updatedAt | DateTime | 수정일 |

- `@@unique([oidcIssuer, oidcSubject])` - OIDC 계정 1:1 연결 보장
- `@@unique([samlIssuer, samlSubject])` - SAML 계정 1:1 연결 보장

### SsoLoginToken
SAML ACS 검증 후 NextAuth 세션 브리지에 쓰는 일회성 로그인 토큰.

| 필드 | 타입 | 설명 |
|------|------|------|
| provider | String | 현재는 `"saml"` |
| tokenHash | String | raw token의 SHA-256 해시 |
| expiresAt | DateTime | 만료 시각 |
| userId | UUID | FK -> User |

- raw token은 DB에 평문 저장하지 않음
- 토큰 소비 시 row를 즉시 삭제해서 재사용을 막음

### Workspace
워크스페이스 (문서 컬렉션 단위).

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| name | String | 워크스페이스 이름 |
| slug | String | URL 경로용 고유 식별자 |
| description | String? | 설명 |
| visibility | String | `"public"` \| `"private"` (기본: private) |
| publicWikiEnabled | Boolean | 공개 위키 활성화 (기본: false) |
| organizationId | UUID? | FK -> Organization |
| createdAt | DateTime | 생성일 |

### WorkspaceMember
워크스페이스 멤버십 (사용자-워크스페이스 다대다 관계).

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| role | String | `owner` \| `admin` \| `maintainer` \| `editor` \| `viewer` |
| managedByScim | Boolean | SCIM으로 관리되는 멤버십 여부 (기본: false) |
| userId | UUID | FK -> User |
| workspaceId | UUID | FK -> Workspace |

- `@@unique([userId, workspaceId])` - 사용자당 워크스페이스 1개 멤버십

### Organization
조직/테넌트 단위 엔터티. 워크스페이스와 도메인 정책의 상위 그룹.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| name | String | 조직 이름 |
| slug | String | URL/식별용 슬러그 |
| description | String? | 설명 |

### OrganizationMember
조직 멤버십.

| 필드 | 타입 | 설명 |
|------|------|------|
| organizationId | UUID | FK -> Organization |
| userId | UUID | FK -> User |
| role | String | `owner` \| `admin` \| `member` |

- `@@unique([userId, organizationId])` - 사용자당 조직 멤버십 1개

### OrganizationDomain
조직 이메일 도메인 정책. 검증 완료된 도메인만 auto-join에 사용.

| 필드 | 타입 | 설명 |
|------|------|------|
| domain | String | 고유 도메인 (`example.com`) |
| autoJoin | Boolean | 같은 이메일 도메인 사용자를 로그인 시 조직에 자동 추가 |
| verificationToken | String | DNS TXT 검증 토큰 |
| verifiedAt | DateTime? | 검증 완료 시각 |

### OrganizationScimToken
조직별 SCIM bearer token 메타데이터.

| 필드 | 타입 | 설명 |
|------|------|------|
| label | String | 운영자가 붙인 토큰 이름 |
| tokenHash | String | SHA-256 해시 저장값 |
| lastUsedAt | DateTime? | 마지막 사용 시각 |
| revokedAt | DateTime? | 폐기 시각 |
| createdByUserId | UUID? | 발급한 조직 관리자 |

### OrganizationScimIdentity
조직 단위 SCIM 사용자 리소스. 전역 `User`와 분리된 org-scoped identity.

| 필드 | 타입 | 설명 |
|------|------|------|
| organizationId | UUID | FK -> Organization |
| userId | UUID | FK -> User |
| externalId | String? | IdP 외부 식별자 |
| userName | String | SCIM userName |
| displayName | String? | 표시 이름 |
| givenName | String? | 이름 |
| familyName | String? | 성 |
| active | Boolean | 조직 접근 활성 여부 |
| lastProvisionedAt | DateTime | 마지막 SCIM 동기화 시각 |

- `@@unique([organizationId, userId])` - 조직당 전역 사용자 1개 identity
- `@@unique([organizationId, externalId])` - 외부 식별자 충돌 방지
- `@@unique([organizationId, userName])` - 조직 내 userName 고유 보장

### OrganizationScimGroup
조직 단위 SCIM group 리소스.

| 필드 | 타입 | 설명 |
|------|------|------|
| organizationId | UUID | FK -> Organization |
| externalId | String? | IdP 외부 식별자 |
| displayName | String | 그룹 이름 |
| lastProvisionedAt | DateTime | 마지막 SCIM 동기화 시각 |

### OrganizationScimGroupMember
SCIM group과 SCIM identity의 다대다 매핑.

| 필드 | 타입 | 설명 |
|------|------|------|
| scimGroupId | UUID | FK -> OrganizationScimGroup |
| scimIdentityId | UUID | FK -> OrganizationScimIdentity |

### WorkspaceScimGroupMapping
SCIM group을 워크스페이스 role로 연결하는 매핑.

| 필드 | 타입 | 설명 |
|------|------|------|
| workspaceId | UUID | FK -> Workspace |
| scimGroupId | UUID | FK -> OrganizationScimGroup |
| role | String | `admin` \| `maintainer` \| `editor` \| `viewer` |

### WorkspaceScimProvisionedMember
특정 SCIM group source에서 생성된 워크스페이스 grant.

| 필드 | 타입 | 설명 |
|------|------|------|
| workspaceId | UUID | FK -> Workspace |
| userId | UUID | FK -> User |
| scimGroupId | UUID | FK -> OrganizationScimGroup |
| role | String | source grant role |

- 실제 접근은 `WorkspaceMember.managedByScim=true` row로 반영되고, source grant는 이 테이블에 별도로 추적됨

### Page
문서 페이지. 트리 구조 지원 (self-referencing).

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| title | String | 페이지 제목 (기본: "Untitled") |
| slug | String | URL 경로용 |
| icon | String? | 페이지 아이콘 (이모지) |
| coverImage | String? | 커버 이미지 URL 또는 CSS gradient |
| accessMode | String | `"workspace"` \| `"restricted"` |
| position | Int | 정렬 순서 |
| summary | String? | AI 생성 요약 |
| isDeleted | Boolean | 소프트 삭제 플래그 |
| deletedAt | DateTime? | 삭제 시각 |
| parentId | UUID? | FK -> Page (부모 페이지, 트리 구조) |
| workspaceId | UUID | FK -> Workspace |

- `@@unique([workspaceId, slug])` - 워크스페이스 내 고유 slug
- 인덱스: `workspaceId`, `parentId`, `[workspaceId, updatedAt]`, `[workspaceId, isDeleted]`

### PageEmbeddingChunk
시맨틱 검색을 위한 페이지 임베딩 청크.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| chunkIndex | Int | 청크 순서 |
| title | String | 청크 제목 |
| content | String | 청크 내용 |
| contentHash | String | 콘텐츠 해시 (변경 감지) |
| embedding | Json | 임베딩 벡터 |
| dimension | Int | 벡터 차원 |
| provider | String | 임베딩 provider |
| model | String | 임베딩 모델 |
| pageId | UUID | FK -> Page |
| workspaceId | UUID | FK -> Workspace |

- `@@unique([pageId, chunkIndex])` - 페이지당 청크 고유

### SearchIndexJob
시맨틱 검색 인덱싱 작업 큐.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| jobType | String | `"page_reindex"` \| `"workspace_reindex"` |
| status | String | `"pending"` \| `"running"` \| `"success"` \| `"error"` |
| attempts | Int | 시도 횟수 |
| lastError | String? | 마지막 오류 |
| workspaceId | UUID | FK -> Workspace |
| pageId | UUID? | FK -> Page |

### PagePermission
페이지 접근 제한 모드에서 허용된 사용자.

| 필드 | 타입 | 설명 |
|------|------|------|
| pageId | UUID | FK -> Page |
| userId | UUID | FK -> User |

### PageShareLink
페이지 공유 링크 (토큰 기반).

| 필드 | 타입 | 설명 |
|------|------|------|
| token | String | 고유 공유 토큰 |
| pageId | UUID | FK -> Page (1:1) |
| expiresAt | DateTime? | 만료 시각 |
| revokedAt | DateTime? | 폐기 시각 |

### Backlink
페이지 간 백링크 (`[[페이지명]]` 구문).

| 필드 | 타입 | 설명 |
|------|------|------|
| fromPageId | UUID | 링크를 포함하는 페이지 |
| toPageId | UUID | 링크 대상 페이지 |

- `@@unique([fromPageId, toPageId])` - 중복 방지

### Comment
스레드 기반 댓글 시스템.

| 필드 | 타입 | 설명 |
|------|------|------|
| content | String | 댓글 내용 |
| resolved | Boolean | 해결 여부 |
| pageId | UUID | FK -> Page |
| userId | UUID | FK -> User |
| parentId | UUID? | FK -> Comment (답글 스레드) |

### Attachment
파일 첨부.

| 필드 | 타입 | 설명 |
|------|------|------|
| filename | String | 원본 파일명 |
| mimeType | String | MIME 타입 |
| size | Int | 파일 크기 (bytes) |
| path | String | 저장 경로 (로컬 또는 S3 키) |
| storage | String | `"local"` \| `"s3"` |
| securityStatus | String | 스캔 결과 (`clean`, `blocked`, `bypassed`, `error`, `not_scanned`) |
| securityDisposition | String? | 운영 검토 결과 (`released`, `blocked`, `null`) |
| securityScanner | String? | 사용된 스캐너 정보 |
| securityFindings | Json? | 보안 스캔 결과 상세 |
| securityCheckedAt | DateTime? | 마지막 스캔 시각 |
| securityReviewedAt | DateTime? | 마지막 운영 검토 시각 |
| securityReviewedByUserId | UUID? | 마지막 검토 수행자 |
| securityReviewNote | String? | 운영 검토 메모 |
| pageId | UUID | FK -> Page |
| userId | UUID | FK -> User |

- `securityStatus=blocked`이면서 `securityDisposition != "released"`이면 다운로드가 `423 Attachment quarantined`로 막힘
- `securityDisposition="released"`는 스캔 결과를 지우지 않고, 운영자가 현재 차단 건을 예외 허용했다는 뜻

### Favorite
사용자별 페이지 즐겨찾기.

| 필드 | 타입 | 설명 |
|------|------|------|
| userId | UUID | FK -> User |
| pageId | UUID | FK -> Page |

- `@@unique([userId, pageId])` - 중복 방지

### AiChat
AI 채팅 히스토리.

| 필드 | 타입 | 설명 |
|------|------|------|
| role | String | `"user"` \| `"assistant"` |
| content | String | 메시지 내용 |
| pageId | String? | 관련 페이지 |
| workspaceId | String | 워크스페이스 |
| userId | String | 사용자 |

### CalendarEvent
워크스페이스 캘린더 이벤트.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| title | String | 이벤트 제목 |
| description | String? | 설명 |
| startAt | DateTime | 시작 시간 |
| endAt | DateTime? | 종료 시간 |
| allDay | Boolean | 종일 이벤트 여부 (기본: false) |
| color | String? | 표시 색상 (기본: `#3b82f6`) |
| location | String? | 위치 |
| recurrence | String? | 반복 규칙 |
| googleEventId | String? | Google Calendar 이벤트 ID (동기화용) |
| workspaceId | UUID | FK -> Workspace |
| createdById | UUID | FK -> User |
| pageId | UUID? | FK -> Page (연결된 페이지) |

- `@@index([workspaceId, startAt])` - 날짜 범위 조회 최적화
- `@@index([workspaceId, googleEventId])` - Google Calendar 동기화 조회

### Todo
TODO 항목.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| title | String | 제목 |
| description | String? | 설명 |
| completed | Boolean | 완료 여부 (기본: false) |
| priority | String | `"low"` \| `"medium"` \| `"high"` \| `"urgent"` (기본: medium) |
| dueDate | DateTime? | 마감일 |
| completedAt | DateTime? | 완료 시각 |
| sortOrder | Int | 정렬 순서 (기본: 0) |
| workspaceId | UUID | FK -> Workspace |
| assigneeId | UUID? | FK -> User (담당자) |
| createdById | UUID | FK -> User (생성자) |
| pageId | UUID? | FK -> Page (연결된 페이지) |

- `@@index([workspaceId, completed, dueDate])` - 필터링 최적화
- User와 두 가지 관계: `TodoAssignee` (담당자), `TodoCreator` (생성자)

### Notification
인앱 알림.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| type | String | 알림 유형 |
| title | String | 알림 제목 |
| message | String | 알림 메시지 |
| read | Boolean | 읽음 여부 (기본: false) |
| readAt | DateTime? | 읽음 시각 |
| link | String? | 관련 페이지 링크 |
| userId | UUID | FK -> User |
| workspaceId | UUID? | FK -> Workspace |

- `@@index([userId, read, createdAt])` - 미읽은 알림 조회 최적화

### GoogleCalendarConnection
Google Calendar OAuth 연결 정보.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| userId | UUID | FK -> User |
| workspaceId | UUID | FK -> Workspace |
| accessToken | String | OAuth access token (암호화) |
| refreshToken | String | OAuth refresh token (암호화) |
| tokenExpiry | DateTime | 토큰 만료 시각 |
| calendarId | String | Google Calendar ID (기본: `primary`) |
| syncEnabled | Boolean | 동기화 활성화 (기본: true) |
| lastSyncAt | DateTime? | 마지막 동기화 시각 |

- `@@unique([userId, workspaceId])` - 사용자+워크스페이스당 1개 연결

### PageTemplate
페이지 템플릿 (내장 + 커스텀).

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| name | String | 템플릿 이름 |
| description | String? | 설명 |
| icon | String? | 아이콘 |
| content | String (Text) | Markdown 콘텐츠 |
| category | String | `"meeting"` \| `"project"` \| `"journal"` \| `"custom"` (기본: custom) |
| isBuiltIn | Boolean | 내장 템플릿 여부 (기본: false) |
| workspaceId | UUID | FK -> Workspace |
| createdById | UUID | FK -> User |

- `@@index([workspaceId, category])` - 카테고리별 조회

### AuditLog
감사 로그.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| action | String | 액션 유형 |
| status | String | `"success"` \| `"denied"` \| `"error"` |
| requestId | String? | 요청 ID |
| actorId | String? | 수행자 ID |
| actorEmail | String? | 수행자 이메일 |
| actorName | String? | 수행자 이름 |
| actorRole | String? | 수행자 역할 |
| workspaceId | String? | 워크스페이스 ID |
| pageId | String? | 페이지 ID |
| targetId | String? | 대상 리소스 ID |
| targetType | String? | 대상 리소스 유형 |
| ipAddress | String? | 요청 IP |
| userAgent | String? | 요청 User-Agent |
| metadata | Json? | 추가 메타데이터 |

### WorkspaceSettings
워크스페이스별 설정 (1:1 관계).

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| aiEnabled | Boolean | true | AI 기능 활성화 |
| aiModel | String | claude-sonnet-4-20250514 | AI 모델 |
| aiApiKey | String? | - | 워크스페이스 전용 API 키 (암호화) |
| aiMaxTokens | Int | 2048 | 최대 토큰 수 |
| aiProfiles | Json? | - | AI 프로필 목록 (provider별 설정) |
| aiTaskRouting | Json? | - | AI 태스크별 프로필 라우팅 설정 |
| allowPublicPages | Boolean | true | 공개 페이지 허용 |
| allowMemberInvite | Boolean | true | 멤버 초대 허용 |
| defaultPageAccess | String | workspace | 기본 페이지 접근 모드 |
| maxFileUploadMb | Int | 10 | 최대 파일 업로드 크기 (MB) |
| uploadDlpScanMode | String? | - | 워크스페이스별 DLP 스캔 모드 오버라이드 |
| uploadDlpDetectors | Json? | - | 워크스페이스별 DLP 탐지기 오버라이드 |
| uploadDlpMaxExtractedCharacters | Int? | - | 워크스페이스별 DLP 추출 상한 오버라이드 |
| googleCalendarClientId | String? | - | Google Calendar OAuth Client ID |
| googleCalendarClientSecret | String? | - | Google Calendar OAuth Client Secret (암호화) |

### 운영/백업 모델

추가 운영 모델:
- **AuditLogWebhookDelivery** - 감사 로그 외부 webhook 전달 outbox
- **RetentionRun** / **RetentionRunWorkspace** - Retention 실행 이력
- **BackupRun** / **BackupArtifact** - 백업 실행 이력 및 아티팩트
- **RestoreDrillRun** - 복구 검증 실행 이력
- **SearchIndexWorkerRun** / **SearchIndexWorkerRunWorkspace** - 시맨틱 인덱싱 워커 실행 이력
