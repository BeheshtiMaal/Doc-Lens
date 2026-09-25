# Cherry workspace validation

The implementation follows `design.md` (the current UI source of truth), including its dark-only theme. Earlier references to a light theme in `specs/ui.md` describe the superseded interface.

## Implemented flows

- Cherry sidebar and bezel, graphite grain panel, local Instrument Sans/Serif and Vazirmatn fonts.
- Hero-to-chat transition, grounded answer stream with word dissolve, stop, copy, regenerate, and passage popovers.
- Document drawer with multiple uploads, progress and reading states, validation, retry, selection, rename, and deletion. Changing the document starts a separate chat; deleting a source leaves read-only history.
- Desktop sidebar, tablet rail, mobile history sheet and document bottom sheet, drag dismissal, and window file drop.
- Keyboard shortcut and focus trapping, focus return on close, mixed English/Persian content, reduced-motion scrolling and fades, reduced-transparency fallbacks, and mobile touch targets.

## Verification

Local validation completed on 2026-09-25 using Node.js 24.18.0 and the optimized Next.js 16.3.6 build.

- `npm run check`: lint, generated route types, TypeScript, and all 27 tests passed.
- `npm run build`: production compilation, TypeScript, and page generation passed.
- `npm run db:check`: the local PostgreSQL connection, pgvector 0.8.1, vector round-trip/distance, and workspace schema passed.
- `npm run test:browser` with `PLAYWRIGHT_CHANNEL=msedge` and the production start command: all 13 tests passed (36.4 seconds). Coverage includes responsive layouts, focus, refresh, streaming/cancellation, uploads, source removal, document switching, Persian/reduced motion, and workspace lifecycle behavior.
- Real localhost API smoke test: health, origin enforcement, anonymous workspace creation/resume, authenticated empty lists, rejection of mismatched workspace credentials, heartbeat/close/resume, and unsupported-upload rejection (HTTP 415) passed. Only synthetic test workspaces were created, and they were removed afterward.

Two browser-test assumptions were corrected during validation: the cancellation assertion now targets application alerts inside the workspace, excluding Next.js's empty route announcer; the upload mock now returns a pending server record while ingestion is held, since intercepted XHR does not emit native upload progress. No application behavior was changed for these fixes.

Browser requests mock AI answers and uploads; database and API checks use synthetic records. These results do not verify native upload progress against a real ingestion request or live embedding/chat providers. No paid provider calls were made. Browser screenshots are saved under the ignored `test-results/` directory.

## Deployment boundary

This work completes the local redesign. Live provider behavior and a Vercel deployment remain separate Phase 12 work. The existing cleanup grace/sweeper and production upload-size limitations in the README still apply.
