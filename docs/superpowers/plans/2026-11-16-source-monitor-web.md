# Source Monitor Web Implementation Plan

**Goal:** Apply the user-approved reference-inspired top navigation and two-column source-only monitoring interface.

**Architecture:** Preserve React auth/live/alerts contexts and API contracts. Shared shell owns navigation/theme/account actions; dashboard and timeline own their existing source fetches and view state. No derived trading ledger or chart.

**Tech Stack:** React 19, TypeScript, existing CSS/Tailwind, Vitest.

## Approved design
User approved 2026-11-16: light gray page, white fine-bordered surfaces, restrained accents; top navigation; homepage source/sync summary on left and important originals/snapshots on right; timeline topic navigation on left and filters/originals/revisions on right; dark mode retained; mobile vertically stacks panels. Preserve auth and communication, paused auto-copy; no production deployment.

## Execution
- [ ] Add failing interaction tests in web/src/App.test.tsx for named top navigation, light default with persisted theme honored, and source-only workbench topic navigation. Run `npm test -- --maxWorkers=1` and record expected assertion failures.
- [ ] Replace layout in web/src/components/layout/AppLayout.tsx with top navigation, connection/theme/mute/account/logout controls, accessible names and 44px controls. Preserve existing providers/routes.
- [ ] Update web/src/features/dashboard/DashboardPage.tsx to source summary/important-originals split, retaining API query, refresh, loading/error/empty/live states. Do not invent sync metrics.
- [ ] Update web/src/features/timeline/TimelinePage.tsx to topic aside and main filter/message area; retain all query controls, deletion/edit badges and history toggle.
- [ ] Create web/src/styles/monitor.css and import in web/src/styles.css; use semantic variables, responsive 390/1280/1920 widths and dark styles. Avoid global legacy utility overrides.
- [ ] Run full tests, `npm run build`; fallback offline build only for demonstrated esbuild spawn EPERM; run tsc separately with fallback. Review diff and dependency audit results.
- [ ] Preview local application with fixture API only if needed (visibly mark fixture data); check desktop/mobile layout and console errors. No real account/production changes.

## Dependency isolation
Dependency owner exclusively changes web/package.json and web/package-lock.json. UI owner must not modify those files. Root reviews final diff and collects all job receipts. No commit/push/deploy as part of this iteration without further instruction.
