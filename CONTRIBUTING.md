# Contributing to BezaMint

## Development Setup

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/BezaMint/BezaMint.git
   cd BezaMint
   pnpm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example apps/web/.env.local
   ```

3. Start the dev server:
   ```bash
   pnpm dev
   ```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

Format: `type(scope): description`

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `ci`

## Pull Request Process

1. Fork the repo and create a feature branch
2. Write or update tests for your changes
3. Ensure all checks pass: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
4. For contract changes also run: `pnpm run contract:test`
5. Open a PR against `main` with a clear description

## Testing

- Frontend: `pnpm test` (Vitest) — 100 tests across 32 files
- Smart Contracts: `pnpm run contract:test` (Rust) — 62 tests across 5 crates
- TypeScript: `pnpm typecheck`
- Format check: `pnpm format:check`
- Lint: `pnpm lint`
