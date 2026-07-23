
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
    console.log("Starting test with gemini-1.5-flash-8b...");
    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash-8b",
      contents: [{ role: "user", parts: [{ text: "Respond with 'SUCCESS' only." }] }],
    });
    console.log("Result object keys:", Object.keys(result));
    console.log("Prop text exists:", 'text' in result);
    if ('text' in result) {
      console.log("Result.text type:", typeof result.text);
      console.log("Result.text value:", result.text);
    }
    
    // Check for another common pattern
    if (result.response) {
      console.log("Result.response detected. Keys:", Object.keys(result.response));
      if (typeof result.response.text === 'function') {
        console.log("Result.response.text() value:", result.response.text());
      }
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
