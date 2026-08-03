# @stratxcel/hermes-contract

Framework-neutral TypeScript contract for the Stratxcel &lt;-&gt; Hermes Agent mission
protocol: zod schemas plus their inferred types, nothing else. See
[docs/hermes/API_CONTRACT.md](../../docs/hermes/API_CONTRACT.md) for the Hermes-side protocol
these types model, and [docs/hermes/ARCHITECTURE.md](../../docs/hermes/ARCHITECTURE.md) for why
the split exists.

## Status

Standalone package, not a workspace member, not imported by any application code yet. It exists
so the future integration layer has a reviewed, typed contract to build against instead of
inline `any`.

## Contents

| Module | Types |
|---|---|
| `common.ts` | Shared primitives: `TenantId`, `MissionId`, `RunId`, `ProfileName`, `IsoTimestamp` |
| `mission.ts` | `SubmitMissionRequest`, `SubmitMissionResponse`, `MissionCancellation`, `MissionResume` |
| `tools.ts` | `ToolRequest`, `ToolResult` |
| `events.ts` | `HermesExecutionEvent` |
| `approval.ts` | `ApprovalRequest`, `ApprovalDecision` |
| `artifact.ts` | `ArtifactManifest` |
| `runtime.ts` | `RuntimeHealth`, `UsageAndCost` |

## Commands

```bash
npm --prefix packages/hermes-contract run typecheck
npm --prefix packages/hermes-contract run test
```

Both run against this package only — no other package.json in the repo is touched.
