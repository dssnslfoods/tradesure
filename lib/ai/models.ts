/**
 * Curated catalog of AI models supported by the signal analyzer. Each entry
 * is shown in the admin model picker (/dashboard/schedule). When admin saves
 * a selection the `id` is written to app_settings.backtest_schedule.ai_model
 * and read by /api/webhook/process at signal time.
 *
 * Adding a new model: append an entry here, no code changes needed elsewhere
 * unless the provider's response schema differs (then update the adapter).
 */
export type AiProvider = "openai" | "gemini";

export interface AiModelOption {
  provider: AiProvider;
  id: string;          // raw model id passed to the provider's API
  label: string;       // shown in dropdown
  description?: string; // short hint, shown next to label
  recommended?: boolean;
}

export const AI_MODELS: AiModelOption[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────────
  {
    provider: "openai",
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    description: "เร็ว · ราคาถูก · JSON mode (default)",
    recommended: true,
  },
  {
    provider: "openai",
    id: "gpt-4o",
    label: "GPT-4o",
    description: "ฉลาดกว่า · แพงกว่า ~10x",
  },
  {
    provider: "openai",
    id: "gpt-4.1",
    label: "GPT-4.1",
    description: "ใหม่กว่า · ความเข้าใจ context ดีขึ้น",
  },
  {
    provider: "openai",
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    description: "ใหม่ · ราคาถูก",
  },
  {
    provider: "openai",
    id: "gpt-4-turbo",
    label: "GPT-4 Turbo",
    description: "stable older model",
  },
  {
    provider: "openai",
    id: "o1-mini",
    label: "o1 mini (reasoning)",
    description: "คิดก่อนตอบ · ช้าแต่ตรรกะดี",
  },
  // ── Google Gemini ──────────────────────────────────────────────────────
  {
    provider: "gemini",
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "เร็ว · free tier ใจดี",
    recommended: true,
  },
  {
    provider: "gemini",
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "ฉลาดสุดของ Google · multimodal",
  },
  {
    provider: "gemini",
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    description: "previous gen",
  },
  {
    provider: "gemini",
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    description: "1M context window",
  },
  {
    provider: "gemini",
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    description: "stable เก่า",
  },
];

export const DEFAULT_AI_MODEL = "gpt-4o-mini";

export function findModel(id: string): AiModelOption | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

/** Returns provider for a given model id, defaulting to openai if unknown. */
export function providerFor(modelId: string): AiProvider {
  return findModel(modelId)?.provider ?? "openai";
}
