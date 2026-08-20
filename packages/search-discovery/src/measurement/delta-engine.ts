import { createHash } from "node:crypto";
import type {
  CompetitorDeltaResult,
  CompetitorDeltaType,
  CompetitorQuerySnapshot,
} from "./types.ts";

function stableFingerprint(parts: string[]): string {
  return createHash("sha256")
    .update(parts.map((p) => p.trim().toLowerCase()).join("\u001f"))
    .digest("hex");
}

export interface DeltaEngineInput {
  previousSnapshots?: CompetitorQuerySnapshot[];
  currentSnapshots: CompetitorQuerySnapshot[];
  clientBusinessName: string;
}

/**
 * Computes historical ranking and competitive deltas between consecutive snapshots.
 * Detects client/competitor rank gains and losses with idempotent fingerprints.
 */
export function computeCompetitorDeltas(input: DeltaEngineInput): CompetitorDeltaResult[] {
  const deltas: CompetitorDeltaResult[] = [];
  const prevMap = new Map<string, CompetitorQuerySnapshot>();

  if (input.previousSnapshots) {
    for (const s of input.previousSnapshots) {
      prevMap.set(s.query.toLowerCase().trim(), s);
    }
  }

  for (const curr of input.currentSnapshots) {
    const qKey = curr.query.toLowerCase().trim();
    const prev = prevMap.get(qKey);

    for (const compCurr of curr.competitors) {
      const compPrev = prev?.competitors.find(
        (c) => c.domain.toLowerCase() === compCurr.domain.toLowerCase()
      );

      const prevClientPos = prev?.clientPosition ?? null;
      const currClientPos = curr.clientPosition;
      const prevCompPos = compPrev?.position ?? null;
      const currCompPos = compCurr.position;

      let deltaType: CompetitorDeltaType = "NO_CHANGE";
      let summary = "";

      if (prevClientPos === null && currClientPos !== null) {
        deltaType = "CLIENT_GAINED";
        summary = `${input.clientBusinessName} gained search ranking at #${currClientPos} for "${curr.query}".`;
      } else if (prevClientPos !== null && currClientPos === null) {
        deltaType = "CLIENT_LOST";
        summary = `${input.clientBusinessName} dropped out of top search results for "${curr.query}" (was #${prevClientPos}).`;
      } else if (prevClientPos !== null && currClientPos !== null && currClientPos < prevClientPos) {
        deltaType = "CLIENT_GAINED";
        summary = `${input.clientBusinessName} improved from #${prevClientPos} to #${currClientPos} for "${curr.query}".`;
      } else if (prevClientPos !== null && currClientPos !== null && currClientPos > prevClientPos) {
        deltaType = "CLIENT_LOST";
        summary = `${input.clientBusinessName} slipped from #${prevClientPos} to #${currClientPos} for "${curr.query}".`;
      } else if (prevCompPos !== null && currCompPos !== null && currCompPos < prevCompPos) {
        deltaType = "COMPETITOR_GAINED";
        summary = `${compCurr.businessName} gained ground from #${prevCompPos} to #${currCompPos} for "${curr.query}".`;
      } else if (prevCompPos !== null && currCompPos !== null && currCompPos > prevCompPos) {
        deltaType = "COMPETITOR_LOST";
        summary = `${compCurr.businessName} dropped from #${prevCompPos} to #${currCompPos} for "${curr.query}".`;
      } else if (prev === undefined) {
        deltaType = "UNKNOWN";
        summary = `Initial baseline snapshot established for "${curr.query}".`;
      } else {
        deltaType = "NO_CHANGE";
        summary = `Rankings remained stable for "${curr.query}".`;
      }

      const fingerprint = stableFingerprint([
        curr.query,
        compCurr.domain,
        deltaType,
        String(currClientPos ?? "unranked"),
        String(currCompPos ?? "unranked"),
      ]);

      deltas.push({
        query: curr.query,
        competitorDomain: compCurr.domain,
        deltaType,
        previousClientPosition: prevClientPos,
        currentClientPosition: currClientPos,
        previousCompetitorPosition: prevCompPos,
        currentCompetitorPosition: currCompPos,
        summary,
        fingerprint,
      });
    }
  }

  return deltas;
}
