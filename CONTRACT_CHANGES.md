# Contract change proposals

## Done
- **`whyItFits` on feedback names (Block A):** applied on `integration`. `FeedbackOutputSchema.names` is now `z.array(CandidateSchema.extend({ whyItFits: z.string() })).min(1).max(5)`. The local workaround in `workflows/refine-names.ts` is removed.
