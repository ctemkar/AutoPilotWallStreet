import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

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

  const { positions, cash, equity, buyingPower, leverage } = body;

  // 1. Primary Fallback: No API Key configured
  if (!apiKey) {
    const fallback = getLocalFallbackDiagnosis(equity, leverage);
    return NextResponse.json(fallback);
  }

  try {
    // Initialize modern @google/genai client with mandatory telemetry header
    const ai = new GoogleGenAI({
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

    const prompt = `Perform a professional portfolio risk and margin stress-test diagnostic on a trader's account.

Account Details:
- Portfolio Total Equity: $${equity}
- Cash Balance: $${cash}
- Net Buying Power: $${buyingPower}
- Portfolio Leverage: ${leverage}x
- Active Positions:
${activePositionsStr}

Please generate an interactive portfolio health diagnosis. Structurally evaluate what occurs under standard downside shock scenarios (-10%, -20%, and -30% market-wide crashes). Highlight which positions represent high risk or large margin burden under volatile conditions. Provide list of actionable advice (mitigation steps) to safeguard the account from sudden liquidation margin calls. Keep your tone professional, concise, and direct.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    return NextResponse.json({
      diagnosis: response.text || "No diagnostics return received from AI model.",
      sandbox: false,
    });
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
