import { Mastra } from '@mastra/core';
import { agents } from './agents';
import { analyzeProject } from './workflows/analyze-project';
import { generateNames } from './workflows/generate-names';
import { refineNames } from './workflows/refine-names';

export const mastra = new Mastra({
  agents,
  workflows: { analyzeProject, generateNames, refineNames },
});
