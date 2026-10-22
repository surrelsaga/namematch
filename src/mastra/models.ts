import { createOllama } from 'ollama-ai-provider-v2';

export type ModelTier = 'main' | 'fast';

/** Model for an agent: MODEL_ID for supervisor/feedback ('main'), FAST_MODEL_ID for the rest ('fast'). */
export function getModel(tier: ModelTier) {
  const id = tier === 'main' ? process.env.MODEL_ID : process.env.FAST_MODEL_ID;
  if (!id) throw new Error(`${tier === 'main' ? 'MODEL_ID' : 'FAST_MODEL_ID'} is not set`);

  if (process.env.MODEL_PROVIDER === 'ollama') {
    const baseURL = `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/api`;
    return createOllama({ baseURL })(id);
  }
  // Mastra model router; reads GOOGLE_GENERATIVE_AI_API_KEY.
  return `google/${id}`;
}
