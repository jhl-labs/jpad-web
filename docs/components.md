# 컴포넌트 구조

## 페이지 레이아웃

### `WorkspaceLayout` (`src/app/(main)/workspace/[workspaceId]/layout.tsx`)
워크스페이스 공통 레이아웃. 사이드바 + 메인 콘텐츠 영역.

- 인증 상태 확인 (미인증 시 `/login` 리다이렉트)
- 워크스페이스/페이지/즐겨찾기 데이터 로드
- 사이드바 토글 (모바일 기본 숨김)
- `Cmd+K` / `Ctrl+K` 검색 단축키
- `sidebar:refresh` 이벤트로 사이드바 자동 갱신

### `PageEditorPage` (`src/app/(main)/workspace/[workspaceId]/page/[pageId]/page.tsx`)
페이지 편집 화면.

**구성:**
- 툴바: AI, 즐겨찾기, 댓글, 히스토리, 그래프, 내보내기, 공유 버튼
- 브레드크럼: 워크스페이스 -> 상위 페이지 -> 현재 페이지
- 커버 이미지: 이미지 URL 또는 CSS gradient
- 아이콘: 이모지 (EmojiPicker)
- 제목: 인라인 편집 (500ms 디바운스 저장)
- 에디터: CollaborativeEditor (BlockNote + Yjs)
- 하단 패널: BacklinkPanel, AttachmentPanel, RelatedPagesPanel
- 사이드 패널: HistoryPanel, CommentPanel, AiPanel
- 다이얼로그: ShareDialog

### `WorkspaceListPage` (`src/app/(main)/workspace/page.tsx`)
워크스페이스 목록 페이지.
- 워크스페이스 생성/선택
- Public/Private 뱃지 표시
- 설명, 페이지 수, 멤버 수 표시

### `UserSettingsPage` (`src/app/(main)/workspace/[workspaceId]/user-settings/page.tsx`)
사용자 개인 설정 페이지. 6개 탭:

1. **프로필**: 이름 변경, 이메일 표시, 비밀번호 변경
2. **테마**: 라이트/다크/시스템 테마 전환
3. **데이터**: 내 워크스페이스 데이터 내보내기/가져오기
4. **알림**: 알림 설정 관리
5. **정보**: 앱 버전 및 라이선스 정보
6. **고급**: 계정 관련 고급 설정

### `WorkspaceSettingsPage` (`src/app/(main)/workspace/[workspaceId]/settings/page.tsx`)
워크스페이스 관리 설정 페이지. 3개 탭:

1. **일반**: 이름, 설명, 공개 범위 (Public/Private)
2. **멤버**: 초대, 역할 변경, 제거, 권한 매트릭스 표시
3. **AI/고급**: AI 프로필/태스크 라우팅, 모델 선택, 연결 테스트, 시맨틱 검색 설정, Google Calendar 자격증명, DLP 설정

### `CalendarPage` (`src/app/(main)/workspace/[workspaceId]/calendar/page.tsx`)
워크스페이스 캘린더 페이지.

### `TodosPage` (`src/app/(main)/workspace/[workspaceId]/todos/page.tsx`)
워크스페이스 TODO 관리 페이지.

### `DailyNotePage` (`src/app/(main)/workspace/[workspaceId]/daily/page.tsx`)
데일리 노트 페이지. 날짜 선택 시 해당 데일리 노트로 이동 또는 자동 생성.

### `GraphPage` (`src/app/(main)/workspace/[workspaceId]/graph/page.tsx`)
지식 그래프 전체 뷰 페이지.

---

## 에디터 컴포넌트

### `CollaborativeEditor` (`src/components/editor/CollaborativeEditor.tsx`)
실시간 협업 에디터 (동적 import, SSR 비활성화).

**구조:**
- `CollaborativeEditor` (외부): Yjs Doc/Provider 생성 및 관리, 타이틀 동기화 (`pageMeta` Yjs map)
- `InnerEditor` (내부): BlockNote 에디터 마운트, 슬래시 메뉴, 자동 저장, 커서 컨텍스트 추적

**Props:**
| Prop | 타입 | 설명 |
|------|------|------|
| pageId | string | 페이지 ID |
| workspaceId | string | 워크스페이스 ID |
| initialContent | string | 초기 Markdown 콘텐츠 |
| readOnly | boolean | 읽기 전용 모드 |
| resetVersion | number | 에디터 리셋 트리거 |
| pendingInsertMarkdown | object \| null | AI 결과 삽입 요청 |
| onSave | (markdown: string) => Promise<void> | 저장 콜백 |
| onSaveStatusChange | (status: SaveStatus) => void | 저장 상태 변경 콜백 |
| onRemoteTitleChange | (title: string) => void | 원격 타이틀 변경 수신 |
| onCursorContextChange | (context: CursorContext \| null) => void | 커서 컨텍스트 변경 |
| title | string | 현재 타이틀 (Yjs 동기화용) |

**기능:**
- BlockNote + Yjs 연결
- WebSocket 토큰 발급 및 연결
- 자동 저장 (2초 디바운스)
- 저장 상태 표시 (idle/saving/saved/error)
- 슬래시 메뉴: AI 명령 (이어쓰기, 요약, 확장, 교정, 번역, 톤 변경, 액션 아이템) + 유틸리티 (구분선, 콜아웃, 날짜/시간 삽입)
- 인라인 AI 플로팅 툴바: 텍스트 선택 시 요약/확장/번역/교정 버튼 표시
- 우클릭 컨텍스트 메뉴: 편집/변환/AI 그룹
- `Ctrl+J` / `Cmd+J`: AI 이어쓰기 단축키
- `Ctrl+Shift+J` / `Cmd+Shift+J`: AI 패널 열기
- 커서 컨텍스트 추적 (blockId + textBefore)
- 타이틀 동기화: Yjs `pageMeta` 맵을 통한 실시간 타이틀 전파

### `BacklinkPanel` (`src/components/editor/BacklinkPanel.tsx`)
현재 페이지를 참조하는 백링크 목록 표시.

### `BacklinkSuggestion` (`src/components/editor/BacklinkSuggestion.tsx`)
에디터에서 `[[` 입력 시 페이지 자동완성 제안.

### `AttachmentPanel` (`src/components/editor/AttachmentPanel.tsx`)
페이지 첨부파일 목록. 업로드/다운로드/삭제.

### `CommentPanel` (`src/components/editor/CommentPanel.tsx`)
스레드 기반 댓글 패널. 작성, 답글, 해결, 삭제.

### `HistoryPanel` (`src/components/editor/HistoryPanel.tsx`)
Git 커밋 히스토리 패널. 특정 버전 미리보기 및 복원.

### `RelatedPagesPanel` (`src/components/editor/RelatedPagesPanel.tsx`)
시맨틱 유사도 기반 관련 페이지 추천 패널.

### `TableOfContents` (`src/components/editor/TableOfContents.tsx`)
문서 내 제목(heading) 기반 자동 목차 생성.

### `EmojiPicker` (`src/components/editor/EmojiPicker.tsx`)
페이지 아이콘용 이모지 선택기.

### `CoverPicker` (`src/components/editor/CoverPicker.tsx`)
커버 이미지 선택기 (그라디언트, 이미지 URL, 파일 업로드).

### `ImportModal` (`src/components/editor/ImportModal.tsx`)
외부 Markdown 파일 가져오기 모달.

### `WordCount` (`src/components/editor/WordCount.tsx`)
에디터 하단에 글자 수, 단어 수, 예상 읽기 시간을 표시하는 컴포넌트.
- 한국어/영어 혼합 단어 수 계산
- 읽기 시간 추정 (WPM 기반)

---

## 사이드바 컴포넌트

### `Sidebar` (`src/components/sidebar/Sidebar.tsx`)
메인 사이드바. 페이지 트리 + 즐겨찾기 + 네비게이션.

**기능:**
- 워크스페이스 정보 표시
- 즐겨찾기 섹션
- 계층 페이지 트리 (접기/펼치기)
- 컨텍스트 메뉴 (우클릭)
  - 새 탭에서 열기
  - 링크 복사
  - 이름 바꾸기 (인라인 편집)
  - 복제 (콘텐츠 포함)
  - 하위 페이지 추가
  - 즐겨찾기 토글
  - 삭제
- 페이지 생성/삭제
- 워크스페이스 설정 링크
- 캘린더, TODO, 데일리 노트, 그래프 뷰 바로가기
- 검색 단축키 표시
- 휴지통 패널 토글
- 페이지 아이콘(이모지) 표시

### `TrashPanel` (`src/components/sidebar/TrashPanel.tsx`)
삭제된 페이지 목록. 복원/영구 삭제.

---

## AI 컴포넌트

### `AiPanel` (`src/components/ai/AiPanel.tsx`)
AI 기능 패널. 2개 탭: 글쓰기 도우미 + AI 채팅.

**글쓰기 도우미:**
- 텍스트 액션 그룹: 변환 (요약/확장/설명), 교정 (문법 교정/톤 변경), 추출 (번역/액션 아이템)
- 입력 텍스트 접기/펼치기
- SSE 스트리밍 결과 표시
- 결과 에디터 삽입 / 클립보드 복사
- 슬래시 메뉴 AI 액션 수신 (`ai:execute-action` 이벤트)
- 인라인 AI 액션 수신 (`ai:inline-action` 이벤트)

**AI 채팅:**
- 메시지 입력 → AI 응답 (SSE 스트리밍)
- 페이지 컨텍스트 사용 토글
- 대화 히스토리: `sessionStorage`에 페이지별 저장
- 대화 초기화 버튼
- `Ctrl+Enter`로 전송

### `AiSummaryBadge` (`src/components/ai/AiSummaryBadge.tsx`)
페이지 상단에 표시되는 AI 요약 배지.
- 요약이 있으면 접기/펼치기 표시
- "요약 생성" / "요약 갱신" 버튼
- 요약 생성 중 로딩 상태

---

## 캘린더 컴포넌트

### `CalendarView` (`src/components/calendar/CalendarView.tsx`)
워크스페이스 캘린더 뷰.
- 이벤트 생성/수정/삭제
- 날짜 범위 필터링
- 이벤트-페이지 연결
- Google Calendar 동기화 트리거

---

## TODO 컴포넌트

### `TodoList` (`src/components/todos/TodoList.tsx`)
워크스페이스 TODO 관리 뷰.
- TODO 생성/수정/삭제
- 완료 토글
- 우선순위 (low/medium/high/urgent)
- 담당자 지정
- 마감일 설정
- 페이지 연결
- 필터링 (완료 여부, 담당자, 우선순위)

---

## 알림 컴포넌트

### `NotificationBell` (`src/components/notifications/NotificationBell.tsx`)
인앱 알림 벨 아이콘.
- 미읽은 알림 카운트 배지
- 알림 목록 드롭다운
- 개별/전체 읽음 처리
- 알림 링크 클릭 시 해당 페이지로 이동

---

## 템플릿 컴포넌트

### `TemplatePickerModal` (`src/components/templates/TemplatePickerModal.tsx`)
페이지 생성 시 템플릿 선택 모달.
- 내장 템플릿 + 커스텀 템플릿
- 카테고리별 필터링

---

## 그래프 컴포넌트

### `GraphView` (`src/components/graph/GraphView.tsx`)
백링크 기반 페이지 관계 그래프 시각화 (Canvas/SVG).

### `KnowledgeGraph` (`src/components/graph/KnowledgeGraph.tsx`)
지식 그래프 시각화. 부모-자식 관계 + 백링크 엣지 모두 표시.

---

## UI 컴포넌트

### `Breadcrumb` (`src/components/ui/Breadcrumb.tsx`)
경로 표시 (워크스페이스 -> 상위 페이지 -> 현재 페이지).

### `SearchModal` (`src/components/ui/SearchModal.tsx`)
전역 검색 모달 (`Cmd+K`). 페이지 제목/콘텐츠 검색.

### `QuickSwitcher` (`src/components/ui/QuickSwitcher.tsx`)
빠른 페이지 전환. `Cmd+K` 단축키로 실행.

### `KeyboardShortcutsHelp` (`src/components/ui/KeyboardShortcutsHelp.tsx`)
키보드 단축키 도움말 모달.

### `OnboardingChecklist` (`src/components/ui/OnboardingChecklist.tsx`)
신규 사용자 온보딩 체크리스트 컴포넌트.

### `FeedbackModal` (`src/components/ui/FeedbackModal.tsx`)
GitHub Issues 연동 피드백 모달. 버그 제보, 기능 요청, 기타 피드백 유형 선택.
- 환경 정보 자동 수집 (User Agent, 화면 크기, URL 등)
- Issue 템플릿(bug_report.md, feature_request.md) 연동

### `AppLogo` (`src/components/ui/AppLogo.tsx`)
애플리케이션 로고 컴포넌트.

### `Skeleton` (`src/components/ui/Skeleton.tsx`)
로딩 스켈레톤 UI.

### `FormLayout` (`src/components/ui/FormLayout.tsx`)
설정 페이지용 폼 레이아웃 컴포넌트. Section, Field, Row 서브 컴포넌트 제공.

---

## 기타 컴포넌트

### `ShareDialog` (`src/components/workspace/ShareDialog.tsx`)
페이지 공유 다이얼로그. 공유 링크 생성/복사/폐기.

### `WorkspaceAiSettingsTab` (`src/components/workspace/WorkspaceAiSettingsTab.tsx`)
워크스페이스 AI 설정 탭. 프로필/태스크 라우팅, 모델 선택, 연결 테스트, 시맨틱 검색 상태.

### `ReadOnlyDocument` (`src/components/public/ReadOnlyDocument.tsx`)
공유 링크/위키용 읽기 전용 문서 뷰어.

### `OpsDashboard` (`src/components/admin/OpsDashboard.tsx`)
플랫폼 운영 대시보드 (전역 관리자용).

### `OrganizationsPageClient` (`src/components/organizations/OrganizationsPageClient.tsx`)
조직 관리 페이지 클라이언트 컴포넌트.

### `LoginPageClient` (`src/components/auth/LoginPageClient.tsx`)
로그인 페이지 클라이언트 (Credentials + OIDC/SAML SSO 버튼).

### `RegisterPageClient` (`src/components/auth/RegisterPageClient.tsx`)
회원가입 페이지 클라이언트.

### `GitSyncStatusIndicator` (`src/components/sidebar/GitSyncStatusIndicator.tsx`)
사이드바 Git 동기화 상태 표시.

### `WorkspaceGitSyncTab` (`src/components/workspace/WorkspaceGitSyncTab.tsx`)
워크스페이스 Git 동기화 설정 탭.

### `InfrastructureDashboard` (`src/components/admin/InfrastructureDashboard.tsx`)
인프라 컴포넌트 관리 대시보드.

### `CustomHeadersInput` (`src/components/workspace/CustomHeadersInput.tsx`)
AI 프로필 커스텀 헤더 JSON 입력.

### `Providers` (`src/components/Providers.tsx`)
NextAuth SessionProvider 등 전역 Provider 래퍼.

### `ServiceWorkerRegistration` (`src/components/ServiceWorkerRegistration.tsx`)
Service Worker 등록 컴포넌트.

---

## 크로스 컴포넌트 통신

Next.js App Router에서 layout과 page 간 직접 props 전달이 불가능하므로, 커스텀 DOM 이벤트를 사용합니다.

### `sidebar:refresh` 이벤트
- **발신:** PageEditorPage (제목/아이콘 변경 시)
- **수신:** WorkspaceLayout (사이드바 데이터 재로드)

### `ai:autocomplete` 이벤트
- **발신:** CollaborativeEditor (슬래시 메뉴, `Ctrl+J` 단축키)
- **수신:** PageEditorPage (AI 이어쓰기 실행)

### `ai:action` 이벤트
- **발신:** CollaborativeEditor (슬래시 메뉴 AI 액션)
- **수신:** AiPanel (해당 액션 실행)

### `ai:inline-action` 이벤트
- **발신:** CollaborativeEditor (인라인 AI 플로팅 툴바)
- **수신:** AiPanel (선택된 텍스트로 액션 실행)

### `ai:open-panel` 이벤트
- **발신:** CollaborativeEditor (`Ctrl+Shift+J` 단축키)
- **수신:** PageEditorPage (AI 패널 열기)

```typescript
// 발신 (page.tsx)
window.dispatchEvent(new Event("sidebar:refresh"));

// 수신 (layout.tsx)
window.addEventListener("sidebar:refresh", () => {
  fetchPages();
  fetchFavorites();
});
```
