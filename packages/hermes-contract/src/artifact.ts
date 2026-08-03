import { z } from "zod";
import { IsoTimestamp, Sha256Hex } from "./common.ts";

/**
 * How to retrieve an artifact's content. See docs/hermes/ARTIFACT_FLOW.md
 * for why a manifest never hands back a blindly-trusted bare path.
 */
export const ArtifactRetrieval = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("inline"),
    content: z.string(),
  }),
  z.object({
    method: z.literal("hermes_file"),
    /** Path inside the mission's own Docker workspace, read via a checksummed pull. */
    workspacePath: z.string().min(1),
  }),
  z.object({
    method: z.literal("external_url"),
    /** A URL Stratxcel itself controls (e.g. a stored record, a Vercel Preview URL). */
    url: z.url(),
  }),
]);
export type ArtifactRetrieval = z.infer<typeof ArtifactRetrieval>;

export const ArtifactEntry = z.object({
  artifactId: z.uuid(),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: Sha256Hex,
  retrieval: ArtifactRetrieval,
  /** Short human-readable label, e.g. "SEO/conversion report" or "Preview deployment". */
  label: z.string().min(1),
});
export type ArtifactEntry = z.infer<typeof ArtifactEntry>;

/**
 * The full set of outputs a mission produced. Persisted verbatim to
 * Stratxcel's audit log — see docs/hermes/OBSERVABILITY.md.
 */
export const ArtifactManifest = z.object({
  missionId: z.uuid(),
  generatedAt: IsoTimestamp,
  artifacts: z.array(ArtifactEntry),
});
export type ArtifactManifest = z.infer<typeof ArtifactManifest>;
