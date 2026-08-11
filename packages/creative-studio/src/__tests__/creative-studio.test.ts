import assert from "node:assert/strict";
import {
  adaptCopyAcrossPlatforms,
  applyImageEvaluation,
  applyRevisionCycle,
  assertClaimsAllowed,
  assertDistinctCarouselPages,
  assertExactBinding,
  assertNoSilentSubstitution,
  assertPackageCompositionPreserved,
  assertTenantIsolation,
  bindFinalCreativeArtifact,
  BlockedImageProvider,
  compareCandidates,
  composeCarousel,
  createArtDirection,
  createAudioPlan,
  createCreativeBrief,
  createCreativeRevisionLoop,
  createMediaProvenance,
  createRevisionState,
  createStoryboard,
  createStudioBudget,
  critiqueCreativeWork,
  developConcepts,
  editLongform,
  evaluateProductFidelity,
  generateImageCandidates,
  getPackageComposition,
  MockImageProvider,
  planCarouselPages,
  produceVideoOrReel,
  renderTypographyLayout,
  resetImageProvider,
  resetVideoProviderStatus,
  reviseFailingImageCandidate,
  runCreativeStudioPipeline,
  selectBestImageCandidate,
  selectConceptByRationale,
  selectReferenceAssets,
  setImageProvider,
  setVideoProviderStatus,
  toCreativeDirectorBrand,
  toCustomerSafeProvenance,
  writePlatformCopy,
  writeScript,
  type CreativeBriefInput,
  type ImageCandidate,
  type ReferenceAsset,
} from "../index.ts";

function baseBriefInput(overrides: Partial<CreativeBriefInput> = {}): CreativeBriefInput {
  return {
    tenantId: "tenant_a",
    missionId: "mission_1",
    businessObjective: "Increase qualified demo requests",
    audience: "B2B founders evaluating marketing automation",
    funnelPurpose: "consideration",
    positioning: "Practical creative systems, not hype",
    approvedClaims: ["trusted by operators", "built for multi-channel teams"],
    prohibitedClaims: ["miracle growth", "overnight success"],
    platform: "instagram",
    format: "image",
    productFacts: [" StratExcel Creative Studio ", "mission-bound artifacts"].map((s) => s.trim()),
    referenceAssetIds: ["ref_mission"],
    ...overrides,
  };
}

function sampleRefs(): ReferenceAsset[] {
  return [
    {
      id: "ref_mission",
      tenantId: "tenant_a",
      kind: "campaign",
      uri: "asset://mission/ref_mission",
      missionId: "mission_1",
    },
    {
      id: "ref_campaign",
      tenantId: "tenant_a",
      kind: "campaign",
      uri: "asset://campaign/ref_campaign",
      campaignId: "camp_1",
    },
    {
      id: "ref_brand",
      tenantId: "tenant_a",
      kind: "logo",
      uri: "asset://brand/logo",
      brandBrainRef: true,
    },
    {
      id: "ref_unrelated",
      tenantId: "tenant_a",
      kind: "inspiration",
      uri: "asset://other/unrelated",
    },
  ];
}

async function testConceptsAndCopy() {
  const brief = createCreativeBrief(baseBriefInput());
  const concepts = developConcepts(brief);
  assert.ok(concepts.length >= 3);
  const archetypes = new Set(concepts.map((c) => c.archetype));
  assert.ok(archetypes.size >= 3);
  const selected = selectConceptByRationale(concepts, "proof-driven");
  assert.equal(selected.archetype, "proof-driven");

  const copy = writePlatformCopy({ brief, concept: selected });
  assert.ok(copy.caption.length > 0);
  const adapted = adaptCopyAcrossPlatforms({
    brief,
    concept: selected,
    platforms: ["instagram", "linkedin", "x"],
  });
  assert.equal(adapted.length, 3);
  assert.notEqual(adapted[0]!.caption, adapted[2]!.caption);

  const script = writeScript({ brief, concept: selected, durationSeconds: 30 });
  assert.ok(script.beats.length >= 3);
  const longform = editLongform({
    brief,
    title: "Operator guide",
    draft: "A practical walkthrough of mission-bound creative production.",
  });
  assert.ok(longform.wordCount > 5);
}

async function testCreatorCriticSeparationAndBlockedClaims() {
  const brief = createCreativeBrief(baseBriefInput());
  assert.throws(() =>
    createCreativeRevisionLoop({
      creatorDepartment: "quality",
      creatorRole: "creative_critic",
      criticDepartment: "quality",
      criticRole: "creative_critic",
    }),
  );

  const loop = createCreativeRevisionLoop({
    creatorDepartment: "creative",
    creatorRole: "creative_director",
    criticDepartment: "quality",
    criticRole: "creative_critic",
  });
  assert.notEqual(`${loop.creatorDepartment}.${loop.creatorRole}`, `${loop.criticDepartment}.${loop.criticRole}`);

  // Blocked claim critique returns REJECTED — does not throw.
  const rejected = critiqueCreativeWork({
    brief,
    content: "We deliver guaranteed ROI in 7 days with miracle growth.",
    creatorDepartment: loop.creatorDepartment,
    creatorRole: loop.creatorRole,
    criticDepartment: loop.criticDepartment,
    criticRole: loop.criticRole,
  });
  assert.equal(rejected.decision, "REJECTED");

  assert.throws(() =>
    assertClaimsAllowed({
      text: "guaranteed results for every campaign",
      prohibitedClaims: brief.prohibitedClaims,
    }),
  );
}

async function testCandidateCompareRevisionAndBudget() {
  resetImageProvider();
  setImageProvider(new MockImageProvider());
  const brief = createCreativeBrief(baseBriefInput());
  const concept = selectConceptByRationale(developConcepts(brief));
  const art = createArtDirection({ brief, concept, referenceAssetIds: ["ref_mission"] });
  const budget = createStudioBudget({ maxCandidates: 3, estimatedCents: 500, reservedCents: 500 });

  const gen = await generateImageCandidates({
    brief,
    artDirection: art,
    referenceAssets: sampleRefs(),
    explicitReferenceIds: ["ref_mission", "missing_id"],
    candidateCount: 2,
    budget,
  });
  assert.equal(gen.outcome, "OK");
  assert.equal(gen.candidates.length, 2);
  assert.deepEqual(gen.candidates[0]!.referenceAssetIds, ["ref_mission"]);

  let a = applyImageEvaluation(gen.candidates[0]!, { brandFit: 70, productFidelity: 72 });
  let b = applyImageEvaluation(gen.candidates[1]!, { brandFit: 92, productFidelity: 90 });
  assert.ok(compareCandidates(b, a) > 0);
  const best = selectBestImageCandidate([a, b]);
  assert.equal(best?.id, b.id);

  const weak: ImageCandidate = {
    ...a,
    fidelityPass: false,
    scores: { ...a.scores!, productFidelity: 45 },
    overallScore: 50,
  };
  const revised = reviseFailingImageCandidate(weak);
  assert.ok((revised.overallScore ?? 0) > (weak.overallScore ?? 0));
  assert.equal(revised.revisionNumber, weak.revisionNumber + 1);

  let state = createRevisionState(2);
  state = applyRevisionCycle(state, {
    decision: "REVISION_REQUIRED",
    strengths: [],
    weaknesses: ["weak"],
    strategicProblems: [],
    brandProblems: [],
    visualProblems: [],
    copyProblems: [],
    factualConcerns: [],
    requiredRevisions: ["improve fidelity"],
    scores: [{ dimension: "brand_fit", score: 60 }],
    overallScore: 60,
    reviewerDepartment: "quality",
    reviewerRole: "creative_critic",
    creatorDepartment: "creative",
    creatorRole: "copywriter",
  });
  assert.equal(state.revisionCount, 1);
  state = applyRevisionCycle(state, {
    ...state.lastCritique!,
    decision: "REVISION_REQUIRED",
    requiredRevisions: ["again"],
  });
  state = applyRevisionCycle(state, {
    ...state.lastCritique!,
    decision: "REVISION_REQUIRED",
    requiredRevisions: ["cap"],
  });
  assert.ok(state.status === "NEEDS_ATTENTION" || state.status === "HUMAN_REVIEW");

  const over = await generateImageCandidates({
    brief,
    artDirection: art,
    referenceAssets: sampleRefs(),
    candidateCount: 10,
    budget: createStudioBudget({ maxCandidates: 2 }),
  });
  assert.equal(over.outcome, "BUDGET_EXCEEDED");
}

async function testBrandBrainAndReferences() {
  const brand = toCreativeDirectorBrand({
    business_name: "StratExcel",
    tone_of_voice: "clear and confident",
    target_audience: "growth operators",
    rules: ["no hype guarantees"],
    products: [{ name: "Creative Studio", description: "AI creative production" }],
    approved_claims: ["operator-grade workflows"],
    prohibited_claims: ["overnight success"],
  });
  assert.ok(brand.businessName === "StratExcel");
  assert.ok(brand.toneOfVoice);

  const selected = selectReferenceAssets({
    tenantId: "tenant_a",
    missionId: "mission_1",
    campaignId: "camp_1",
    library: sampleRefs(),
    explicitIds: ["ref_mission"],
  });
  assert.ok(selected.some((r) => r.id === "ref_mission"));
  assert.ok(!selected.some((r) => r.id === "ref_unrelated"));

  // Without explicit/mission/campaign, brand brain refs are allowed; unrelated still excluded.
  const brandOnly = selectReferenceAssets({
    tenantId: "tenant_a",
    missionId: "mission_none",
    library: sampleRefs().filter((r) => r.id === "ref_brand" || r.id === "ref_unrelated"),
  });
  assert.deepEqual(
    brandOnly.map((r) => r.id),
    ["ref_brand"],
  );

  assert.throws(() =>
    selectReferenceAssets({
      tenantId: "tenant_a",
      missionId: "mission_1",
      library: [
        ...sampleRefs(),
        {
          id: "ref_other_tenant",
          tenantId: "tenant_b",
          kind: "logo",
          uri: "asset://x",
        },
      ],
    }),
  );
}

async function testImageVideoUnavailableNoFake() {
  resetImageProvider();
  const brief = createCreativeBrief(baseBriefInput());
  const concept = selectConceptByRationale(developConcepts(brief));
  const art = createArtDirection({ brief, concept });

  const waiting = await generateImageCandidates({
    brief,
    artDirection: art,
    referenceAssets: sampleRefs(),
  });
  assert.equal(waiting.outcome, "WAITING_CAPABILITY");
  assert.equal(waiting.candidates.length, 0);

  setImageProvider(new BlockedImageProvider());
  const blocked = await generateImageCandidates({ brief, artDirection: art });
  assert.equal(blocked.outcome, "WAITING_CAPABILITY");
  assert.equal(blocked.candidates.length, 0);

  resetVideoProviderStatus();
  const script = writeScript({ brief: { ...brief, format: "reel" }, concept });
  const storyboard = createStoryboard({ brief, script });
  const audio = createAudioPlan({ script });
  const video = produceVideoOrReel({ brief, storyboard, audioPlan: audio });
  assert.equal(video.outcome, "WAITING_CAPABILITY");
  assert.equal(video.uri, undefined);

  setVideoProviderStatus("available");
  const okVideo = produceVideoOrReel({
    brief,
    storyboard: createStoryboard({ brief, script, preferredMode: "generative_video" }),
    audioPlan: createAudioPlan({ script, musicLicensed: true }),
  });
  assert.equal(okVideo.outcome, "OK");
  resetVideoProviderStatus();
  resetImageProvider();
}

async function testCarouselTypographyFidelityBindingProvenancePackages() {
  const brief = createCreativeBrief(baseBriefInput({ format: "carousel" }));
  const concept = selectConceptByRationale(developConcepts(brief));
  const plans = planCarouselPages({ brief, concept, pageCount: 5 });
  const carousel = composeCarousel({ brief, plans });
  assert.equal(carousel.qaPassed, true);
  assertDistinctCarouselPages(carousel.pages);
  assert.equal(new Set(carousel.pages.map((p) => p.distinctKey)).size, carousel.pages.length);

  const layoutA = renderTypographyLayout({
    width: 1080,
    height: 1080,
    elements: [{ kind: "text", content: "Hello", x: 10, y: 20, fontSize: 48 }],
  });
  const layoutB = renderTypographyLayout({
    width: 1080,
    height: 1080,
    elements: [{ kind: "text", content: "Hello", x: 10, y: 20, fontSize: 48 }],
  });
  assert.equal(layoutA.fingerprint, layoutB.fingerprint);
  assert.match(layoutA.fingerprint, /^[a-f0-9]{64}$/);

  const candidate: ImageCandidate = {
    id: "img_fidelity",
    tenantId: "tenant_a",
    missionId: "mission_1",
    status: "evaluated",
    uri: "mock://image/fidelity",
    promptRef: "art_1",
    aspectRatio: "1:1",
    candidateGroup: "g1",
    referenceAssetIds: [],
    revisionNumber: 0,
    provider: "mock",
    isPhotographyClaim: false,
    fidelityPass: false,
  };
  const fidelity = evaluateProductFidelity({
    candidate,
    observedIssues: ["wrong label color", "missing spout"],
  });
  assert.equal(fidelity.pass, false);
  assert.ok(fidelity.decision === "REVISION_REQUIRED" || fidelity.decision === "HUMAN_REVIEW");

  const art = createArtDirection({ brief, concept });
  const provenance = createMediaProvenance({
    tenantId: "tenant_a",
    missionId: "mission_1",
    department: "media",
    role: "image_producer",
    capability: "media.image_generate",
    provider: "mock",
    promptOrBriefRef: art.id,
    rawPrompt: "secret prompt",
    providerInternals: { seed: 1 },
  });
  const safe = toCustomerSafeProvenance(provenance);
  assert.equal((safe as { internalOnly?: unknown }).internalOnly, undefined);
  assertTenantIsolation({
    tenantId: "tenant_a",
    artifacts: [provenance, { tenantId: "tenant_a", id: "x" }],
  });
  assert.throws(() =>
    assertTenantIsolation({
      tenantId: "tenant_a",
      artifacts: [{ tenantId: "tenant_b", id: "leak" }],
    }),
  );

  // Fidelity failure blocks treating candidate as final-ready.
  const blockedBest = selectBestImageCandidate([{ ...candidate, fidelityPass: false }]);
  assert.equal(blockedBest, undefined);

  setImageProvider(new MockImageProvider());
  const gen = await generateImageCandidates({
    brief: createCreativeBrief(baseBriefInput()),
    artDirection: art,
    referenceAssets: sampleRefs(),
    explicitReferenceIds: ["ref_mission"],
    candidateCount: 1,
  });
  const good = applyImageEvaluation(gen.candidates[0]!);
  const final = bindFinalCreativeArtifact({
    tenantId: "tenant_a",
    missionId: "mission_1",
    mediaAssetId: good.id,
    mediaUri: good.uri!,
    copyVersionId: "copy_1",
    copySnapshot: writePlatformCopy({ brief, concept }),
    concept,
    artDirection: art,
    provenance,
  });
  assertExactBinding(final, {
    mediaAssetId: good.id,
    mediaUri: good.uri!,
    copyVersionId: "copy_1",
    conceptId: concept.id,
    artDirectionId: art.id,
    provenanceId: provenance.id,
  });
  assert.throws(() =>
    assertNoSilentSubstitution({
      tenantId: "tenant_a",
      missionId: "mission_1",
      provenance,
      mediaUri: "fake://image",
    }),
  );

  const starter = getPackageComposition("starter");
  assert.deepEqual(starter.items, [
    { mediaType: "image", quantity: 8 },
    { mediaType: "reel", quantity: 4 },
  ]);
  const growth = getPackageComposition("growth");
  assert.deepEqual(growth.items, [
    { mediaType: "image", quantity: 20 },
    { mediaType: "reel", quantity: 5 },
  ]);
  const business = getPackageComposition("business");
  assert.deepEqual(business.items, [
    { mediaType: "image", quantity: 40 },
    { mediaType: "reel", quantity: 10 },
  ]);
  const image30 = getPackageComposition("image_30");
  assert.deepEqual(image30.items, [{ mediaType: "image", quantity: 30 }]);
  assertPackageCompositionPreserved(starter, getPackageComposition("starter"));
  resetImageProvider();
}

async function testEndToEndPipeline() {
  resetImageProvider();
  resetVideoProviderStatus();

  const waiting = await runCreativeStudioPipeline({
    briefInput: baseBriefInput(),
    brandBrain: {
      business_name: "StratExcel",
      tone_of_voice: "clear",
      target_audience: "operators",
    },
    referenceAssets: sampleRefs(),
    imageProvider: null,
  });
  assert.equal(waiting.outcome, "WAITING_CAPABILITY");
  assert.equal(waiting.finalArtifact, undefined);

  const ok = await runCreativeStudioPipeline({
    briefInput: baseBriefInput(),
    brandBrain: {
      business_name: "StratExcel",
      tone_of_voice: "clear",
      rules: ["stay claim-safe"],
    },
    referenceAssets: sampleRefs(),
    imageProvider: new MockImageProvider(),
  });
  assert.equal(ok.outcome, "OK");
  assert.ok(ok.finalArtifact);
  assert.equal(ok.finalArtifact!.approved, true);
  resetImageProvider();
}

async function main() {
  await testConceptsAndCopy();
  await testCreatorCriticSeparationAndBlockedClaims();
  await testCandidateCompareRevisionAndBudget();
  await testBrandBrainAndReferences();
  await testImageVideoUnavailableNoFake();
  await testCarouselTypographyFidelityBindingProvenancePackages();
  await testEndToEndPipeline();
  console.log("creative-studio tests: ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
