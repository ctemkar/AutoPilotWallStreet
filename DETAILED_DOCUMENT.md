# Alpaca Margin & Sentry Autopilot Technical Architecture Guide

This blueprint provides an overview of the core components, design choices, data pipelines, and intelligent risk management flows powering the Alpaca Margin & Risk Terminal.

---

## 1. System Architectural Overview

The platform uses a unified, single-screen Next.js dashboard structured to support both local simulation and live brokerage execution. It establishes an advanced full-stack sandbox capable of automated rule-based and AI directive-driven trading.

```
+-----------------------------------------------------------------------------------------+
|                                  NEXT.JS CLIENT LANDING                                 |
|                                                                                         |
|  +--------------------+   +-----------------------+   +------------------------------+  |
|  | Sim Broker Env     |   | Live Alpaca Broker    |   | Sentry Autopilot Controls    |  |
|  | - Portfolios       |   | - Rest API Client     |   | - Strategy Selector          |  |
|  | - Dynamic Drift    |   | - Secure proxy route  |   | - Sentry Loss Guard Checkbox |  |
|  +--------------------+   +-----------------------+   +------------------------------+  |
|                                       |                                                 |
|                                       v                                                 |
|                             [StateRef Engine Sync]                                      |
|                                       |                                                 |
|            +--------------------------+--------------------------+                      |
|            |                                                     |                      |
|            v                                                     v                      |
|  [POST /api/gemini/autopilot]                         [POST /api/gemini/analyze]        |
|  - Smart Strategist Decision                          - Macro Shock Stress Tests        |
|  - Local offline sandbox fallback                    - Dynamic markdown diagnosis      |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Core Functional Modules

### A. Dynamic Margin, Risk & Leverage Analyzer
The terminal calculates important risk metrics every tick (either via real-time market-drift oscillations or live API responses):
*   **Total Portfolio Equity ($E_p$):** 
    $$E_p = \text{Cash Balance} + \sum \text{Market Value of Long Positions} - \sum \text{Market Value of Short Positions}$$
*   **Net Exposure ($X_{\text{total}}$):** The absolute sum of all long and short asset values.
*   **Account Leverage ($L_a$):** 
    $$L_a = \frac{X_{\text{total}}}{E_p}$$
*   **Margin Capacity Used (%):** 
    $$\text{Margin Capacity} = \frac{\text{Maintenance Margin Requirement}}{E_p} \times 100\%$$
*   **Deleverage / Action Alert Trigger:** When Margin Capacity surpasses the user-defined safety warning threshold (default: $80\%$), the UI triggers high-intensity hazardous overlays and logs alert-events.

### B. Natural Simulator Drift Tick Engine
When running in "Simulator Mode" (Alpaca disconnected), a simulated tick engine utilizes standard Brownian motion drift percentages on held positions:
*   Generates tiny technical index movements ($\pm 1.0\%$ or $\pm 1.5\%$ on BTCUSD) periodically.
*   Recalculates current stock/crypto prices, total portfolio values, unrealized profit/loss, and dynamic account leverages seamlessly without triggering blocking browser UI hangs.

### C. Sparkline Waveform Generator
Active position rows include micro-charts mapping trail performance logs:
*   Initializes with a historical 24-point array generated sequentially using random walks around the active P/L value.
*   Every active tick, the system appends the latest unrealized P/L percentage/dollar amount onto the sparkline data array, shifts out the oldest point, and re-renders an elegant, responsive area wave styled in glowing emerald (healthy profits) or signal crimson (paper losses).

### D. Sentry Autopilot Trading Engine
A master-controlled background bot capable of continuous scanning and execution according to three modes:
1.  **🤖 Gemini AI Smart Director:** Packages active positions, cash, total equity, leverage, and margin parameters, transmitting them to `POST /api/gemini/autopilot`. Returning a unified JSON object, the system reads instructions (`BUY`, `SELL`, `HOLD`), trade-quantity, and the strategic justification which is added to the real-time bot timeline logs.
2.  **🛡️ Deleverage Margin Defender (Self-Healer):** Monitors margin parameters. If capacity exceeds thresholds, the defender steps in automatically and liquidates long exposure from high-beta holdings or covers dangerous short hedges.
3.  **⚡ Quick micro-Scalper (Momentum Oscillator):** Executes technical oscilating trades based on support/resistance dips and peaks relative to baseline spot ticks.

### E. Capital Sentry Loss Guard (Drawdown Shield Protection)
A critical feature developed specifically to address **TSLA** or other asset average-down traps under declining market scenarios:
*   **Mechanism:** When enabled, any automated `BUY` order generated by Autopilot (including Gemini AI smart recommendations or Momentum signals) is intercepted *before* transmission.
*   **The Check:** The Sentry scans current holdings. If an active position for that ticker already exists and is holding a negative unrealized P/L, the order is blocked immediately.
*   **System Log Output:** `🛡️ Loss Guard Blocked BUY of {SYMBOL}: existing position is holding a paper loss. Capital protected from average-down traps!`
*   This protects account equity by withholding further capital deployment to underperforming or falling assets.

---

## 3. High-Performance State Storage & Synchronization

Standard React hooks like `useState` inside fast interval execution arrays (`setInterval`) create a stale closure hazard, where tick functions only read initial parameter states. 

To overcome this, the architecture implements a highly scalable **Dual-Sync state pattern**:
1.  **Reactive UI State:** Keeps Standard React `useState` hooks to feed visual panels, layouts, tables, sparklines, and gauges immediately.
2.  **Stable State Ref Buffer (`stateRef`):** A React `useRef` object holding a mirrored pointer copy of all critical dynamic values (useAlpacaLive, mockPositions, alpacaPositions, simCash, isAutopilotActive, autopilotLossGuard).
3.  **Sync-Effect Loop:** A dedicated `useEffect` updating `stateRef.current` every single render cycle. This guarantees background autopilot threads can query fresh account balances, latest prices, and checkbox values without causing endless re-renders or losing runtime context.

---

## 4. Resilient API & Quota Fallbacks

Both endpoints are fully decoupled from single-point-of-failure dependencies:
*   **Api Key Detection:** If no `GEMINI_API_KEY` is bound, the server skips the API request and immediately outputs high-fidelity local fallback metrics.
*   **Quota Rate-Limit Handling (429):** If Gemini's API throws a rate limit error (Quota Exhausted) or a transient network exception, both server routes catch the error, log a warning, and shift cleanly into offline local diagnostic fallback calculations.
*   This prevents screen freezes or client crashes under heavy load, ensuring the terminal maintains 100% uptime.

---

## 5. Technical Stack Details

*   **Framework:** Next.js 14+ Custom App Router
*   **Styling:** Tailwind CSS v3/v4 Engine with clean custom grid lines.
*   **Icons:** Lucide React icons
*   **Charts & Visualizers:** Recharts API (Responsive Area Charts, def LinearGradients)
*   **Generative AI:** `@google/genai` TypeScript SDK (utilizing advanced response schema definitions)
*   **Execution Clients:** Local Drift Simulator & Alpaca Broker Node Proxy Client.
