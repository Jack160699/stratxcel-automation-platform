// Canonical human-readable labels for the Copilot's Live Execution view.
// Pure, dependency-free (mirrors brand-sections.ts) so it can be unit
// tested standalone without hitting the extension-less-import limitation
// of `node --experimental-strip-types` on tools.ts's module graph.
//
// The Live Execution view is an OPERATIONAL TRACE, not a chain-of-thought
// window: every label here describes an action that actually happened
// (a tool call, a provider round-trip, an approval gate), never the
// model's internal reasoning.

export const TOOL_LABELS: Record<string, string> = {
  inspect_health: "Checking system health",
  inspect_jobs: "Checking publishing jobs",
  inspect_dead_letters: "Checking failed jobs",
  inspect_accounts: "Checking connected accounts",
  get_performance: "Gathering performance data",
  list_campaigns: "Checking campaigns",
  inspect_brand: "Reading Brand Brain",
  list_content: "Checking content library",
  ingest_media: "Ingesting uploaded media",
  inspect_content_media: "Checking attached media",
  create_campaign: "Creating campaign",
  create_content_item: "Creating content concept",
  create_content_variant: "Preparing platform variant",
  generate_image: "Generating image candidates",
  attach_media_to_content: "Attaching media",
  update_content_variant: "Updating platform variant",
  schedule_post: "Scheduling post",
  execute_youtube_verification: "Uploading YouTube verification video",
  execute_private_youtube_verification: "Uploading private YouTube verification video",
  cancel_scheduled_post: "Cancelling scheduled post",
  set_operating_mode: "Changing autonomy mode",
};

export function labelForTool(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Running ${toolName}`;
}

export const PHASE_LABELS: Record<string, string> = {
  RUN_STARTED: "Starting",
  UNDERSTANDING_REQUEST: "Understanding your request",
  PROVIDER_REQUEST_STARTED: "Generating response",
  PROVIDER_RESPONSE_RECEIVED: "Response received",
  RUN_COMPLETED: "Completed",
  RUN_FAILED: "Failed",
};

export function labelForApproval(toolName: string): string {
  return `Waiting for your approval — ${labelForTool(toolName)}`;
}
