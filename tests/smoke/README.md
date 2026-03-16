# tests/smoke/ - Smoke 테스트

주요 기능의 통합 동작을 빠르게 검증하는 smoke 테스트입니다.
실제 데이터베이스 및 외부 서비스(ClamAV, Keycloak 등)에 연결하여 실행됩니다.

## 실행 방법

### TypeScript smoke 테스트

프로젝트 루트에서 `bun run`으로 실행합니다.

```bash
bun run tests/smoke/upload-security.test.ts         # 업로드 보안 (SVG 차단, EICAR 탐지)
bun run tests/smoke/upload-dlp.test.ts               # DLP 검사 (신용카드, AWS 키 탐지)
bun run tests/smoke/upload-security-clamav.test.ts   # ClamAV 실시간 스캔
bun run tests/smoke/attachment-security-rescan.test.ts  # 첨부파일 재검사
bun run tests/smoke/audit-log-delivery.test.ts       # 감사 로그 webhook 전달
bun run tests/smoke/vector-store.test.ts             # 벡터 스토어 (임베딩 저장/검색)
```

### Shell smoke 테스트

외부 서비스(Docker)를 자동으로 기동한 뒤 테스트를 실행합니다.

```bash
bash tests/smoke/upload-security-clamav.sh   # ClamAV 컨테이너 기동 후 스캔 테스트
bash tests/smoke/oidc-keycloak.sh            # Keycloak OIDC 통합 테스트 (Playwright)
bash tests/smoke/saml-keycloak.sh            # Keycloak SAML 통합 테스트 (Playwright)
```

## 필요 조건

- `DATABASE_URL`이 설정된 `.env` 파일
- TypeScript 테스트: 데이터베이스 접근 가능
- ClamAV 테스트: Docker 환경
- Keycloak 테스트: Docker 환경 + Playwright 설치 (`bunx playwright install`)
