<!-- .github/copilot-instructions.md -->

# Copilot / AI Agent Instructions — Personal Assistant

Quick, actionable guidance for code edits and feature work in this small React + TypeScript + Vite app.

- Project entry: `src/App.tsx` — lightweight UI that saves a single `AppData` object to `localStorage`.
- Storage implementation: `src/core/storage.ts` — canonical place for persistence and import/export logic.
  - Key: `STORAGE_KEY = "pa.appData.v1"` and `version: 1` in `AppData`.
  - Import/export uses JSON with a strict shape check; maintain backward-compatible migrations here.

- Build / Dev commands (from `package.json`):
  - Dev: `npm run dev` — starts Vite with HMR.
  - Build: `npm run build` — runs `tsc -b` then `vite build`.
  - Preview: `npm run preview` — serve built output.
  - Lint: `npm run lint` — runs `eslint .`.

- Vite config: `vite.config.ts` sets `base: '/personal-assistant-zanarkand/'`.
  - Agents changing routes or deploying must update this base path when repo/name or deploy path changes.

- TypeScript setup: root `tsconfig.json` references `tsconfig.app.json` and `tsconfig.node.json`.
  - Keep type-aware lint and builds consistent with the project references (do not remove references without verifying build).

- React note: project uses React 19 + `@vitejs/plugin-react`. Components are `.tsx` files under `src/`.

- Conventions & patterns to follow (specific to this repo):
  - Persistence: Always go through `saveAppData()` / `loadAppData()` in `src/core/storage.ts` when changing app state.
  - Versioning: `AppData.version` is authoritative. When changing shape, increment version and migrate in `loadAppData()`.
  - Export/Import: `exportBackup()` and `importBackup()` implement the export file format. Keep them strict and backwards-compatible.
  - UI edits: `src/App.tsx` is the canonical UI for quick features; keep inline styles minimal and localized unless adding a theme.

- Debugging tips specific to this codebase:
  - Inspect `localStorage['pa.appData.v1']` to view current persisted state.
  - Use `Save Now` button in the app to trigger `saveAppData()` (it returns the saved object).
  - Use browser devtools and `exportBackup()` to generate a JSON file for offline inspection.

- Integration points & expectations:
  - There are no server APIs in this repo — data is local-only for now.
  - Future features will replace `payload` with concrete structures (skills, schedules, sessions). Add migrations when making that change.

- When creating PRs or patches:
  - Run `npm run lint` and `npm run build` locally.
  - Update `vite.config.ts` `base` only with justification (affects routing and deployed paths).
  - Add tests or a small manual test plan in the PR description when changing storage schema.

- Files worth scanning before making changes:
  - `src/core/storage.ts` — persistence, migrations, export/import
  - `src/App.tsx` — primary UI and button actions (save, export, import)
  - `vite.config.ts` — base path for production
  - `package.json` — scripts used by developers
  - `README.md` — project intent and developer notes

If anything here is unclear or you want more detail (for example: an explicit migration template, testing steps, or a contributor checklist), tell me which area and I will extend this file.
