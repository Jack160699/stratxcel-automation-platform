import { createHash } from "node:crypto";
import type {
  ArtDirectionArtifact,
  CreativeConcept,
  FinalCreativeArtifact,
  MediaProvenance,
  PlatformCopy,
  ScriptArtifact,
} from "../types.ts";

export function bindFinalCreativeArtifact(args: {
  tenantId: string;
  missionId: string;
  mediaAssetId: string;
  mediaUri: string;
  copyVersionId: string;
  copySnapshot: PlatformCopy | ScriptArtifact | { caption: string; cta: string };
  concept: CreativeConcept;
  artDirection: ArtDirectionArtifact;
  provenance: MediaProvenance;
}): FinalCreativeArtifact {
  assertNoSilentSubstitution({
    tenantId: args.tenantId,
    missionId: args.missionId,
    provenance: args.provenance,
    mediaUri: args.mediaUri,
  });

  const bindingFingerprint = createHash("sha256")
    .update(
      [
        args.tenantId,
        args.missionId,
        args.mediaAssetId,
        args.mediaUri,
        args.copyVersionId,
        args.concept.id,
        args.artDirection.id,
        args.provenance.id,
      ].join("|"),
    )
    .digest("hex");

  const artifact: FinalCreativeArtifact = {
    id: `final_${args.missionId}_${bindingFingerprint.slice(0, 10)}`,
    tenantId: args.tenantId,
    missionId: args.missionId,
    mediaAssetId: args.mediaAssetId,
    mediaUri: args.mediaUri,
    copyVersionId: args.copyVersionId,
    copySnapshot: args.copySnapshot,
    conceptId: args.concept.id,
    artDirectionId: args.artDirection.id,
    provenanceId: args.provenance.id,
    boundAtIso: new Date().toISOString(),
    bindingFingerprint,
    approved: true,
  };

  assertExactBinding(artifact, {
    mediaAssetId: args.mediaAssetId,
    mediaUri: args.mediaUri,
    copyVersionId: args.copyVersionId,
    conceptId: args.concept.id,
    artDirectionId: args.artDirection.id,
    provenanceId: args.provenance.id,
  });

  return artifact;
}

export function assertExactBinding(
  artifact: FinalCreativeArtifact,
  expected: {
    mediaAssetId: string;
    mediaUri: string;
    copyVersionId: string;
    conceptId: string;
    artDirectionId: string;
    provenanceId: string;
  },
): void {
  if (artifact.mediaAssetId !== expected.mediaAssetId) throw new Error("binding_mismatch:mediaAssetId");
  if (artifact.mediaUri !== expected.mediaUri) throw new Error("binding_mismatch:mediaUri");
  if (artifact.copyVersionId !== expected.copyVersionId) throw new Error("binding_mismatch:copyVersionId");
  if (artifact.conceptId !== expected.conceptId) throw new Error("binding_mismatch:conceptId");
  if (artifact.artDirectionId !== expected.artDirectionId) throw new Error("binding_mismatch:artDirectionId");
  if (artifact.provenanceId !== expected.provenanceId) throw new Error("binding_mismatch:provenanceId");
  if (artifact.approved !== true) throw new Error("binding_mismatch:not_approved");
}

export function assertNoSilentSubstitution(args: {
  tenantId: string;
  missionId: string;
  provenance: MediaProvenance;
  mediaUri: string;
}): void {
  if (args.provenance.tenantId !== args.tenantId) throw new Error("silent_substitution:tenant");
  if (args.provenance.missionId !== args.missionId) throw new Error("silent_substitution:mission");
  if (!args.mediaUri || args.mediaUri.includes("placeholder://") || args.mediaUri.includes("fake://")) {
    throw new Error("silent_substitution:media_uri");
  }
}
