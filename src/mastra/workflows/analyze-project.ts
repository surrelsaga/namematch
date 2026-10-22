import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { AnalyzeOutputSchema } from '../../shared/schemas';
import type { SourceText } from '../../shared/types';
import { supervisor } from '../agents';
import { generateJson } from '../generate-json';
import { RETRY, getLog } from './common';

const SourceTextSchema = z.object({ label: z.string(), text: z.string() });

const prompt = (source: SourceText) => `Task: analyze this project and pre-fill the naming questions.

Return {"profile": {"title": "...", "summary": "...", "keywords": [...]}, "suggested": {"kind": "...", "feels": [...], "audience": "...", "keep": [], "avoid": [], "tlds": []}}

Rules:
- title: the project's current name if it has one, else leave it out.
- summary: 1 to 2 plain sentences on what it does and who it is for. No hype.
- keywords: 3 to 8 short keywords about what it does (not the current name).
- kind: "dev-tool" if developers use it to build or run software, "startup" if it is a product aimed at paying customers, "side-project" for small personal or hobby things.
- feels: 1 or 2 of "professional", "short-cool", "random-fun", whatever style of name suits the project best.
- audience: "developers", "everyday" (regular people) or "businesses".
- keep and avoid: words the name must include or must not include. Empty unless the text clearly asks for them.
- tlds: always [].

Example, for a Rust CLI that colors and groups server logs:
{"profile": {"summary": "A command line tool that groups repeated log lines and highlights errors. Made for backend engineers debugging production.", "keywords": ["logs", "cli", "debugging", "errors", "terminal"]}, "suggested": {"kind": "dev-tool", "feels": ["short-cool"], "audience": "developers", "keep": [], "avoid": [], "tlds": []}}

Example, for an invoicing SaaS for freelancers called "Billy":
{"profile": {"title": "Billy", "summary": "An app that sends invoices and chases late payments for freelancers.", "keywords": ["invoices", "payments", "freelancers", "billing"]}, "suggested": {"kind": "startup", "feels": ["professional", "short-cool"], "audience": "businesses", "keep": [], "avoid": [], "tlds": []}}

Project source (${source.label}):
"""
${source.text}
"""`;

const supervisorAnalyze = createStep({
  id: 'supervisor-analyze',
  inputSchema: SourceTextSchema,
  outputSchema: AnalyzeOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    const log = getLog(requestContext);
    log('supervisor', `Reading ${inputData.label}. This can take a minute.`);
    const out = await generateJson(supervisor, prompt(inputData), AnalyzeOutputSchema);
    out.suggested.tlds = []; // domain checks are always the user's call
    log('supervisor', `Read ${inputData.label}. ${out.profile.summary}`);
    log('supervisor', 'Filled in the questions below. Check them and change anything that is off.', 'done');
    return out;
  },
});

export const analyzeProject = createWorkflow({
  id: 'analyzeProject',
  inputSchema: SourceTextSchema,
  outputSchema: AnalyzeOutputSchema,
  retryConfig: RETRY,
})
  .then(supervisorAnalyze)
  .commit();
