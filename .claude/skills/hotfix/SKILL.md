---
name: hotfix
description: 긴급 핫픽스 — 브랜치 생성, 수정, 테스트, PR 생성
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# Hotfix

긴급 버그 수정을 위한 핫픽스 워크플로우입니다.

사용법: `/hotfix 이슈 설명` 또는 `/hotfix #123`

$ARGUMENTS가 #숫자이면 GitHub Issue에서 정보를 가져옵니다.

## 절차

1. **이슈 파악**: $ARGUMENTS로 버그 내용 확인
   - #숫자이면: `gh issue view $ARGUMENTS`로 이슈 내용 조회
   - 텍스트이면: 그대로 버그 설명으로 사용

2. **브랜치 생성**: `git checkout -b hotfix/{설명-kebab-case} master`

3. **원인 분석**: 관련 코드를 읽고 버그 원인 파악

4. **수정**: 최소한의 변경으로 수정
   - 수정 범위를 버그 수정에만 한정
   - 리팩토링, 기능 추가 금지

5. **검증**:
   - `bunx tsc --noEmit` 타입 체크
   - `bun run lint` lint 체크
   - `bun test` 테스트 통과 확인
   - 가능하면 버그 재현 테스트 추가

6. **커밋**: `git commit -m "fix: {설명}"`

7. **PR 생성**: `gh pr create --title "fix: {설명}" --body "Fixes #{이슈번호}"`

8. 사용자에게 PR URL 보고
