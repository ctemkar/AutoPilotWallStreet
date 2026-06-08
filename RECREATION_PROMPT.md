# Executive Specification & System Recreator Prompt

Copy and paste this full-scale blueprint prompt into Google AI Studio (or any Gemini LLM) to instantly recreate this entire high-fidelity brokerage client, simulator engine, and Sentry trading bot from a blank slate.

```text
You are a Staff Software Engineer and UI/UX Designer.
Your objective is to build a highly polished, fully functional web app called the "Alpaca Margin & Risk Terminal" with Next.js (App Router), Tailwind CSS v4, Lucide Icons, and `@google/genai` SDK.

The application serves as a real-time risk diagnostic analyzer & automated electronic trading bot client supporting two execution modes:
1. "Local Paper Simulator": Fully self-contained local state trading simulator with random real-time market price-drifting tick loop.
2. "Alpaca Live Trading": Connects to the real Alpaca Trade API using client-provided API Credentials with support for real-time portfolio fetch, order execution status, and position queries.

Core High-Fidelity Specs:

1. Visual Identity & Aesthetic Choices:
- Color Palette: Deep Slate Charcoal (#090a0f backgrounds, #121420 panel cards), cool grays, vibrant neon green accents (#00e676) for bullish assets/healthy states, and pure crimson ruby (#ff1744) for bearish alerts/drawdown hazards.
- Typography: Use "Space Grotesk" or "Outfit" for display heading sections, paired with "Inter" for secondary user interface text, and "JetBrains Mono" or "Fira Code" for stock symbols, prices, numbers, calculations, and bot logs.
- Negative Space & Proportional Layout: Generous margins, clean borders, dense high-fidelity columns, and modern subtle transitions (using `motion/react` if desired or CSS transitions) to reinforce a cohesive institutional look. No cheap-looking full-page gradient slop.

2. State Ref Buffer & Performance Loop:
- Standard setInterval intervals cause massive rendering re-creation bugs in React when combined with real-time fetch routines.
- Maintain a stable React `useRef` (e.g. `stateRef`) synchronizing live states like mockPositions, active margins, and API credentials dynamically every render loop. This ensures background tickers always run operations against fresh state values without memory leaks or race triggers.

3. Dynamic Margin, Equity, & Buying Power Engine:
- Calculate account equity on the fly: Cash Balance + Net Market Value of all held positions.
- Track Net Market Value (long stock values - short positions).
- Calculate Leverage: Total Asset Exposure divided by Net Account Equity.
- Implement Risk warning threshold (e.g. 80%). Calculate Margin Capacity Used dynamically: Maintenance Margin Requirement / Net Account Equity. Trigger automated warnings when capacity exceeds safety thresholds.

4. Position Sparklines:
- Embed a custom SVG sparkline in every active position row. It must generate 24 hours of pseudo-historical hourly data trailing up to the active live unrealized profit & loss.
- As live drift ticks occur, append the latest unrealized P/L data points to the sparkline array on-the-fly and slide the historical window (keeping exactly 24 points) to produce an active oscilating waveform.

5. Sentry Autopilot Bot Engine:
- Include a separate Sentry Autopilot Control Center panel with a master switch (🔴 START / 🟢 ONLINE) and interval selector. It must execute one of three specialized strategies:
  * 🤖 "Gemini AI Smart Director": Periodically packages active positions, cash, equity, and leverage to query `POST /api/gemini/autopilot` sending structured JSON instructions back (BUY, SELL, HOLD, Qty, and written justification).
  * 🛡️ "Deleverage Margin Defender (Self-Healer)": If Margin Capacity surpasses user's warning limit, the bot initiates automated micro-liquidations on high-beta long holdings (or covers short-shocks) sequentially to guide portfolio stability back to a safe harbor.
  * ⚡ "Quick micro-Scalper (Momentum Oscillator)": A highly reactive technical momentum crawler seeking support/resistance breakout fluctuations on targeted stocks.
- Implement Sentry Loss Guard (Drawdown Shield Protection checkbox): If checked, the bot's standard buy strategies are run through a strict filter preventing buy-orders on tickers currently running an unrealized paper loss. This blocks dangerous amateur average-down traps on losing tickers (such as TSLA).

6. Advanced Gemini Stress-Test Analyzer:
- Feature a "Run 24h Stress Diagnostic" module that hits `POST /api/gemini/analyze` to trigger a simulated macroeconomic downside event.
- It must generate a stress test table highlighting portfolio equity, margin alert thresholds, and individual position liquidation threat risks under standard market-wide shocks (-10% Correction, -20% contraction, -30% systemic flash crash) utilizing high-fidelity markdown formatting.

7. Crash-Proof & Sandbox Fallbacks:
- To allow the app to work seamlessly even in empty/sandboxed environment before the user binds their `GEMINI_API_KEY`, both API endpoints (/api/gemini/autopilot and /api/gemini/analyze) must inspect for environment API key presence.
- If missing or if the API hits a 429 quota exhaustion, gracefully trigger highly detailed local high-fidelity fallback response calculations containing mechanical simulations and offline algorithms. The terminal must continue running uninterrupted with a sandbox alert.

Develop this app as a flawless, complete, production-ready full-stack Next.js 14+ system without placeholders. Organize the UI elegantly with manual trading widgets, interactive tickers, live log stream timelines, and beautiful performance metrics.
```
