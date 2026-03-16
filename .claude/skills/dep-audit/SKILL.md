---
name: dep-audit
description: 의존성 감사 — 취약점, 라이선스 호환성, 업데이트 가능 버전 확인
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob
---

# Dependency Audit

프로젝트 의존성의 보안, 라이선스, 버전 상태를 점검합니다.

사용법: `/dep-audit`

## 점검 항목

### 1. 보안 취약점
- `bun pm audit` 실행하여 알려진 CVE 확인
- Critical/High 취약점이 있으면 즉시 보고

### 2. 라이선스 호환성
- 모든 dependencies/devDependencies의 라이선스 확인
- `node_modules/{pkg}/package.json`에서 license 필드 추출
- jpad License와 호환성 검증:
  - MIT, Apache-2.0, ISC, BSD → 호환
  - MPL-2.0 → 조건부 호환 (소스 수정 시 공개 의무)
  - GPL → 비호환 경고
  - UNKNOWN → 수동 확인 필요

### 3. 업데이트 가능 버전
- `bun outdated` 또는 각 패키지의 최신 버전과 비교
- Major 업데이트는 breaking change 위험 경고
- BlockNote, Prisma 등 핵심 패키지는 별도 주의

### 4. NOTICE 파일 동기화
- NOTICE 파일의 패키지 목록과 실제 dependencies 비교
- 추가/제거된 패키지가 있으면 NOTICE 업데이트 필요 보고

## 출력 형식

| 패키지 | 현재 | 최신 | 라이선스 | 상태 |
|--------|------|------|---------|------|
