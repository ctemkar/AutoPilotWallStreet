# TODO

- [x] Increase autopilot allocation target toward 60-70% of capital.
- [x] Broaden the default scan universe beyond a tech-heavy list.
- [x] Verify live order sizing against real buying power and account balance. (Forced Paper mode for safety).
- [x] Implement friction-aware P&L modal with partial liquidation support.
- [x] Fix Alpaca 403 "insufficient qty" errors by aligning precision floor (4 decimals) and using DELETE for full-exit.
- [ ] Reduce Alpaca API rate-limit pressure by lowering refresh frequency.
- [ ] Make AI diagnostics more actionable and less sector-biased.
- [ ] Confirm the app restarts cleanly on port 3000.
- [x] Run a small live/paper autopilot smoke test. (Fix validated via 403 logs).
