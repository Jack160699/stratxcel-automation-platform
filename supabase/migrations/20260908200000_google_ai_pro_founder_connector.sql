-- Add Google AI Pro — Founder Account to the Personal Connector Control Plane
-- Represents the Founder's personal Google subscription account and its entitled capabilities:
-- Antigravity autonomous coding, Nano Banana image generation, Veo video generation,
-- Founder Google Drive, Google Cloud, and Jules automation.

insert into connector_definitions (
  key, label, category, auth_method, scope_level, declared_capabilities,
  description, real_status_source, required_env_vars, supported_access_methods, preferred_access_method
) values (
  'google_ai_pro',
  'Google AI Pro — Founder Account',
  'ai',
  'oauth',
  'platform',
  array[
    'google_ai_pro.reasoning',
    'google_ai_pro.multimodal',
    'google_ai_pro.vision',
    'image.generate',
    'image.edit',
    'google_ai_pro.image_generation',
    'video.generate',
    'video.transform',
    'google_ai_pro.video_generation',
    'antigravity.code',
    'antigravity.plan',
    'antigravity.terminal',
    'antigravity.browser',
    'antigravity.verify',
    'jules.automate',
    'google_drive.read',
    'google_drive.write',
    'google_drive.upload',
    'google_drive.download',
    'google_drive.organize',
    'google_cloud.projects',
    'google_cloud.services',
    'colab.notebook',
    'firebase.resources'
  ],
  'Founder personal Google AI Pro subscription account. Provides entitled multimodal reasoning, Nano Banana image generation, Veo video creation, Antigravity autonomous coding, and personal Drive/Cloud storage. Distinct from developer Gemini API and company Google Workspace.',
  'Google OAuth account authorization and AI Pro entitlement verification',
  array[]::text[],
  array['native', 'mcp', 'api', 'browser']::text[],
  'native'
)
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category,
  auth_method = excluded.auth_method,
  scope_level = excluded.scope_level,
  declared_capabilities = excluded.declared_capabilities,
  description = excluded.description,
  real_status_source = excluded.real_status_source,
  required_env_vars = excluded.required_env_vars,
  supported_access_methods = excluded.supported_access_methods,
  preferred_access_method = excluded.preferred_access_method;
