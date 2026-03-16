---
paths:
  - "src/app/api/**/*.ts"
---

# API 라우트 규칙

모든 API 라우트는 반드시:

1. **인증**: `requireAuth()` 또는 `requirePlatformAdmin()` 호출
2. **권한**: `checkWorkspaceAccess(user.id, workspaceId, allowedRoles)` 확인
3. **입력 검증**: 문자열 필드에 길이 제한, 타입 검사
4. **에러 처리**: `"Unauthorized"`만 401, 나머지는 500. `logError()` 사용.
5. **Rate limiting**: 쓰기 API에 `rateLimitRedis()` 적용
6. **Audit log**: 보안 관련 작업에 `recordAuditLog()` 기록

에러 응답 형식은 항상 `{ error: string }` (영어).
