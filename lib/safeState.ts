export type SafeStateCallbacks = {
  cancelOrders?: () => Promise<void>;
  pauseAutopilot?: () => void;
  resumeAutopilot?: () => void;
  addLog?: (symbol: string, action: string, message: string, status: 'SUCCESS' | 'WARNING' | 'CRITICAL' | 'INFO') => void;
  showToast?: (message: string, type?: 'SUCCESS' | 'WARNING' | 'CRITICAL' | 'INFO') => void;
  onChange?: (isSafe: boolean, reason?: string) => void;
};

export class SafeStateManager {
  private _isSafe = false;
  private _reason: string | null = null;
  private callbacks: SafeStateCallbacks;

  constructor(callbacks: SafeStateCallbacks = {}) {
    this.callbacks = callbacks;
    // restore persisted safe state if present
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem("sentry:safeState");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.active) {
            this._isSafe = true;
            this._reason = parsed.reason || "restored";
            this.callbacks.onChange?.(true, this._reason);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  isSafe() {
    return this._isSafe;
  }

  reason() {
    return this._reason;
  }

  async enterSafeState(reason = "manual") {
    if (this._isSafe) return;
    this._isSafe = true;
    this._reason = reason;

    try {
      this.callbacks.addLog?.('SYSTEM', 'SAFE_STATE_ENTER', `Entering safe state: ${reason}`, 'WARNING');
      this.callbacks.showToast?.(`Safe state: ${reason}`, 'WARNING');
      // persist
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("sentry:safeState", JSON.stringify({ active: true, reason }));
        }
      } catch (e) {
        // ignore
      }
      // cancel unresolved orders if available
      if (this.callbacks.cancelOrders) {
        try {
          await this.callbacks.cancelOrders();
          this.callbacks.addLog?.('SYSTEM', 'SAFE_STATE_CANCEL_ORDERS', 'Cancelled unresolved orders during safe state entry.', 'SUCCESS');
        } catch (e: any) {
          this.callbacks.addLog?.('SYSTEM', 'SAFE_STATE_CANCEL_ORDERS_ERROR', String(e?.message || e), 'WARNING');
        }
      }

      // pause autopilot if provided
      try {
        this.callbacks.pauseAutopilot?.();
      } catch (e: any) {
        this.callbacks.addLog?.('SYSTEM', 'SAFE_STATE_PAUSE_ERROR', String(e?.message || e), 'WARNING');
      }

      this.callbacks.onChange?.(true, reason);
    } catch (err) {
      // swallow
    }
  }

  async exitSafeState(reason = "recovered") {
    if (!this._isSafe) return;
    this._isSafe = false;
    this._reason = reason;

    try {
      this.callbacks.addLog?.('SYSTEM', 'SAFE_STATE_EXIT', `Exiting safe state: ${reason}`, 'INFO');
      this.callbacks.showToast?.(`Resuming operations: ${reason}`, 'SUCCESS');
      // persist
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("sentry:safeState", JSON.stringify({ active: false, reason }));
        }
      } catch (e) {
        // ignore
      }
      // resume autopilot if provided
      try {
        this.callbacks.resumeAutopilot?.();
      } catch (e: any) {
        this.callbacks.addLog?.('SYSTEM', 'SAFE_STATE_RESUME_ERROR', String(e?.message || e), 'WARNING');
      }
      this.callbacks.onChange?.(false, reason);
    } catch (err) {
      // swallow
    }
  }
}

export default SafeStateManager;
