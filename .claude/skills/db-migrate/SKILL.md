---
name: db-migrate
description: Prisma 스키마 변경 → DB 반영 + 마이그레이션 안전 검증
user-invocable: true
allowed-tools: Read, Bash, Grep
---

# DB Migrate

Prisma 스키마 변경을 안전하게 DB에 반영합니다.

사용법: `/db-migrate`

## 절차

1. **스키마 변경 확인**: `git diff prisma/schema.prisma` 로 변경 내용 파악

2. **안전성 검증**:
   - 컬럼 삭제가 있는지 확인 (데이터 손실 위험)
   - NOT NULL 컬럼 추가 시 default 값이 있는지 확인
   - 인덱스 추가/삭제가 프로덕션 성능에 미치는 영향 분석
   - onDelete 정책이 적절한지 확인 (Cascade vs SetNull vs Restrict)
   - 위험한 변경이 있으면 경고하고 사용자 확인 요청

3. **Prisma Generate**: `bunx prisma generate` 실행

4. **DB Push**: `bunx prisma db push` 실행 (개발 환경)
   - 프로덕션이면 `bunx prisma migrate dev --name {설명}` 권장

5. **TypeScript 확인**: `bunx tsc --noEmit` 으로 타입 에러 확인

6. **결과 보고**: 변경된 모델, 추가된 필드, 인덱스 등 요약
