# Contract change proposals

## Block A: `whyItFits` on feedback names
`NameCard.whyItFits` is required, but `FeedbackOutputSchema.names` is `Candidate[]` with no `whyItFits`.
**Proposal:** `FeedbackOutputSchema.names` → `z.array(CandidateSchema.extend({ whyItFits: z.string() })).min(1).max(5)`.
**Workaround in place:** `workflows/refine-names.ts` validates with a local `FeedbackOutputSchema.extend(...)` that adds it. The output is still a valid `FeedbackOutputSchema` value, so nothing else breaks.
