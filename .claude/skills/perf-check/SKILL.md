---
name: perf-check
description: 성능 점검 — N+1 쿼리, 번들 크기, 메모리 누수, 리렌더링 분석
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
---

# Performance Check

프로젝트의 성능 문제를 점검합니다.

사용법: `/perf-check` 또는 `/perf-check src/app/api`

$ARGUMENTS가 있으면 해당 경로만 점검합니다.

## 점검 항목

### 1. 데이터베이스 쿼리
- N+1 쿼리 패턴 (루프 안에서 prisma 호출)
- 대량 데이터에 페이지네이션 없는 findMany
- 트랜잭션 없이 여러 DB 작업 수행
- 인덱스 누락 가능성 (schema.prisma의 @@index 확인)

### 2. API 응답
- 불필요한 데이터 포함 (select/include 최적화)
- 직렬 API 호출을 Promise.all로 병렬화 가능한 곳
- 큰 응답에 스트리밍 미적용

### 3. 프론트엔드
- 큰 컴포넌트에서 useMemo/useCallback 미사용
- 불필요한 리렌더링 유발하는 객체/배열 리터럴을 prop으로 전달
- useEffect 내 과도한 작업 (디바운스 미적용)
- 큰 리스트에 가상화(virtualization) 미적용

### 4. 번들 크기
- dynamic import 활용 여부
- 큰 라이브러리의 tree-shaking 가능 여부

### 5. 메모리
- 이벤트 리스너 cleanup 누락
- setInterval/setTimeout cleanup 누락
- WebSocket 연결 관리

## 출력 형식

| 위치 | 카테고리 | 심각도 | 설명 | 권장 수정 |
|------|---------|--------|------|----------|
