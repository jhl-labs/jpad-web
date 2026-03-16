---
name: docs-sync
description: 문서 동기화 — 코드 변경에 맞춰 docs/ 업데이트
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Agent
---

# Docs Sync

코드 변경에 맞춰 docs/ 폴더의 문서를 동기화합니다.

사용법: `/docs-sync` 또는 `/docs-sync docs/api-reference.md`

$ARGUMENTS가 있으면 해당 문서만, 없으면 전체 docs/를 점검합니다.

## 점검 항목

### 1. API 문서 (docs/api-reference.md)
- `src/app/api/` 하위의 모든 route.ts 파일 목록과 문서의 엔드포인트 목록 비교
- 새로 추가된 API가 문서에 없으면 추가
- 삭제된 API가 문서에 남아있으면 제거
- 요청/응답 형식이 실제 코드와 일치하는지 확인

### 2. 스키마 문서 (docs/database.md)
- `prisma/schema.prisma`의 모델과 문서의 모델 목록 비교
- 새 필드, 관계, 인덱스 반영

### 3. 컴포넌트 문서 (docs/components.md)
- `src/components/` 하위 파일 목록과 문서 비교
- 새 컴포넌트 추가, 삭제된 컴포넌트 제거

### 4. 디렉토리 구조 (docs/README.md)
- 실제 폴더 구조와 문서의 트리가 일치하는지

### 5. 환경변수 (.env.example ↔ docs/deployment.md)
- .env.example의 변수가 deployment 문서에 모두 설명되어 있는지

### 6. 경로 참조
- 문서 내 파일 경로 참조가 실제 파일과 일치하는지
- 절대 경로(/home/...) 사용 여부

## 출력

변경이 필요한 문서 목록과 구체적 수정 사항을 보고합니다.
