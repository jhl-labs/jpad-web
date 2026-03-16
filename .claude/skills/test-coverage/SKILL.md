---
name: test-coverage
description: 테스트 실행 + 커버리지 갭 분석 + 누락 테스트 생성
user-invocable: true
allowed-tools: Read, Write, Bash, Grep, Glob
---

# Test Coverage

테스트를 실행하고, 커버리지 갭을 분석하여 누락된 테스트를 생성합니다.

사용법: `/test-coverage` 또는 `/test-coverage src/lib/secrets.ts`

$ARGUMENTS가 있으면 해당 모듈의 테스트만 확인/생성합니다.

## 절차

1. **기존 테스트 실행**: `bun test` 실행하여 현재 상태 확인
2. **테스트 파일 매핑**: src/ 하위 모듈 → tests/unit/ 매핑 확인
3. **갭 분석**: 테스트가 없는 모듈 식별
   - src/lib/ → tests/unit/lib/
   - src/server/ → tests/unit/server/
   - src/app/api/ → tests/unit/api/ (통합 테스트)

4. **테스트 생성**: 누락된 테스트 파일을 생성
   - `import { describe, it, expect, beforeEach, afterEach } from "bun:test";`
   - 순수 함수 위주로 테스트
   - DB 필요한 경우 mock 또는 skip
   - 환경변수 필요 시 beforeEach/afterEach에서 관리

5. **재실행**: 새 테스트 포함하여 `bun test` 실행, 실패 시 수정

## 우선순위

1. 보안 관련 (secrets, auth, rateLimit, uploadDlp, storage)
2. 비즈니스 로직 (pageAccess, notifications, retention)
3. 유틸리티 (markdown serializer, backlinks, wikiLinks)
4. API 라우트 (통합 테스트)
