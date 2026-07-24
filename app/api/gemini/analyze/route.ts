import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const dynamic = "force-dynamic";

const apiKey = process.env.GEMINI_API_KEY;

// Shared mechanical fallback generator
function getLocalFallbackDiagnosis(equity: number, leverage: number, errorSnippet?: string) {
  const discountedEquity10 = (equity * 0.9).toFixed(2);
  const discountedEquity20 = (equity * 0.8).toFixed(2);
  const discountedEquity30 = (equity * 0.7).toFixed(2);

  const prefix = errorSnippet 
    ? `### ⚠️ AI Stress Analysis (Local Fallback - ${errorSnippet})\n\nDue to temporary AI service constraints (${errorSnippet}), we are displaying a high-fidelity local matrix fallback:` 
    : `### ⚠️ AI Stress Analysis (Sandbox Mode)\n\nTo enable active real-time Gemini reasoning, configure a \`GEMINI_API_KEY\` in your secrets settings. Here is a baseline mechanical simulation of your current exposure:`;

  return {
    diagnosis: `${prefix}

#### 📉 Simulated Stress Test Matrix

| Macro Shock Severity | Projected Portfolio Equity | Projected Margin Alert | Liquidation Threat Risk |
| :--- | :--- | :--- | :--- |
| **-10% Market Correction** | $${discountedEquity10} | None (Stable) | Minimal |
| **-20% Market Contraction** | $${discountedEquity20} | Position Warning | Low-Medium |
| **-30% Flash Crash** | $${discountedEquity30} | Margin Call (Deficit) | Critical |

#### 🔍 Sandboxed General Risk Remediation
1. **Asset Volatility Profile**: High beta long positions suffer disproportionate drawdowns when total portfolio leverage exceeds **${leverage}x**.
2. **Mitigation Strategy**: Ensure cash reserves cover maintenance requirements. Consider scaling back leveraged holdings or setting mechanical stop alerts before volatility expands.`,
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

  const { positions, cash, equity, buyingPower, leverage, warnThreshold, criticalThreshold, maxExposurePercentPerSymbol, strategy } = body;

  // 1. Primary Fallback: No API Key configured
  if (!apiKey) {
    const fallback = getLocalFallbackDiagnosis(equity, leverage);
    return NextResponse.json(fallback);
  }

  try {
    // Initialize modern @google/genai client
    const genAI = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const activePositionsStr = Array.isArray(positions) && positions.length > 0
      ? positions.map((p: any) => `- **${p.symbol}**: Qty ${p.qty} | Current Price $${p.current_price} | Entry Price $${p.avg_entry_price} | Market Value $${p.market_value?.toFixed(2) || (p.qty * p.current_price).toFixed(2)}`).join("\n")
      : "No active holdings (fully liquid in Cash).";

    const prompt = `You are a senior portfolio risk analyst and automated algorithm optimizer. Produce a concise, high-signal diagnostic and parameter refinement report.

Account Context:
- Portfolio Total Equity: $${equity}
- Cash Balance: $${cash}
- Net Buying Power: $${buyingPower}
- Portfolio Leverage: ${leverage}x
- Current Strategy: ${strategy}

Current Autopilot Thresholds:
- Position Warn Threshold: ${warnThreshold}%
- Position Critical Threshold: ${criticalThreshold}%
- Max Exposure per Symbol: ${maxExposurePercentPerSymbol}%
- Active Positions:
${activePositionsStr}

Requirements:
1. RISK VERDICT: One-line overall risk assessment.
2. NUMERIC RISK SIGNALS: Extract exact numbers for:
   - Concentration Risk (Max weight of single asset)
   - Liquidity Risk (Cash/Equity ratio)
   - Leverage Risk (Maintenance Margin / Equity)
3. THRESHOLD COMPARISON: Compare current signals against the provided thresholds (${warnThreshold}%, ${criticalThreshold}%, etc.).
4. PARAMETER CHANGES: Return exact recommended changes to specific autopilot parameters (e.g., "Change Max Exposure per Symbol from ${maxExposurePercentPerSymbol}% to 8%") to optimize for current market volatility.
5. STRESS TEST: Matrix for -10%, -20%, and -30% market shocks.

Keep the tone professional, deterministic, and direct. No conversational filler.`;

    let responseText = "";
    let lastError: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await genAI.models.generateContent({
          model: "gemini-1.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            maxOutputTokens: 1000,
            temperature: 0.2,
          }
        });
        responseText = result.text || "";
        if (responseText) break;
      } catch (apiErr: any) {
        lastError = apiErr;
        const errorMsg = apiErr?.message || String(apiErr);
        console.warn(`Gemini Analyze connection attempt ${attempt}/3 failed: ${errorMsg}`);
        
        if (errorMsg.includes("leaked") || errorMsg.includes("API_KEY_INVALID")) {
          return NextResponse.json({ 
            error: "Your GEMINI_API_KEY has been reported as leaked or is invalid. Please generate a new key at https://aistudio.google.com/ and update your .env.local file.",
            leaked: true
          });
        }
        
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    if (!responseText) {
      throw lastError || new Error("Failed to generate content after 3 attempts");
    }

    const resultResult = {
      diagnosis: responseText || "No diagnostics return received from AI model.",
      sandbox: false,
    };
    console.log("--- AI DIAGNOSIS START ---");
    console.log(resultResult.diagnosis);
    console.log("--- AI DIAGNOSIS END ---");
    return NextResponse.json(resultResult);
  } catch (error: any) {
    const errorMessage = error?.message || error?.toString() || "Unknown API Error";
    const isQuota = errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED");

    if (isQuota) {
      console.warn("Gemini Risk Diagnostics: Quota rate-limit (429) activated. Engaging local high-fidelity stress fallback beautifully.");
    } else {
      console.error("Gemini diagnostic handler failed:", error);
    }
    
    // 2. Secondary Fallback: Rate Limit (429) or other API error
    const errorSnippet = isQuota
      ? "Rate Limited (429)"
      : "Service Unavailable";

    const fallback = getLocalFallbackDiagnosis(equity, leverage, errorSnippet);
    return NextResponse.json(fallback);
  }
}
