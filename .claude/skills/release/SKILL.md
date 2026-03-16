---
name: release
description: 새 버전 릴리스 (버전 범프, CHANGELOG, 태그, GitHub Release)
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# Release

새 버전을 릴리스합니다. 인자로 버전 타입을 받습니다.

사용법: `/release patch` 또는 `/release minor` 또는 `/release major`

$ARGUMENTS 가 비어있으면 "patch"로 간주합니다.

## 절차

1. **현재 버전 확인**: `package.json`의 `version` 필드를 읽습니다.

2. **버전 범프**: $ARGUMENTS (patch/minor/major)에 따라 semver 규칙으로 버전을 올립니다.
   - patch: 0.0.x → 0.0.(x+1)
   - minor: 0.x.0 → 0.(x+1).0
   - major: x.0.0 → (x+1).0.0

3. **파일 업데이트**:
   - `package.json`의 `version` 필드 수정
   - `src/app/(main)/workspace/[workspaceId]/user-settings/page.tsx`의 `APP_VERSION` 상수 수정
   - `src/components/sidebar/Sidebar.tsx`의 `jpad v{버전}` 텍스트 수정

4. **CHANGELOG.md 업데이트**: 새 버전 섹션을 최상단에 추가합니다.
   - `git log --oneline {이전태그}..HEAD`로 변경 사항 수집
   - Added/Changed/Fixed/Security 카테고리로 분류

5. **품질 검증**:
   - `bunx tsc --noEmit` 실행하여 타입 에러 확인
   - `bun run lint` 실행하여 lint 에러 확인
   - 에러가 있으면 릴리스 중단

6. **커밋 & 태그**:
   - `git add -A && git commit -m "release: v{새버전}"`
   - `git tag -a v{새버전} -m "v{새버전}"`

7. **Push**: `git push origin master && git push origin v{새버전}`

8. **GitHub Release**: `gh release create v{새버전}` — CHANGELOG의 해당 버전 섹션을 릴리스 노트로 사용

모든 단계를 순서대로 실행하고, 각 단계의 결과를 사용자에게 보고합니다.
