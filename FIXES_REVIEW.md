# WhatsApp Bot — Fixes & Stability Review

Date: 2026-07-11
Scope: Stability + crash fixes derived from `Log.txt` (PM2 logs on Ubuntu VPS).

## Symptom recap (from Log.txt)

1. Bot starts fine, but after ~2 days it "gets lost" and stops sending replies.
2. With 2 numbers it starts fine, then after a while everything stops and errors appear.
3. Recurring errors in the log:
   - `TypeError: Cannot destructure 'username' of req.body (undefined)` — `authController.js:12`
   - `ENOENT: uploads/undefined` — `messageEngine.js:81`
   - `Execution context was destroyed` / `ProtocolError ... Execution context was destroyed` — during `Client.inject`
   - `onQRChangedEvent already exists`
   - PM2 restart loops (`exited with code [1]`) and huge orphaned process trees (up to 86 pids).

## Root causes

| Error | Root cause |
|-------|------------|
| Replies stop after days | No auto-reconnect. On `disconnected` the code only set DB status; the client was never rebuilt, so when WhatsApp Web refreshed the session the bot died permanently. |
| Crash loops / "stops after a while" | `client.initialize()` was called with **no `.catch()`**. On Node 22 an unhandled rejection crashes the process. The `Execution context destroyed` and `onQRChangedEvent already exists` errors reject init → PM2 restart loop. |
| `uploads/undefined` | A `sendImage/Video/Audio` flow step with no `filename` built `uploads/undefined` and threw, aborting the whole flow for that contact. |
| Condition branch never worked | Engine looked up `item.id` but steps have no `id`; the target was always `-1`, so flows always fell through to the next step. |
| Login destructure error | POSTs to `/login` with no/invalid body (bots, scanners) threw inside `doLogin`. |
| 86-pid orphan trees / OOM | On PM2 restart the old Chrome child processes were not killed, accumulating until the 4 GB VPS ran out of memory. |

---

## Changes applied

### A. Auto-reconnect + crash-safe lifecycle — `config/whatsapp.js`
- Wrapped `client.initialize()` in `.catch()` so a failed injection schedules a reconnect instead of crashing.
- Added a global `process.on('unhandledRejection')` guard so one bad client can never kill the whole bot.
- Added `auth_failure`, `authenticated`, `error` handlers and improved `disconnected`.
- **Auto-reconnect with exponential backoff**: 20 s base, capped at 5 min, max 12 attempts, triggered on `disconnected`, `auth_failure`, and init failure. Fixes the "dies after 2 days" problem.
- **Safe client replacement**: before creating a client, the existing one is fully destroyed (`_st.replacing` flag) to avoid the `onQRChangedEvent already exists` binding collision when running multiple numbers.
- Manual disconnects are tracked via a `manualDisconnect` set so user-initiated disconnect/delete is never auto-reconnected; explicit "reconnect" clears it.

### B. Media step no longer crashes the flow — `controllers/messageEngine.js`
- Added `fs` require.
- The `sendImage/Video/Audio` step now **skips safely** when: `step.filename` is missing, the file does not exist on disk, or `MessageMedia.fromFilePath` throws. Each case logs a warning and advances to the next step, so the flow keeps running and the contact still gets replies.

### C. Condition step jumps correctly — `controllers/messageEngine.js`
- The condition step now resolves the jump target as a **1-based step number** (what the editor actually stores in `nextStep`/`elseStep`) → array index `targetNumber - 1`.
- Kept a fallback to `item.id` matching for forward compatibility.
- Added bounds checking so an invalid target safely continues to the next step.
- Result: `value` match → `nextStep`, otherwise → `elseStep` now works as designed.

### D. Login hardening — `controllers/authController.js` + `server.js`
- `doLogin` guards `if (!req.body)` and returns HTTP 400 instead of throwing.
- `server.js` now also registers `express.json()` alongside `express.urlencoded()`.

### E. Orphan-Chrome cleanup + PM2 stability — `config/whatsapp.js`, `server.js`, `ecosystem.config.js` (new)
- Added `destroyAllClients()` and `setupGracefulShutdown()`; on `SIGINT`/`SIGTERM` (PM2 stop/restart) all clients are destroyed, killing their Chrome children. Stops the orphaned-process accumulation that exhausted RAM.
- `server.js` calls `setupGracefulShutdown()` at startup.
- `ecosystem.config.js` created (matches the existing README instructions):
  - `exp_backoff_restart_delay: 3000` — no more instant crash hot-loops.
  - `max_restarts: 10` + `min_uptime: '10s'` — stops endless restart cycles.
  - `max_memory_restart: '1G'` — auto-restarts on memory leak/OOM.

---

## Deployment checklist (VPS)

1. Pull the updated code.
2. Start with `pm2 start ecosystem.config.js` (not `pm2 start server.js`) so the stability settings apply. The PM2 process name will be `Whatsapp-bot_v_F` (as in the logs).
3. Watch logs: `pm2 logs Whatsapp-bot_v_F`. You should now see `Scheduling reconnect for account ...` lines instead of crashes, and `Server is running on http://localhost:3000` once.
4. Flows with media: ensure every `sendImage/Video/Audio` step actually has a file uploaded, otherwise it is now skipped (with a warning) instead of crashing.

---

## Known minor issues NOT fixed (optional follow-ups)

- **Media leak on flow delete**: `flowsController.uploadStepMedia` stores `flow_id = 0` while `deleteFlow` deletes by `flow_id`, so uploaded media files/DB rows are not cleaned when a flow is deleted. Low impact.
- **Plaintext passwords** in the `users` table (`authController.js` / `database/init.js`). Should be hashed (e.g., bcrypt) for security.
- **README step 2** says `node database/init.js`, but that file only exports `initDB` (it is called from `server.js`). The DB is still initialized on server start; just the documented command does nothing.

## Verification

All modified files pass `node --check` (no syntax errors):
- `config/whatsapp.js`
- `controllers/messageEngine.js`
- `controllers/authController.js`
- `server.js`
- `ecosystem.config.js`
