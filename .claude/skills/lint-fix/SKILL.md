---
name: lint-fix
description: lint + 타입 체크 에러를 자동 수정
user-invocable: true
allowed-tools: Read, Edit, Bash, Grep, Glob
---

# Lint Fix

lint 에러와 TypeScript 타입 에러를 발견하고 자동 수정합니다.

사용법: `/lint-fix`

## 절차

1. **TypeScript 타입 체크**: `bunx tsc --noEmit --pretty` 실행
2. **ESLint**: `bun run lint` 실행
3. 발견된 에러를 분석하고 해당 파일을 읽어 수정
4. 수정 후 다시 lint/tsc 실행하여 에러가 0인지 확인
5. 반복 (최대 3회)

## 수정 규칙

- 미사용 import → 제거
- 미사용 변수 → `_` 접두사 추가 또는 제거
- `let` → `const` (재할당 없는 경우)
- `any` → 적절한 타입으로 교체
- aria 속성 누락 → 추가
- 수정 후 커밋하지 않음 (사용자가 확인 후 커밋)
