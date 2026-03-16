# Git 기반 버전 관리

## 개요

모든 문서 콘텐츠는 Git 저장소에 저장됩니다. `isomorphic-git` 라이브러리를 사용하여 순수 JavaScript로 Git 작업을 수행합니다 (네이티브 git 바이너리 불필요).

## 저장소 구조

```
data/repos/
└── {workspaceId}/           # 워크스페이스별 독립 Git 저장소
    ├── .git/                # Git 내부 데이터
    ├── README.md            # 초기 커밋으로 생성
    ├── {slug-1}.md          # 페이지 콘텐츠 (Markdown, slug 기반 파일명)
    ├── {slug-2}.md
    └── ...
```

파일명은 페이지 ID가 아닌 **slug** 기반입니다. 저장소 경로는 `process.cwd() + "/data/repos/"` 아래에 워크스페이스 ID별로 생성됩니다.

## 핵심 모듈 (`src/lib/git/repository.ts`)

### 주요 함수

| 함수 | 설명 |
|------|------|
| `initRepo(workspaceId)` | 워크스페이스 Git 저장소 초기화. README.md로 초기 커밋 생성 |
| `savePage(workspaceId, slug, content, authorName, message?)` | 페이지 콘텐츠를 `{slug}.md`에 쓰고 git add + commit |
| `readPage(workspaceId, slug)` | 파일시스템에서 `{slug}.md` 읽기 |
| `getPageHistory(workspaceId, slug)` | 해당 파일이 포함된 커밋 이력 조회 (oid, message, author, timestamp) |
| `getPageAtCommit(workspaceId, slug, oid)` | 특정 커밋 시점의 파일 콘텐츠 읽기 (`git.readBlob`) |
| `deletePage(workspaceId, slug, authorName)` | 파일 삭제 + git remove + commit |

### 커밋 흐름

```
1. 에디터 변경 감지
2. BlockNote → Markdown 직렬화
3. PUT /api/pages/{pageId}/content
4. requireAuth() + getPageAccessContext() → canEdit 확인
5. 콘텐츠 크기 검사 (최대 1MB)
6. savePage() 호출 → withLock(workspaceId:slug) 획득
7. fs.writeFile("{slug}.md", content)
8. git add {slug}.md
9. git commit -m "Update {slug}" (author: 사용자 이름)
10. 잠금 해제
11. 백링크 인덱싱: [[페이지명]] 파싱 → slug/title 기준 매칭 → Backlink 테이블 업데이트 (트랜잭션)
12. 페이지 updatedAt 갱신
13. 시맨틱 검색 인덱스 재인덱싱 큐 등록 (비동기)
```

### 히스토리 API

```
GET /api/pages/{pageId}/history
   → requireAuth() + getPageAccessContext() → canView 확인
   → getPageHistory(workspaceId, slug)
   → 각 커밋의 oid, message, author, timestamp 반환

GET /api/pages/{pageId}/history?oid={commitSha}
   → getPageAtCommit(workspaceId, slug, oid)
   → 해당 커밋 시점의 콘텐츠 반환
```

### 콘텐츠 복원

```
HistoryPanel에서 특정 커밋 선택
   → getPageAtCommit(workspaceId, slug, oid)
   → 에디터에 콘텐츠 적용
   → 새로운 커밋으로 저장 (되돌리기가 아닌 새 커밋)
```

### 콘텐츠 읽기 API

```
GET /api/pages/{pageId}/content
   → requireAuth() + getPageAccessContext() → canView 확인
   → readPage(workspaceId, slug)
   → { content, role } 반환 (role: 사용자의 워크스페이스 역할)
```

## 동시성 제어

### Redis 분산 잠금 (`src/lib/git/lock.ts`)

Git 저장소는 동시 쓰기에 안전하지 않으므로, **워크스페이스:slug** 단위로 분산 잠금을 사용합니다.

- **잠금 범위:** `{workspaceId}:{slug}` 기준 (`lock:git:{workspaceId}:{slug}`)
- **잠금 방식:** Redis `SET NX PX` (원자적 획득)
- **해제 방식:** Lua 스크립트 (토큰 검증 + DEL 원자적 실행)
- **TTL:** 10초 (프로세스 크래시 시 자동 해제)
- **재시도:** 50ms 간격, 최대 100회 (총 5초)
- **로컬 큐:** 같은 프로세스 내 동일 키 요청은 큐로 직렬화하여 Redis 호출 최소화

```typescript
// 잠금 사용 패턴
await withLock(workspaceId + ":" + slug, async () => {
  // Git 작업 수행 (쓰기)
});
```

## 백링크 인덱싱

콘텐츠 저장 시 `[[페이지명]]` 구문을 파싱하여 `Backlink` 테이블에 인덱싱합니다.

```
콘텐츠 저장
   → parseBacklinks(content): [[식별자]] 추출
   → slug 또는 title로 대상 페이지 매칭 (slug 우선, title 단일 매칭)
   → 트랜잭션: 기존 백링크 삭제 → 새 백링크 생성
   → Backlink 테이블 업데이트
```

## 내보내기

`GET /api/pages/{pageId}/export`로 페이지를 Markdown 파일로 다운로드할 수 있습니다.

- Content-Type: `text/markdown`
- Content-Disposition: `attachment; filename="{title}.md"`
- Git 저장소에서 최신 콘텐츠 직접 읽기
