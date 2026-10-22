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

/** Non-streaming agent call, final answer only, zod validated, one retry with the error appended. */
export async function generateJson<T>(agent: Agent, prompt: string, schema: z.ZodType<T>): Promise<T> {
  let next = prompt;
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await agent.generate(next);
    try {
      return schema.parse(JSON.parse(extractJson(text)));
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      next = `${prompt}\n\nYour previous reply was not valid: ${lastError}\nReply again with only the corrected JSON.`;
    }
  }
  throw new Error(`Agent "${agent.id}" did not return valid JSON after a retry: ${lastError}`);
}
