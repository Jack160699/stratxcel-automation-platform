import type { ConceptArchetype, CreativeBrief, CreativeConcept } from "../types.ts";

const DEFAULT_ARCHETYPES: readonly ConceptArchetype[] = [
  "educational",
  "proof-driven",
  "aspirational",
  "product-led",
  "authority",
  "transformation",
];

function conceptFromArchetype(
  brief: CreativeBrief,
  archetype: ConceptArchetype,
  index: number,
): CreativeConcept {
  const titleByArchetype: Record<ConceptArchetype, string> = {
    educational: `Teach the turning point`,
    aspirational: `Own the next chapter`,
    "proof-driven": `Show the receipts`,
    authority: `Lead with expertise`,
    transformation: `Before → after clarity`,
    "product-led": `Product as hero`,
    "founder-led": `Founder POV`,
    "offer-led": `Offer with stakes`,
    storytelling: `Narrative arc`,
    comparison: `Us vs status quo`,
    "local-relevance": `Local proof`,
    "objection-handling": `Answer the doubt`,
  };

  return {
    id: `concept_${brief.id}_${index}_${archetype}`,
    archetype,
    title: titleByArchetype[archetype],
    hook: `${brief.hook} (${archetype})`,
    narrative: `${archetype} angle on "${brief.singleMindedObjective}" for ${brief.audienceInsight}.`,
    rationale: `Best when the mission needs a ${archetype} frame against ${brief.platform}/${brief.format}.`,
    emotionalAngle: brief.emotionalDirection,
    visualAngle: `${brief.visualDirection} · ${archetype}`,
  };
}

/** Develop at least three distinct concept archetypes from the brief. */
export function developConcepts(
  brief: CreativeBrief,
  opts: { archetypes?: readonly ConceptArchetype[]; count?: number } = {},
): CreativeConcept[] {
  const count = Math.max(3, opts.count ?? 3);
  const pool = opts.archetypes?.length ? [...opts.archetypes] : [...DEFAULT_ARCHETYPES];
  const selected: ConceptArchetype[] = pool.slice(0, count);
  while (selected.length < count) {
    selected.push(DEFAULT_ARCHETYPES[selected.length % DEFAULT_ARCHETYPES.length]!);
  }
  const concepts = selected.map((archetype, index) => conceptFromArchetype(brief, archetype, index));
  assertDistinctConcepts(concepts);
  return concepts;
}

export function assertDistinctConcepts(concepts: readonly CreativeConcept[]): void {
  if (concepts.length < 3) throw new Error("concepts_require_at_least_three");
  const archetypes = new Set(concepts.map((c) => c.archetype));
  if (archetypes.size < 3) throw new Error("concepts_must_use_distinct_archetypes");
  const ids = new Set(concepts.map((c) => c.id));
  if (ids.size !== concepts.length) throw new Error("concepts_must_have_unique_ids");
}

export function selectConceptByRationale(
  concepts: readonly CreativeConcept[],
  preferredArchetype?: ConceptArchetype,
): CreativeConcept {
  assertDistinctConcepts(concepts);
  if (preferredArchetype) {
    const match = concepts.find((c) => c.archetype === preferredArchetype);
    if (match) return match;
  }
  return (
    concepts.find((c) => c.archetype === "proof-driven") ??
    concepts.find((c) => c.archetype === "product-led") ??
    concepts[0]!
  );
}
