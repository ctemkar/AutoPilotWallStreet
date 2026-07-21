const { GoogleGenAI } = require("@google/genai");
require('dotenv').config({ path: '.env.local' });

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key found in .env.local");
    return;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  try {
    const models = await ai.models.list();
    console.log("Available models:");
    models.forEach(m => console.log(`- ${m.name}`));

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Say hello!",
    });
    console.log("Response:", response.text);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testGemini();
