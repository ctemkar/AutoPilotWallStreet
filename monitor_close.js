// monitor_close.js
// Polls /api/alpaca/quote?symbol=AAPL and liquidates the AAPL position
// if price <= threshold. Runs up to maxDurationMs (5 hours) and exits.

const THRESHOLD = 278.4234; // entry 288.4234 - 10
const INTERVAL_MS = 10000; // 10s
const MAX_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours
const QUOTE_URL = 'http://localhost:3000/api/alpaca/quote?symbol=AAPL';
const LIQ_URL = 'http://localhost:3000/api/alpaca/liquidate';

(async function monitor() {
  const start = Date.now();
  console.log(new Date().toISOString(), 'Monitor starting. Threshold:', THRESHOLD);
  while (Date.now() - start < MAX_DURATION_MS) {
    try {
      const resp = await fetch(QUOTE_URL, { cache: 'no-store' });
      const j = await resp.json();
      const price = Number(j?.price || 0);
      console.log(new Date().toISOString(), 'Quote:', price, 'source:', j?.source || 'unknown');
      if (Number.isFinite(price) && price > 0 && price <= THRESHOLD) {
        console.log(new Date().toISOString(), 'Threshold breached. Attempting liquidation...');
        try {
          const r = await fetch(LIQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isPaper: false, symbol: 'AAPL' }),
          });
          const res = await r.json();
          console.log(new Date().toISOString(), 'Liquidation response:', JSON.stringify(res));
        } catch (le) {
          console.error(new Date().toISOString(), 'Liquidation error:', le.message || le);
        }
        process.exit(0);
      }
    } catch (e) {
      console.error(new Date().toISOString(), 'Poll error:', e.message || e);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  console.log(new Date().toISOString(), 'Monitor timeout reached; exiting.');
  process.exit(0);
})();
