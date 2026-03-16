---
name: changelog
description: CHANGELOG.md 자동 업데이트 (커밋 로그 기반)
user-invocable: true
allowed-tools: Read, Edit, Bash, Grep
---

# Changelog

최근 커밋 로그를 분석하여 CHANGELOG.md를 업데이트합니다.

사용법: `/changelog` 또는 `/changelog v1.1.0`

$ARGUMENTS가 있으면 해당 버전명으로, 없으면 "Unreleased"로 섹션을 생성합니다.

## 절차

1. **마지막 태그 확인**: `git describe --tags --abbrev=0` 로 이전 릴리스 태그

2. **커밋 수집**: `git log {이전태그}..HEAD --oneline --no-merges`

3. **분류**: 커밋 메시지의 접두사로 카테고리 분류
   - `feat:` → Added
   - `fix:` → Fixed
   - `refactor:` → Changed
   - `docs:` → Documentation
   - `test:` → Testing
   - `security:` / `fix: 보안` → Security
   - `perf:` → Performance
   - 기타 → Changed

4. **CHANGELOG.md 업데이트**: 기존 내용 위에 새 섹션 추가
   ```markdown
   ## [{버전}] - {YYYY-MM-DD}

   ### Added
   - ...

   ### Fixed
   - ...
   ```

5. 수정 후 커밋하지 않음 (사용자가 확인 후 커밋)
