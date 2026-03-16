---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
---

# React 컴포넌트 규칙

## 스타일링
- CSS 변수 사용: `var(--background)`, `var(--border)`, `var(--primary)`, `var(--muted)`, `var(--foreground)`, `var(--sidebar-bg)`, `var(--sidebar-hover)`
- 하드코딩 색상 금지 (`#fff`, `#fef2f2`, `bg-blue-50` 등)
- 상태 표시 색상은 예외 허용: `#ef4444`(에러), `#22c55e`(성공), `rgba()`

## 접근성
- 모든 모달: `role="dialog"`, `aria-modal="true"`, ESC 닫기
- 클릭 가능 div: `role="button"`, `tabIndex={0}`, `onKeyDown`(Enter/Space)
- 아이콘 버튼: `aria-label` 또는 `title`
- treeitem: `aria-selected` 필수

## 반응형
- 고정 폭 패널: `max-w-full` 추가
- 모바일 패딩: `px-4 md:px-8 lg:px-16`
- 많은 버튼: md 미만에서 "더보기" 드롭다운

## React 패턴
- useEffect 의존성 배열 정확하게
- 이벤트 리스너는 cleanup에서 반드시 제거
- 큰 계산은 useMemo로 감싸기
