# AI 기능

## 개요

jpad는 멀티 프로바이더 AI를 통합하여 문서 작성, 편집, 검색을 보조합니다. 워크스페이스별로 여러 AI 프로필을 등록하고, 태스크 유형별로 라우팅할 수 있습니다.

---

## 멀티 프로바이더 아키텍처

### 지원 프로바이더

| 프로바이더 | 식별자 | 완성 | 임베딩 |
|-----------|--------|------|--------|
| Anthropic | `anthropic` | O | X |
| OpenAI | `openai` | O | O |
| Google Gemini | `gemini` | O | O |
| Ollama | `ollama` | O | O |
| OpenAI Compatible | `openai-compatible` | O | O |

### 프로바이더 연결

각 프로바이더별 네이티브 REST API를 직접 호출합니다 (`src/lib/llmProviders.ts`).

- **Anthropic** - `/v1/messages` (x-api-key 헤더, anthropic-version)
- **OpenAI / OpenAI-compatible** - `/v1/chat/completions` (Bearer 토큰)
- **Gemini** - `/v1beta/models/{model}:generateContent` (API key 쿼리 파라미터)
- **Ollama** - `/api/chat` (로컬 기본 `http://localhost:11434`)

### API 키 우선순위

1. 프로필에 설정된 워크스페이스 전용 API 키 (AES-256-GCM 암호화 저장)
2. 환경 변수 폴백:
   - Anthropic: `ANTHROPIC_API_KEY`
   - OpenAI/OpenAI-compatible: `OPENAI_API_KEY`
   - Gemini: `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY`
   - Ollama: `OLLAMA_API_KEY`

---

## 워크스페이스 AI 프로필

`WorkspaceAiProfile` (`src/lib/aiConfig.ts`) 구조로 프로바이더별 프로필을 관리합니다.

### 프로필 설정 항목

| 항목 | 설명 |
|------|------|
| `id` | 프로필 고유 ID |
| `name` | 프로필 이름 |
| `provider` | 프로바이더 유형 |
| `enabled` | 활성화 여부 |
| `model` | 모델명 (예: `claude-sonnet-4-20250514`) |
| `apiKey` | 워크스페이스 전용 API 키 (암호화) |
| `baseUrl` | 커스텀 엔드포인트 URL |
| `temperature` | 생성 온도 (0~2) |
| `topP`, `topK` | 샘플링 파라미터 |
| `maxTokens` | 최대 응답 토큰 (기본: 2048) |
| `presencePenalty`, `frequencyPenalty` | 반복 패널티 |
| `repeatPenalty` | Ollama용 반복 패널티 |
| `seed` | 재현성을 위한 시드 |
| `stop` | 정지 시퀀스 (최대 8개) |

### 태스크 라우팅

`WorkspaceAiTaskRouting` (`src/lib/aiConfig.ts`)을 통해 태스크 유형별로 다른 프로필을 지정할 수 있습니다.

| 태스크 | 용도 |
|--------|------|
| `general` | 기본 폴백 프로필 |
| `write` | 문서 작성/변환 (요약, 확장, 번역 등) |
| `chat` | AI 채팅 |
| `summary` | 페이지 요약 |
| `autocomplete` | 이어쓰기 |
| `embedding` | 시맨틱 검색용 임베딩 |

라우팅 해결 순서 (`resolveAiProfileForTask`):
1. 해당 태스크에 지정된 프로필
2. `general` 태스크의 프로필
3. 첫 번째 활성 프로필
4. 첫 번째 프로필

---

## API 엔드포인트

### 1. AI 텍스트 처리 (`POST /api/ai/write`)

선택한 텍스트에 대해 7가지 AI 작업을 수행합니다.

| 액션 | 설명 | 프롬프트 |
|------|------|----------|
| `summarize` | 텍스트 요약 | 핵심 포인트 3~5개 추출 |
| `expand` | 텍스트 확장 | 상세 내용 및 예시 추가 |
| `translate` | 번역 | 지정 언어로 변환 (영어/일본어/중국어/한국어) |
| `fixGrammar` | 문법 교정 | 맞춤법, 문법, 구두점 수정 |
| `changeTone` | 톤 변경 | 격식체/친근한/전문적 톤으로 재작성 |
| `explain` | 쉽게 풀기 | 간단한 용어로 설명 |
| `actionItems` | 액션 아이템 | 할 일 목록을 번호 리스트로 추출 |

- `text`가 없으면 `pageId`로 Git 저장소에서 페이지 콘텐츠를 읽어 사용
- `options.targetLang`으로 번역 대상 언어, `options.tone`으로 톤 지정
- Rate limit: 사용자당 20회/분

### 2. AI 스트리밍 (`POST /api/ai/stream`)

`/api/ai/write`와 동일한 액션을 SSE(Server-Sent Events) 형식으로 스트리밍합니다.

- 응답: `text/event-stream`
- 각 청크: `data: {"text": "..."}`
- 종료: `data: [DONE]`
- Rate limit: 사용자당 20회/분

### 3. AI 요약 (`POST /api/ai/summary`)

페이지 전체 콘텐츠를 요약하여 DB의 `Page.summary` 필드에 저장합니다.

- 입력: `pageId`
- Git 저장소에서 페이지 콘텐츠를 읽어 요약 생성
- `AiSummaryBadge` 컴포넌트에서 접기/펼치기 표시
- Rate limit: 사용자당 10회/분

### 4. AI 채팅 (`POST /api/ai/chat`)

컨텍스트 기반 대화형 AI 어시스턴트.

- `usePageContext: true` - 해당 페이지만 컨텍스트로 사용
- `usePageContext: false` - 워크스페이스 전체 문서에서 시맨틱 검색으로 관련 문서 6개를 찾아 컨텍스트 구성 (폴백: 최근 수정된 10개 페이지)
- 대화 히스토리: 최근 6턴 유지 (`history` 파라미터)
- DB 저장: `AiChat` 모델에 사용자/어시스턴트 메시지 저장
- Rate limit: 사용자당 10회/분

### 5. AI 이어쓰기 (`POST /api/ai/autocomplete`)

커서 위치까지의 텍스트를 기반으로 자연스럽게 이어 씁니다.

- 입력: `text` (커서까지의 마크다운) 또는 `pageId`
- 최대 8000자의 끝부분을 컨텍스트로 사용
- 응답: 이어쓴 마크다운 텍스트 (최대 768 토큰)
- Rate limit: 사용자당 20회/분

---

## UI 컴포넌트

### AiPanel (`src/components/ai/AiPanel.tsx`)

페이지 편집 화면 우측에 표시되는 AI 패널. 2개 탭으로 구성됩니다.

#### 글쓰기 도우미 탭

- 3개 그룹으로 분류된 7가지 액션 버튼:
  - **변환** - 요약, 확장, 쉽게 풀기
  - **교정** - 문법 교정, 톤 변경 (격식체/친근한/전문적)
  - **추출** - 번역 (영어/일본어/중국어/한국어), 액션 아이템
- 입력 텍스트 접기/펼치기 (비워두면 페이지 전체 콘텐츠 사용)
- 결과 영역: 스트리밍 표시, 에디터 삽입, 클립보드 복사
- SSE 스트리밍 응답 지원

#### AI 채팅 탭

- 메시지 입력 (Ctrl+Enter 전송)
- 페이지 컨텍스트 사용 토글
- 대화 초기화 버튼
- sessionStorage 기반 히스토리 유지 (페이지별)
- 스트리밍 응답 시 실시간 타이핑 표시

#### 이벤트 연동

- `ai:execute-action` - 슬래시 메뉴에서 AI 액션 실행 시 글쓰기 도우미 탭으로 전환
- `ai:inline-action` - 인라인 플로팅 툴바에서 선택 텍스트와 함께 액션 실행

### AiSummaryBadge (`src/components/ai/AiSummaryBadge.tsx`)

- 페이지 상단 요약 배지 (접기/펼치기)
- "요약 생성" / "요약 갱신" 버튼
- 로딩 상태 표시

---

## 에디터 내 AI 통합 (`src/components/editor/CollaborativeEditor.tsx`)

### 슬래시 메뉴 AI 명령어

`/` 입력 시 AI 그룹에 7개 명령어가 표시됩니다:

| 명령어 | 동작 |
|--------|------|
| AI 이어쓰기 | `ai:autocomplete` 이벤트 발생 |
| AI 요약 | `ai:action` + `summarize` |
| AI 확장 | `ai:action` + `expand` |
| AI 문법 교정 | `ai:action` + `fixGrammar` |
| AI 번역 (영어) | `ai:action` + `translate` |
| AI 톤 변경 | `ai:action` + `changeTone` |
| AI 액션 아이템 | `ai:action` + `actionItems` |

### 인라인 AI 플로팅 툴바

텍스트를 2자 이상 선택하면 선택 영역 위에 플로팅 툴바가 표시됩니다:

- AI 요약, AI 확장, AI 번역, AI 교정
- 클릭 시 `ai:inline-action` 이벤트로 선택 텍스트를 AiPanel에 전달

### 커서 기반 이어쓰기 (CursorContext)

`CursorContext` 인터페이스로 커서 위치 정보를 추적합니다:

```typescript
interface CursorContext {
  blockId: string;      // 현재 커서가 있는 블록 ID
  textBefore: string;   // 커서 블록까지의 마크다운
}
```

- 커서 위치가 변경될 때마다 `onCursorContextChange` 콜백으로 컨텍스트 전달
- `Ctrl+J` 단축키로 `ai:autocomplete` 이벤트 발생
- `Ctrl+Shift+J`로 AI 패널 열기

### 우클릭 컨텍스트 메뉴

AI 그룹에 4개 명령어:
- AI 이어쓰기 (`Ctrl+J`)
- AI 요약
- AI 확장
- AI 문법 교정

---

## 워크스페이스 AI 설정

워크스페이스 설정 페이지의 "AI/고급" 탭에서 관리합니다.

### 기본 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `aiEnabled` | `true` | AI 기능 활성화 여부 |
| `aiMaxTokens` | `2048` | 기본 최대 응답 토큰 |

### 프로필 관리

- 프로필 추가/수정/삭제
- 프로바이더 선택 (5종)
- 모델 목록 조회 (연결 테스트)
- API 키 입력 (비밀번호 필드, AES-256-GCM 암호화)
- 고급 파라미터 설정 (temperature, topP, topK, 패널티 등)

### 태스크 라우팅 설정

- 태스크별 프로필 지정 드롭다운
- 미지정 태스크는 `general` 프로필로 폴백

### API 키 보안

- owner가 아닌 사용자에게는 API 키 마스킹 (`••••••••`)
- API 키 변경은 owner만 가능
- 프로필별 워크스페이스 API 키가 없으면 환경 변수 폴백
- 공개 뷰어(public viewer)는 AI 사용 불가

---

## Rate Limiting

모든 AI 엔드포인트에 Redis 기반 요청 제한이 적용됩니다:

| 엔드포인트 | 제한 |
|-----------|------|
| `/api/ai/write` | 20회/분 |
| `/api/ai/stream` | 20회/분 |
| `/api/ai/autocomplete` | 20회/분 |
| `/api/ai/chat` | 10회/분 |
| `/api/ai/summary` | 10회/분 |

---

## 감사 로그

모든 AI 작업은 감사 로그에 기록됩니다:

- `ai.write.completed` - 텍스트 처리 완료
- `ai.chat.completed` - 채팅 완료 (시맨틱 매칭 수 포함)
- `ai.summary.completed` - 요약 생성 완료
- `ai.autocomplete.completed` - 이어쓰기 완료
