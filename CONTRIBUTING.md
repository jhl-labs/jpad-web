# Contributing to jpad

jpad에 기여해 주셔서 감사합니다! 아래 가이드를 참고해 주세요.
Thank you for contributing to jpad! Please follow the guide below.

## Development Setup / 개발 환경 설정

### Prerequisites / 사전 요구사항

- **Node.js** 20+
- **Bun** (latest)
- **Docker** and **Docker Compose**

### Getting Started / 시작하기

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-username>/jpad.git
cd jpad

# 2. Copy environment variables
cp .env.example .env
# Edit .env — set NEXTAUTH_SECRET, WS_SECRET, APP_ENCRYPTION_KEY

# 3. Start infrastructure services
docker-compose up -d

# 4. Install dependencies
bun install

# 5. Initialize the database
bun run db:push

# 6. Start the development server
bun run dev
```

The app runs at `http://localhost:3000`.

## Code Style / 코드 스타일

- **TypeScript strict mode** — no `any` types unless absolutely necessary
- **CSS variables** for theming — no hardcoded colors
- **Korean UI text**, English API error messages
- **Conventional Commits** — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- **Prisma** — always run `bun run db:generate` after schema changes

## Pull Request Process / PR 절차

1. **Fork** the repo and create a feature branch from `main`
2. **Implement** your changes with clear, small commits
3. **Test** — ensure all tests pass:
   ```bash
   bun run lint
   bun run test:e2e
   ```
4. **Push** your branch and open a Pull Request against `main`

### PR Guidelines / PR 가이드라인

- All CI checks must pass (`lint`, `tsc --noEmit`)
- One feature or fix per PR — keep PRs focused and small
- Include a clear description of what changed and why
- Korean or English PR descriptions are both accepted
- Add screenshots for UI changes
- Update documentation if your change affects public APIs or configuration

## Reporting Issues / 이슈 보고

Use [GitHub Issues](https://github.com/jhl-labs/jpad/issues) to report bugs or request features.

### Bug Reports / 버그 리포트

- Include **reproduction steps** (step-by-step)
- Specify your **environment** (OS, browser, Node.js version)
- Attach **screenshots** for UI issues
- Include **error messages** or logs if available

### Feature Requests / 기능 요청

- Describe the **problem** you want to solve
- Explain your **proposed solution**
- Consider **alternatives** you have tried

## Commit Message Convention / 커밋 메시지 규칙

```
<type>: <subject>

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

Examples:
```
feat: 페이지 트리에 드래그&드롭 정렬 추가
fix: WebSocket 재연결 시 커서 위치 복원
docs: API 레퍼런스 업데이트
```

## License / 라이선스

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](./LICENSE).
