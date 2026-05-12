/**
 * Thin REST adapter for Google's Gemini generateContent API. Returns the raw
 * text content the model produced so the caller can JSON.parse it the same
 * way it does for OpenAI responses. We use fetch directly to avoid pulling
 * in the @google/generative-ai SDK as a dependency.
 *
 * Required env: GEMINI_API_KEY (https://aistudio.google.com/apikey)
 */

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: { message?: string };
}

export async function callGemini(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0,
  apiKeyOverride?: string | null
): Promise<string> {
  const apiKey = apiKeyOverride ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY — set it in /dashboard/schedule (admin) or as Firebase env var. Get a key at https://aistudio.google.com/apikey"
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature,
      // Force JSON output — both 1.5 and 2.x Flash/Pro support this.
      responseMimeType: "application/json",
    },
    safetySettings: [
      // Trading content sometimes triggers harassment filters on Gemini.
      // Loosen them to BLOCK_ONLY_HIGH so legit financial analysis passes.
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // 30s timeout — match OpenAI defaults
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.error?.message) throw new Error(`Gemini error: ${data.error.message}`);
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finish = data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini returned empty content (finish: ${finish})`);
  }
  return text;
}
