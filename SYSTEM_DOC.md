# AutopilotAlpha — System Summary

## Purpose
Single-screen trading terminal (Next.js + React + TypeScript) with autopilot trading, broker proxies, and monitoring. Designed to run on a VPS behind Nginx with PM2.

## Key Components
- Frontend: Next.js App Router in `app/` — main UI in `app/MarketTerminal.tsx` and `app/page.tsx`.
- Ticker Universe: `app/tickerList.ts` defines `quickTickers` scanning universe.
- Broker Proxies: `app/api/alpaca/route.ts` (Alpaca), `app/api/gemini/analyze/route.ts` (AI diagnostics), other provider routes under `app/api/*`.
- Server boot: `server.ts` / `server.js` (optional custom bootstrap).
- Config: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.js`.

## Important Behaviors
- Autopilot cooldowns persist to `localStorage` key `sentry:autopilotCooldowns` to prevent rapid re-entry after liquidations.
- External broker position closes are detected during the refresh loop and will arm per-symbol cooldowns.
- Alpaca proxy returns normalized `positions` and `account` objects used by the frontend.
- Gemini analyze endpoint attempts to call Google GenAI; if no `GEMINI_API_KEY` is configured, a local fallback stress matrix is returned.

## Deployment Notes
- Build steps on VPS:

```bash
cd /opt/AutopilotAlpha
npm ci
npm run build
pm2 reload autopilotalpha --update-env
```

- Reverse proxy: Nginx to `127.0.0.1:3000`; use Certbot to obtain TLS cert for domain.

## Files Included in Zip
- `README.md`, `DETAILED_DOCUMENT.md`, `AGENTS.md`, `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.js`, `server.ts`, `server.js`, `app/MarketTerminal.tsx`, `app/tickerList.ts`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/api/alpaca/route.ts`, `app/api/gemini/analyze/route.ts`, and this `SYSTEM_DOC.md`.

## How to Use This Archive
1. Extract on the server or a dev machine.
2. Install dependencies with `npm ci`.
3. Build with `npm run build` and run with `pm2` or `next start`.

## SafeState (Emergency & Health Mode)

- Purpose: immediate, defensive mode to protect capital and keep the system in a recoverable state when connectivity, data, or execution health degrades.
- Trigger points: connection drops, tick-stream staleness, repeated broker failures, critical AI diagnostics, or manual operator activation.
- Behavior on enter:
	- Cancel unresolved broker orders (calls existing `cancelUnresolvedBrokerOrders()` in `app/MarketTerminal.tsx`).
	- Pause autopilot scanning and mute new trade signals.
	- Emit a persistent log entry and a toast notification.
	- Persist safe-state flag to `localStorage` under key `sentry:safeState` (boolean + reason).
- Behavior on exit:
	- Resume autopilot only after an explicit call or after automated health checks pass.
	- Record exit reason in logs and toasts.

### API (frontend)

- Module: `lib/safeState.ts` — exports `SafeStateManager`.
- Typical usage from `app/MarketTerminal.tsx`:

```ts
// created and wired in MarketTerminal
safeStateRef.current?.enterSafeState('connection_or_stream_lost');
safeStateRef.current?.exitSafeState('connection_restored');
```

### Observability & Recovery

- Logs: safe-state entries are logged via the same `addLog()` helper and appear in the UI logs (symbol `SYSTEM`, actions `SAFE_STATE_ENTER` / `SAFE_STATE_EXIT`).
- Manual recovery: use UI control to exit safe mode or call `exitSafeState()` from the console.

### Operational Recommendations

- Before deploying, ensure `npm ci` runs including devDependencies so Next build can complete (Tailwind/PostCSS required).
- Configure server monitoring to alert on consecutive `SAFE_STATE_ENTER` events — these indicate recurring systemic issues.


## Contact
For changes to the autopilot logic, see `app/MarketTerminal.tsx` and the `OPERATIONAL/` logs for blocked actions and cooldown traces.
