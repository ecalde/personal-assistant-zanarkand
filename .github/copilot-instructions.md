<!-- .github/copilot-instructions.md -->

# Copilot / AI Agent Instructions — Personal Assistant

Quick guidance for edits in this **Vite + React 19 + TypeScript** app with **Supabase Auth**, **Postgres sync**, and **localStorage** cache.

## Entry and layers

- **Root:** `src/main.tsx` → `AuthGate` (not `App` directly).
- **Auth:** `src/auth/` — session gate and sign-in; no app payload logic.
- **Shell:** `src/App.tsx` — sync lifecycle, `commit`, CRUD, `page` state, renders `AppShell` + pages.
- **Pages:** `src/pages/` — presentational (`DashboardPage`, `SkillsPage`); props in, callbacks out.
- **Components:** `src/components/layout/` (shell, nav), `src/components/skills/` (editors).
- **Core:** `src/core/` — model, storage, remote sync, mappers; all persistence goes through here.
- **UI helpers:** `src/ui/appStyles.ts`, `src/ui/format.ts` — shared styles and display formatting only.

See [`docs/architecture.md`](../docs/architecture.md) for boundaries and data flow.

## Persistence rules

- Mutations: `App.commit` → `saveAppData(data, userId)` → optional debounced `replaceRemotePayload`.
- Load: `initialSync(userId, () => loadAppData(userId))` in `App` on mount.
- Pages/components must **not** call `saveAppData` or Supabase sync APIs directly.
- Storage keys: user-scoped `pa.appData.v1.<userId>` ([`src/core/storage.ts`](../src/core/storage.ts)).
- Export/import: `exportBackup` / `importBackup` — keep strict shape checks and migrations in `loadAppData`.

## Build / dev

- `npm run dev` — Vite HMR
- `npm run build` — `tsc -b` then `vite build`
- `npm test` — Vitest (`src/core/*.test.ts`)
- `npm run lint` — ESLint

`vite.config.ts` sets `base` for subpath deploys; change only with deployment justification.

## Environment

Public client vars only: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_ENABLE_REMOTE_SYNC` (`"false"` disables cloud writes). Never commit secrets.

## Where to put new work

| Change | Location |
|--------|----------|
| New product section | `src/pages/<Name>Page.tsx`, extend `src/pages/types.ts`, nav in `AppShell`, mutations in `App` |
| Shared layout/chrome | `src/components/layout/` |
| Domain / sync / validation | `src/core/` |
| Display-only helpers | `src/ui/` |

## PR checklist

- Run `npm run lint`, `npm test`, `npm run build`
- Manual smoke: auth, dashboard, skills CRUD, save/export/import, cloud sync if configured
- Update `docs/architecture.md` when folder boundaries or sync behavior change

## Files to read first

- `src/App.tsx` — sync, commit, routing
- `src/core/storage.ts` — local cache and backup format
- `src/core/remoteStorage.ts` — `initialSync`, remote persist
- `src/core/model.ts` — payload shape
- `docs/architecture.md` — current structure
