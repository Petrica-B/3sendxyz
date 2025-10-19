# Repository Guidelines

Use this guide for day-to-day development and refresh it when workflows change.

## Project Structure & Module Organization

- `app/` contains App Router routes and API handlers (`app/api/*`) grouped by feature (`outbox`, `inbox`).
- `components/` keeps reusable PascalCase UI (Providers, WalletBar, SendFileCard); keep hook/style files beside their component.
- `lib/` centralizes mock ratio1 helpers, the upload store, formatting utilities, and shared TypeScript types.
- `stubs/` stores shims such as the custom `pino-pretty` loader used during development.
- Root configs (`tailwind.config.cjs`, `postcss.config.cjs`, `tsconfig.json`) define build and lint behavior; avoid per-feature overrides.

- Smart contract implementation lives at: https://github.com/aledefra/3sendxyz-sc
- Front-end ABI copy is available in `lib/SmartContract.ts`.

## Build, Test, and Development Commands

- `npm install` installs dependencies; rerun after dependency updates land.
- `cp .env.example .env.local` and set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` for RainbowKit; keep the file untracked.
- `npm run dev` starts the hot-reload server on `http://localhost:3000` with mock inbox/outbox seeds.
- `npm run build` creates the production bundle and surfaces type/lint regressions pre-merge.
- `npm run start` serves the compiled bundle for production parity smoke tests.

## Coding Style & Naming Conventions

TypeScript is mandatory; share common shapes through `lib/types.ts`. Follow Prettier defaults (2 spaces, semicolons) and Tailwind utility classes for layout before writing custom CSS. Name components with PascalCase files, hooks with the `use` prefix, and helper exports in `camelCase`. Keep async workflows in `app/api/*` or `lib` helpers instead of embedding them in component bodies.

## Testing Guidelines

Automated tests are not wired up yet; when you introduce them, colocate Playwright or Vitest suites under `tests/` or `__tests__/` mirroring feature paths. Until then, document manual smoke steps in each PR: connect a wallet, send a file, confirm the inbox view, and capture any console warnings. Use seeded entries from `lib/mock.ts` only for local verification and clear `localStorage` between scenarios.

## Commit & Pull Request Guidelines

Follow Conventional Commit prefixes (`feat:`, `fix:`, `chore:`) as seen in the history. Scope PRs to a single user-facing change, include behavior and testing notes, and link issues or specs. Add screenshots or console traces when UI or networking behavior shifts. Aim to squash before merge for a readable changelog.

## Security & Configuration Tips

Never commit `.env*` files or wallet credentials. Treat `lib/ratio1.ts` and `lib/store.ts` as canonical mock protocol sources—coordinate changes there to avoid breaking session derivation. When adding secrets or external services, extend `.env.example` and document fallbacks so the app still boots in mock-only mode.
