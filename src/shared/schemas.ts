import { z } from 'zod';
import { TLDS } from './types';
import type { Candidate, NameInputs, NamingPlan, Pick, ProjectProfile } from './types';

export const KindSchema = z.enum(['startup', 'side-project', 'dev-tool']);
export const FeelSchema = z.enum(['professional', 'short-cool', 'random-fun']);
export const AudienceSchema = z.enum(['developers', 'everyday', 'businesses']);
export const TldSchema = z.enum(TLDS);

export const ProjectProfileSchema = z.object({
  title: z.string().optional(),
  summary: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(3).max(8),
}) satisfies z.ZodType<ProjectProfile>;

export const NameInputsSchema = z.object({
  kind: KindSchema,
  feels: z.array(FeelSchema).min(1).max(2),
  audience: AudienceSchema,
  keep: z.array(z.string()),
  avoid: z.array(z.string()),
  tlds: z.array(TldSchema).max(5),
}) satisfies z.ZodType<NameInputs>;

/** Supervisor / analyze output. */
export const AnalyzeOutputSchema = z.object({
  profile: ProjectProfileSchema,
  suggested: NameInputsSchema,
});

/** Supervisor / plan output. */
export const NamingPlanSchema = z.object({
  namers: z.array(z.object({ feel: FeelSchema, count: z.number().int().positive() })).min(1).max(2),
  twist: z.string(),
  reasoning: z.string(),
}) satisfies z.ZodType<NamingPlan>;

export const CandidateSchema = z.object({
  name: z.string().min(1),
  from: z.union([FeelSchema, z.literal('feedback')]),
  meaning: z.string(),
}) satisfies z.ZodType<Candidate>;

/** Namer output. */
export const CandidatesSchema = z.array(CandidateSchema);

export const PickSchema = z.object({
  name: z.string().min(1),
  whyItFits: z.string(),
}) satisfies z.ZodType<Pick>;

/** Supervisor / pick output as the contract defines it: Pick[]. */
export const PicksSchema = z.array(PickSchema);

/** Supervisor / pick output with the one-sentence "what was dropped and why" for the log. */
export const PickResultSchema = z.object({
  picks: PicksSchema,
  dropped: z.string(),
});

/** Domain checker output. */
export const VariantsSchema = z.array(
  z.object({ for: z.string().min(1), variants: z.array(z.string().min(1)).max(3) }),
);

/** Feedback agent output. */
export const FeedbackOutputSchema = z.object({
  reply: z.string(),
  names: z.array(CandidateSchema).min(1).max(5),
  tlds: z.array(TldSchema).max(5).optional(),
});
