/**
 * Same fail-safe opt-in pattern as @stratxcel/ai-runtime's
 * isLocalAiRoutingEnabled/isOpenRouterRoutingEnabled: recurring mission
 * templates can be created/listed/managed regardless of this flag, and a
 * staff-invoked manual trigger always works -- but automatic, unattended
 * firing from a cron is off by default. Reason, stated honestly in
 * recurring.ts's own doc comment: createAndEstimateMission reserves real
 * wallet funds once a mission reaches READY, a genuine financial
 * commitment that needs an explicit Founder activation decision, not a
 * routine engineering default.
 */
export function isRecurringMissionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RECURRING_MISSIONS_ENABLED === "1" || env.RECURRING_MISSIONS_ENABLED === "true";
}
