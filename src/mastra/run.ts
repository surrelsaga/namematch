import { RequestContext } from '@mastra/core/request-context';
import type {
  ChatTurn, Logger, NameCard, NameInputs, ProjectProfile, SourceText,
} from '../shared/types';
import { mastra } from './index';
import { LOG_KEY } from './workflows/common';

/** Start a workflow with the session Logger in the request context; throw on anything but success. */
async function runFlow(id: 'analyzeProject' | 'generateNames' | 'refineNames', inputData: unknown, log: Logger) {
  const requestContext = new RequestContext();
  requestContext.set(LOG_KEY, log);
  // No snapshots: there is no database, and the in-memory store would grow with every run.
  const run = await mastra.getWorkflow(id).createRun({ shouldPersistSnapshot: () => false });
  const res = await run.start({ inputData: inputData as never, requestContext });
  if (res.status === 'success') return res.result as unknown;
  if (res.status !== 'failed') throw new Error(`Workflow ${id} ended as ${res.status}`);
  // The error can come back as a plain object; always throw a real Error with a readable message.
  const e: unknown = res.error;
  throw e instanceof Error ? e : new Error((e as { message?: string } | undefined)?.message ?? String(e));
}

export async function analyzeProject(
  source: SourceText, log: Logger,
): Promise<{ profile: ProjectProfile; suggested: NameInputs }> {
  return (await runFlow('analyzeProject', source, log)) as { profile: ProjectProfile; suggested: NameInputs };
}

export async function generateNames(
  profile: ProjectProfile, inputs: NameInputs, log: Logger,
): Promise<NameCard[]> {
  return ((await runFlow('generateNames', { profile, inputs }, log)) as { cards: NameCard[] }).cards;
}

/** Returns only the new round's cards; the server puts them in front of session.cards. */
export async function refineNames(
  ctx: {
    profile: ProjectProfile; inputs: NameInputs; cards: NameCard[];
    chat: ChatTurn[]; message: string; round: number;
  },
  log: Logger,
): Promise<{ reply: string; cards: NameCard[]; inputs: NameInputs }> {
  return (await runFlow('refineNames', ctx, log)) as { reply: string; cards: NameCard[]; inputs: NameInputs };
}
