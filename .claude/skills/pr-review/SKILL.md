---
name: pr-review
description: PR 코드 리뷰 — diff 분석, 보안/품질/테스트 체크리스트
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob
---

# PR Review

Pull Request를 리뷰합니다.

사용법: `/pr-review 123` 또는 `/pr-review` (현재 브랜치의 diff)

$ARGUMENTS가 PR 번호이면 `gh pr diff $ARGUMENTS`로, 없으면 `git diff master...HEAD`로 diff를 가져옵니다.

## 리뷰 체크리스트

### 필수 (머지 차단)
- [ ] TypeScript 타입 에러 없음 (`tsc --noEmit`)
- [ ] lint 에러 없음 (`bun run lint`)
- [ ] 새 API 라우트에 `requireAuth()` 있음
- [ ] 시크릿/비밀번호 하드코딩 없음
- [ ] SQL injection / XSS 가능한 코드 없음

### 권장 (코멘트)
- [ ] 새 기능에 테스트 추가됨
- [ ] 에러 처리 패턴 일관성
- [ ] 다크모드에서 하드코딩 색상 없음
- [ ] 새 API에 rate limiting 적용됨
- [ ] 보안 관련 변경에 audit log 기록됨

### 정보 (개선 제안)
- [ ] 중복 코드 추출 가능
- [ ] 성능 최적화 가능
- [ ] 접근성 개선 가능

## 출력 형식

변경된 각 파일에 대해:
```
## {파일명} (+{추가}/-{삭제})
- [PASS/WARN/FAIL] 설명
```

마지막에 종합 판정: **Approve** / **Request Changes** / **Comment**
