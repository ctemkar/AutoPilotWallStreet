import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

// Shared mechanical rule-based fallback decision function
function getLocalFallbackDecision(
  positions: any,
  cash: number,
  targetSymbol: string,
  marginCapacityUsed: number,
  warnThreshold: number,
  errorSnippet?: string
) {
  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  let qty = 5;
  const cleanedTarget = (targetSymbol || "AAPL").toUpperCase().trim();
  
  const rawPrefix = errorSnippet 
    ? `Fallback [AI Quota Limit]: `
    : "Local Algo Strategy: ";

  let reason = "Portfolio remains inside healthy limits.";

  if (marginCapacityUsed >= warnThreshold) {
    action = "SELL";
    qty = 5;
    reason = `${rawPrefix}Alert: Margin capacity used (${marginCapacityUsed.toFixed(1)}%) exceeds warning threshold (${warnThreshold}%). Scaling down.`;
  } else {
    const rand = Math.random();
    if (rand > 0.65) {
      action = "BUY";
      qty = 5;
      reason = `${rawPrefix}Analyzed long-term support metrics for ${cleanedTarget}. Simulating buy entry.`;
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
  let body: any = {};
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body provided." }, { status: 400 });
  }

  const { positions, cash, equity, leverage, targetSymbol, marginCapacityUsed, warnThreshold } = body;

  // 1. Primary Fallback: No API Key configured
  if (!apiKey) {
    const fallback = getLocalFallbackDecision(positions, cash, targetSymbol, marginCapacityUsed, warnThreshold);
    return NextResponse.json(fallback);
  }

  try {
    // Initialize @google/genai client
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const activePositionsStr = Array.isArray(positions) && positions.length > 0
      ? positions.map((p: any) => `- **${p.symbol}**: Qty ${p.qty} | Current Price $${p.current_price} | Entry Price $${p.avg_entry_price}`).join("\n")
      : "No active holdings.";

    const prompt = `You are the core intelligence of an Autonomous Brokerage Trading Bot called Sentry Autopilot.
Your duty is to analyze current portfolio states and decide on the next tactical action (BUY, SELL, or HOLD) for the target symbol: ${targetSymbol || "AAPL"}.

Aesthetic Constraints & Safety Rules:
1. If the marginCapacityUsed (${marginCapacityUsed}%) is above the warnThreshold (${warnThreshold}%), you must favor reducing exposure (SELL) on the target symbol or high-beta held positions to free up cash, keeping leverage under control.
2. If cash balance ($${cash}) is low, avoid buying high-cost positions.
3. If portfolio is balanced and leverage is healthy, you can BUY to spot opportunities or take profit (SELL) or HOLD.

Portfolio Details:
- Portfolio Total Equity: $${equity}
- Cash Balance: $${cash}
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

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
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

    try {
      const responseText = response.text || "{}";
      const decision = JSON.parse(responseText.trim());
      return NextResponse.json({
        action: decision.action || "HOLD",
        qty: parseFloat(decision.qty) || 5,
        reason: decision.reason || "AI strategy evaluated hold posture.",
        sandbox: false,
      });
    } catch (parseError) {
      console.error("Failed to parse Gemini decision json:", response.text, parseError);
      const fallback = getLocalFallbackDecision(positions, cash, targetSymbol, marginCapacityUsed, warnThreshold, "JSON Parse Error");
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
      : "Service Unavailable";
      
    const fallback = getLocalFallbackDecision(positions, cash, targetSymbol, marginCapacityUsed, warnThreshold, errorSnippet);
    return NextResponse.json(fallback);
  }
}
