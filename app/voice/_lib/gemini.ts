"use client";

export const DEFAULT_MODEL = "gemini-2.5-flash";

type GenerateOptions = {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type GenerateResult = {
  text: string;
  finishReason: string;
};

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; code?: number; status?: string };
};

export async function generateText(opts: GenerateOptions): Promise<GenerateResult> {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    systemPrompt,
    userPrompt,
    temperature = 0.7,
    maxOutputTokens = 8192,
  } = opts;

  if (!apiKey) {
    throw new Error("No API key set. Add your Gemini API key in Settings.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature,
      maxOutputTokens,
      topP: 0.95,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: GeminiResponse = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.error?.message ?? `Gemini API returned HTTP ${res.status}`;
    throw new Error(msg);
  }

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Request blocked by Gemini: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason ?? "UNKNOWN";

  const text = candidate?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    if (finishReason === "SAFETY") {
      throw new Error("Gemini blocked the response for safety reasons.");
    }
    if (finishReason === "RECITATION") {
      throw new Error("Gemini blocked the response over recitation concerns.");
    }
    throw new Error(`Gemini returned an empty response (finishReason: ${finishReason}).`);
  }

  return { text, finishReason };
}
