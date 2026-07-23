
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config({ path: ".env.local" });

const apiKey = process.env.GEMINI_API_KEY;

async function test() {
  if (!apiKey) {
    console.error("No API key found in .env.local");
    return;
  }
  const ai = new GoogleGenAI({ apiKey });
  try {
    console.log("Listing models...");
    const models = await ai.models.list();
    console.log("Models found:", models.map(m => m.name));
  } catch (err) {
    console.error("List models failed:", err);
  }
}

test();
