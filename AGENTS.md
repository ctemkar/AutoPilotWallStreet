# Agent Instructions for AnnouncementStockTrading

## Scope
These instructions apply to the whole repository.

## Project Snapshot
- Stack: Next.js App Router, React 18, TypeScript, Tailwind CSS, Recharts, Lucide, Google GenAI SDK.
- Purpose: single-screen trading terminal with simulator and live broker integrations.
- Main UI entry: [app/page.tsx](app/page.tsx) loading [app/MarketTerminal.tsx](app/MarketTerminal.tsx).

## Runbook
- Install dependencies: npm install
- Start dev server: npm run dev
- Lint: npm run lint
- Hooks lint: npm run lint:hooks
- Build: npm run build
- Start production server wrapper: npm run start

## Environment and Secrets
- Copy [.env.example](.env.example) to .env.local and set real values.
- Do not commit .env.local or any secret values.
- Several routes read environment values at runtime; after changing .env.local, restart the dev server.

## Architecture Boundaries
- UI state and background trading loop logic live in [app/MarketTerminal.tsx](app/MarketTerminal.tsx).
- API surface is route-based under [app/api](app/api) by provider:
  - [app/api/alpaca](app/api/alpaca)
  - [app/api/angelone](app/api/angelone)
  - [app/api/binance](app/api/binance)
  - [app/api/gemini](app/api/gemini)
- Custom Node server bootstrap is in [server.ts](server.ts).
- Shared utilities folder [lib](lib) is currently minimal; prefer adding reusable logic there instead of growing page components further.

## Code Conventions to Preserve
- Keep TypeScript strictness intact (see [tsconfig.json](tsconfig.json)).
- Most routes are set to dynamic execution. Preserve route behavior unless a caching change is intentional.
- The terminal uses a ref-mirroring pattern for interval-safe state reads. When touching autopilot, tick, or polling logic, maintain the no-stale-closure behavior in [app/MarketTerminal.tsx](app/MarketTerminal.tsx).
- Existing API handlers often return HTTP 200 with error objects for client compatibility. Do not change this contract silently.

## Agent Workflow
1. Read [README.md](README.md) for setup.
2. Read [DETAILED_DOCUMENT.md](DETAILED_DOCUMENT.md) for risk engine, autopilot, and fallback design.
3. Use [RECREATION_PROMPT.md](RECREATION_PROMPT.md) only as a feature blueprint reference, not as implementation source of truth.
4. For route changes, keep provider-specific behavior scoped to the matching folder under [app/api](app/api).
5. Validate with lint and a focused manual run in the browser for touched flows.

## Common Pitfalls
- Missing or invalid API credentials in .env.local surface as route-level error payloads.
- Hot reload does not reliably apply changed env vars to server-side behavior until restart.
- Background interval logic can regress quickly if state access is moved away from the existing ref synchronization pattern.
