import type { Agent } from '@mastra/core/agent';
import type { z } from 'zod';

/** Pull the JSON out of a reply that may have code fences or chatter around it. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[{[]/);
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

const API_RETRIES = 3;

/**
 * How long to wait before retrying a failed API call, or null if it isn't worth retrying.
 * Google's free tier answers 429 with "retryDelay": "46s", and a 500/503 is usually a blip.
 */
export function backoffMs(err: unknown, attempt: number): number | null {
  const { statusCode, responseBody } = err as { statusCode?: number; responseBody?: unknown };
  if (![429, 500, 502, 503, 504].includes(statusCode ?? 0)) return null;
  const secs = Number(String(responseBody).match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1]);
  return Math.min(secs ? (secs + 1) * 1000 : 8000 * (attempt + 1), 60_000);
}

async function generateText(agent: Agent, prompt: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await agent.generate(prompt)).text;
    } catch (e) {
      const wait = backoffMs(e, attempt);
      if (wait === null || attempt >= API_RETRIES) throw e;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Non-streaming agent call, final answer only, zod validated, one retry with the error appended. */
export async function generateJson<T>(agent: Agent, prompt: string, schema: z.ZodType<T>): Promise<T> {
  let next = prompt;
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateText(agent, next);
    try {
      return schema.parse(JSON.parse(extractJson(text)));
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      next = `${prompt}\n\nYour previous reply was not valid: ${lastError}\nReply again with only the corrected JSON.`;
    }
  }
  throw new Error(`Agent "${agent.id}" did not return valid JSON after a retry: ${lastError}`);
}
