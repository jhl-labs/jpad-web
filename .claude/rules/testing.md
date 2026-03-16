---
paths:
  - "tests/**/*.ts"
  - "tests/**/*.test.ts"
---

# 테스트 규칙

## 프레임워크
- bun:test 사용: `import { describe, it, expect, beforeEach, afterEach } from "bun:test";`
- 파일명: `*.test.ts`

## 구조
- `tests/unit/` — 순수 함수 단위 테스트
- `tests/e2e/` — Playwright E2E 테스트
- `tests/smoke/` — 통합 스모크 테스트

## 규칙
- DB 필요한 테스트는 mock하거나 skip
- 환경변수는 beforeEach에서 설정, afterEach에서 복원
- 테스트 간 상태 공유 금지
- 각 테스트는 독립적으로 실행 가능해야 함
