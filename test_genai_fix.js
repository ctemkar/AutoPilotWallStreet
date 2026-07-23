const { GoogleGenAI } = require("@google/genai");
require('dotenv').config({ path: '.env.local' });

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hello",
    });
    console.log("Response:", response.text);
  } catch (error) {
    console.error("Error:", error.message);
  }
}
testGemini();
