# Anonymous workspace lifecycle

Status: The session and cleanup mechanisms are implemented: hashed workspace ownership, sessionStorage persistence, duplicate-tab claims (Web Locks with a BroadcastChannel fallback), heartbeat/resume, generation-checked close hints, and a protected server-side sweeper. Browser tests cover refresh persistence, copied-tab isolation, and the page departure close hint. Database tests cover stale close hints, interrupted-session expiry, and sweeping private data. Production scheduling and browser shutdown behavior still need deployment-level verification. The chat and upload UI use this session.

## Ownership contract

Each tab owns a workspace identified by a UUID and a 256-bit random bearer token. Store the credential in sessionStorage, never a shared cookie or localStorage. The database stores only the token's SHA-256 hash. Every document, conversation, citation, deletion, and retrieval request must authenticate the credential and verify that its target belongs to the same workspace. A file ID is never sufficient authorization.

Phase 0 includes the workspaces table, credential generation, expiry-aware authorization, and integration checks against PostgreSQL with pgvector. Later file and conversation tables must reference this table. Retrieval must filter both the authenticated workspace and exactly one selected file.

For later HTTP handlers, send credentials in an Authorization header and never in URLs or logs. Validate Origin for mutations, add rate limiting before public production launch, and return the same unavailable response for invalid, missing, and expired ownership.

## Refresh, close, and abandoned sessions

The product requirement is to preserve files and messages on refresh and discard them when the tab closes. Browser signals cannot guarantee immediate server-side deletion on every close. MDN documents that sessionStorage survives reloads **and browser restores**, while pagehide can also occur on navigation and may never fire during a crash or mobile browser shutdown. Hiding a tab is not evidence that it closed.

The implementation must therefore distinguish client access from eventual physical cleanup:

1. Keep tab credentials across ordinary reloads. New independent tabs create new credentials. Guard against opener/duplicate-tab storage copies; use a live-tab claim handshake and fresh credentials for a new navigation. Do not assume a UUID in sessionStorage by itself isolates tabs.
2. While the workspace is active, authenticate periodic heartbeats and extend its server-side lease. Proposed initial values: heartbeat every 30 seconds, idle lease 30 minutes.
3. Treat pagehide as a best-effort departure hint, never immediate deletion. Use a short grace deadline (initially 120 seconds) which a reloaded page can cancel with an authenticated resume/heartbeat. Include a per-page generation identifier so a delayed departure cannot close a newer resumed page.
4. Run a server-side sweeper to remove expired workspace data, including source bytes, extracted text, vectors, conversations, and messages. On Vercel this requires an actual scheduled cleanup mechanism; client callbacks and in-process timers alone are insufficient.
5. If a tab crashes or its close hint is lost, the lease provides fallback cleanup. Suspended/background tabs and unusually slow reloads can also outlive a lease. If the workspace has already expired, show a clear session-ended state; never silently attach it to a different workspace.

The numbers above are initial engineering defaults, not a promise of immediate physical deletion. The running browser session is rejected after the configured close grace; the bytes and related rows are physically removed by the protected sweeper. Vercel is configured to sweep daily because Hobby schedules cannot run more than once a day. This is eventual cleanup, and production retention timing must be stated honestly.

## Manual source deletion

Deleting one file removes its original content, extracted chunks, and vectors. Its conversation remains read-only until the workspace ends, retaining the source name and a source-removed marker. It cannot resume against another file, and citations to the deleted source must show that the source is unavailable.

## Required browser and server checks before Phase 4 is complete

- Refresh retains the same workspace and data; a separate or duplicated tab cannot read that workspace.
- A close followed by a fresh tab does not restore the old workspace. Test browser restore/reopen explicitly rather than assuming native storage was cleared.
- Backgrounding a tab does not immediately delete anything.
- Reload/close hints, heartbeats, and cleanup cannot race to delete a resumed active workspace.
- A close hint makes the workspace inaccessible after grace and the scheduled sweeper removes all its data; missed hints are handled by the lease expiry sweep.
- Expired, tampered, absent, and cross-workspace credentials fail on every endpoint, including citation and streaming routes.

## References

- [MDN: sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
- [MDN: pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event)
- [Chrome: Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
