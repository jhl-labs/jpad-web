---
name: security-audit
description: 보안 감사 — 취약점, 인증/인가, 입력 검증, 시크릿 노출 점검
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Agent
---

# Security Audit

프로젝트의 보안 상태를 점검합니다.

사용법: `/security-audit` 또는 `/security-audit src/app/api/pages`

$ARGUMENTS가 있으면 해당 경로만, 없으면 전체 프로젝트를 점검합니다.

## 점검 항목

### 1. 시크릿 노출 검사
- 소스 코드에 하드코딩된 API 키, 비밀번호, 토큰 검색
- 패턴: `sk-`, `AKIA`, `-----BEGIN.*PRIVATE KEY`, `password\s*[:=]\s*["'][^"']{8,}`
- `.env.example`에 실제 값이 있는지 확인
- 제외: tests/ 디렉토리의 테스트 전용 값

### 2. 인증/인가 검사
- 모든 `src/app/api/` 라우트에서 `requireAuth()` 또는 동등한 인증 검사가 있는지
- `checkWorkspaceAccess()`로 권한 검사가 적절한지
- 공개 접근이 의도적인 엔드포인트 목록 확인

### 3. 입력 검증
- POST/PATCH/PUT 라우트에서 body 필드의 타입/길이 검증이 있는지
- SQL injection 가능한 raw query 사용 여부 (Prisma 사용 확인)
- XSS 가능한 사용자 입력의 HTML 렌더링 여부

### 4. Rate Limiting
- 쓰기 API에 `rateLimitRedis()` 적용 여부
- rate limit 설정의 적절성

### 5. 의존성 취약점
- `bun pm audit` 실행

### 6. CSP/보안 헤더
- `next.config.ts`의 CSP 설정 검토
- `src/middleware.ts`의 CORS 설정 검토

## 출력 형식

각 항목에 대해 [PASS] 또는 [FAIL: 설명] 으로 판정하고, 마지막에 요약 테이블을 출력합니다.
Critical/High/Medium/Low 심각도를 분류합니다.
