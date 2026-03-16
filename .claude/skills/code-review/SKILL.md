---
name: code-review
description: 코드 리뷰 — 타입 안전, 에러 처리, 패턴 일관성, 성능 점검
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
---

# Code Review

코드 품질을 점검합니다.

사용법: `/code-review` 또는 `/code-review src/components/editor`

$ARGUMENTS가 있으면 해당 경로만, 없으면 `git diff HEAD~1 --name-only`로 최근 변경 파일만 리뷰합니다.

## 점검 항목

### 1. TypeScript 타입 안전
- `any` 사용 여부
- `as unknown as` unsafe cast 여부
- `Record<string, unknown>` 대신 Prisma 타입 사용 권장

### 2. 에러 처리
- try/catch에서 에러를 무시하는 곳 (`catch {}`, `catch { }`)
- catch에서 모든 에러를 401로 반환하는 패턴
- `console.error` 대신 `logError()` 사용 여부
- fetch 호출에 `.catch` 또는 에러 처리가 있는지

### 3. React 패턴
- useEffect 의존성 배열 검증
- 이벤트 리스너 cleanup 확인
- useMemo/useCallback 적절 사용 여부
- 불필요한 리렌더링 유발 패턴

### 4. 스타일 일관성
- 하드코딩 색상 (`#fff`, `#fef2f2` 등) 대신 CSS 변수 사용 여부
- inline style과 Tailwind 클래스 혼용 패턴의 일관성
- 한/영 에러 메시지 혼용 여부

### 5. 성능
- N+1 쿼리 패턴
- 대량 데이터에 대한 페이지네이션 누락
- 불필요한 API 호출
- 큰 컴포넌트에서 useMemo 미사용

### 6. 접근성
- 클릭 가능 요소에 role, tabIndex, 키보드 핸들러 여부
- 모달에 role="dialog", aria-modal 여부
- img/아이콘에 aria-label 여부

## 출력 형식

```
[파일:라인] [카테고리] 설명
```

심각도별 분류: Error(즉시 수정) / Warning(권장) / Info(개선 가능)
