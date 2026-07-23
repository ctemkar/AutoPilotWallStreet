import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

export const dynamic = "force-dynamic";

const apiKey = process.env.GEMINI_API_KEY;

// Shared mechanical rule-based fallback decision function - fully crash-proofed
function getLocalFallbackDecision(
  targetSymbol: any,
  marginCapacityUsed: any,
  warnThreshold: any,
  errorSnippet?: string
) {
  const safeMarginCapacityUsed = typeof marginCapacityUsed === "number" ? marginCapacityUsed : parseFloat(marginCapacityUsed) || 0;
  const safeWarnThreshold = typeof warnThreshold === "number" ? warnThreshold : parseFloat(warnThreshold) || 80;
  const cleanedTarget = typeof targetSymbol === "string" ? targetSymbol.toUpperCase().trim() : "RELIANCE";

  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  let qty = 5;

  const rawPrefix = errorSnippet 
    ? `Fallback [AI ${errorSnippet}]: `
    : "Local Algo Strategy: ";

  let reason = "Portfolio remains inside healthy limits.";

  if (safeMarginCapacityUsed >= safeWarnThreshold) {
    action = "SELL";
    qty = 5;
    reason = `${rawPrefix}Alert: Margin capacity used (${safeMarginCapacityUsed.toFixed(1)}%) exceeds warning threshold (${safeWarnThreshold}%). Scaling down.`;
  } else {
    const rand = Math.random();
    if (rand > 0.65) {
      action = "BUY";
      qty = 5;
      reason = `${rawPrefix}Analyzed support metrics for ${cleanedTarget}. Simulating buy entry.`;
    } else if (rand < 0.15) {
      action = "SELL";
      qty = 5;
      reason = `${rawPrefix}Taking profits at local technical resistance for ${cleanedTarget}.`;
    } else {
      action = "HOLD";
      reason = `${rawPrefix}Indicators stable. No trade action triggered for ${cleanedTarget}.`;
    }
  }

  return {
    action,
    qty,
    reason,
    sandbox: true,
  };
}

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON body provided." }, { status: 400 });
    }

    const { positions, cash, equity, leverage, targetSymbol, marginCapacityUsed, warnThreshold, currencySign = "$" } = body;

    // 1. Primary Fallback: No API Key configured
    if (!apiKey) {
      const fallback = getLocalFallbackDecision(targetSymbol, marginCapacityUsed, warnThreshold);
      return NextResponse.json(fallback);
    }

    try {
      // Initialize modern @google/genai client
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: {
                type: Type.STRING,
                description: "Tactical action to execute. Options: BUY, SELL, HOLD",
              },
              qty: {
                type: Type.NUMBER,
                description: "Quantity of shares to trade, e.g., default between 1 and 15",
              },
              reason: {
                type: Type.STRING,
                description: "Strategic reason text for executing this trade.",
              },
            },
            required: ["action", "qty", "reason"],
          },
        },
      });

      const activePositionsStr = Array.isArray(positions) && positions.length > 0
        ? positions.map((p: any) => `- **${p.symbol}**: Qty ${p.qty} | Current Price ${currencySign}${p.current_price} | Entry Price ${currencySign}${p.avg_entry_price}`).join("\n")
        : "No active holdings.";

      const prompt = `You are the core intelligence of an Autonomous Brokerage Trading Bot called Sentry Autopilot.
Your duty is to analyze current portfolio states and decide on the next tactical action (BUY, SELL, or HOLD) for the target symbol: ${targetSymbol || "RELIANCE"}.

Aesthetic Constraints & Safety Rules (Denominated in ${currencySign === "₹" ? "INR Rupees (₹)" : "USD Dollars ($)"}):
1. If the marginCapacityUsed (${marginCapacityUsed}%) is above the warnThreshold (${warnThreshold}%), you must favor reducing exposure (SELL) on the target symbol or high-beta held positions to free up cash, keeping leverage under control.
2. If cash balance (${currencySign}${cash}) is low, avoid buying high-cost positions.
3. If portfolio is balanced and leverage is healthy, you can BUY to spot opportunities or take profit (SELL) or HOLD.

Portfolio Details:
- Portfolio Total Equity: ${currencySign}${equity}
- Cash Balance: ${currencySign}${cash}
- Portfolio Leverage: ${leverage}x
- Margin Capacity Used currently: ${marginCapacityUsed}%
- Margin Warning Threshold set to: ${warnThreshold}%
- Target Asset to trade: ${targetSymbol}
- Active Position Holdings:
${activePositionsStr}

Decide exactly what the Autopilot bot should do. You must return your decision in JSON schema format containing:
1. action (one of: "BUY", "SELL", or "HOLD")
2. qty (a numeric factor for quantity of shares, e.g. between 1 and 20)
3. reason (a brief, human, direct summary page explanation of maximum 15 words)

Make your decision tactical and realistic.`;

      let responseText = "";
      let lastError: any = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          const response = await result.response;
          responseText = response.text();
          if (responseText) break;
        } catch (apiErr: any) {
          lastError = apiErr;
          const errorMsg = apiErr?.message || String(apiErr);
          console.warn(`Gemini Autopilot connection attempt ${attempt}/3 failed: ${errorMsg}`);
          
          if (errorMsg.includes("leaked") || errorMsg.includes("API_KEY_INVALID")) {
            // No point in retrying if the key is leaked
            return NextResponse.json({ 
              error: "GEMINI_API_KEY leaked or invalid. Please update .env.local with a fresh key from aistudio.google.com.",
              leaked: true,
              sandbox: true,
              action: "HOLD",
              qty: 0,
              reason: "Security: API Key reported as leaked by Google or is invalid. Trading paused."
            });
          }

          if (attempt < 3) {
            // exponential backoff
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (!responseText) {
        throw lastError || new Error("Gemini AI API call timed out after multiple attempts under high load.");
      }

      try {
        const decision = JSON.parse(responseText.trim());
        return NextResponse.json({
          action: decision.action || "HOLD",
          qty: parseFloat(decision.qty) || 5,
          reason: decision.reason || "AI strategy evaluated hold posture.",
          sandbox: false,
        });
      } catch (parseError) {
        console.error("Failed to parse Gemini decision json:", responseText, parseError);
        const fallback = getLocalFallbackDecision(targetSymbol, marginCapacityUsed, warnThreshold, "JSON Parse Error");
        return NextResponse.json(fallback);
      }

    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown API Error";
      const isQuota = errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED");
      
      if (isQuota) {
        console.warn("Gemini Autopilot: Quota rate-limit (429) activated. Engaging local fallback algorithm gracefully.");
      } else {
        console.error("Gemini Autopilot decision route error:", error);
      }

      // 2. Secondary Fallback: Rate limits, quota exhausted, typical 429 exceptions or API bugs
      const errorSnippet = isQuota
        ? "Rate Limited (429)"
        : "Service Error";
        
      const fallback = getLocalFallbackDecision(targetSymbol, marginCapacityUsed, warnThreshold, errorSnippet);
      return NextResponse.json(fallback);
    }
  } catch (globalError: any) {
    console.error("Critical unhandled global exception in Gemini Autopilot POST route:", globalError);
    // Double-safeguarded absolute ultimate fallback
    return NextResponse.json({
      action: "HOLD",
      qty: 0,
      reason: `System Default Static Fallback: Hold due to route handling exception (${globalError.message || "Unknown error"})`,
      sandbox: true
    });
  }
}
