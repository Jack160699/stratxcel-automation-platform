// Run with: node --experimental-strip-types lib/agent-core/__tests__/agent-dispatch.test.ts
import assert from "node:assert/strict";
import { parseAgentDispatchPrefix } from "../agent-dispatch-parser.ts";

function run() {
  // Real match: key + remainder split correctly, key lowercased.
  {
    const parsed = parseAgentDispatchPrefix("AGENT:Growth_Specialist: what's our biggest opportunity right now");
    assert.deepEqual(parsed, { key: "growth_specialist", remainder: "what's our biggest opportunity right now" });
  }

  // Extra whitespace around colons and the whole message is tolerated.
  {
    const parsed = parseAgentDispatchPrefix("  agent : sales-bot :   hello there  ");
    assert.deepEqual(parsed, { key: "sales-bot", remainder: "hello there" });
  }

  // No colon after "agent" at all -- not a dispatch, falls through untouched.
  {
    assert.equal(parseAgentDispatchPrefix("agent smith is a great movie"), null);
  }

  // A message that merely CONTAINS "agent:" mid-sentence must not match --
  // anchored to the start, same discipline as command-parser.ts.
  {
    assert.equal(parseAgentDispatchPrefix("please ask agent: bob about this"), null);
  }

  // Key present but empty remainder after the second colon -- not a valid dispatch.
  {
    assert.equal(parseAgentDispatchPrefix("AGENT:growth_specialist:"), null);
    assert.equal(parseAgentDispatchPrefix("AGENT:growth_specialist:   "), null);
  }

  // Invalid key shape (spaces, too short) never matches at all.
  {
    assert.equal(parseAgentDispatchPrefix("AGENT:not a valid key: message"), null);
    assert.equal(parseAgentDispatchPrefix("AGENT::message"), null);
  }

  // A real message containing multiple colons keeps everything after the
  // second one as the remainder, unmodified (e.g. a time or a URL).
  {
    const parsed = parseAgentDispatchPrefix("AGENT:ops: meeting at 10:30 today");
    assert.deepEqual(parsed, { key: "ops", remainder: "meeting at 10:30 today" });
  }

  console.log("agent-dispatch.test.ts (lib/agent-core): ALL PASS");
}

run();
