-- Production-Harden Personal Connector Architecture for StratXcel & Hermes
-- Adds all 15 canonical Founder connectors, access method hierarchy,
-- health & verification metadata, budget controls, and dedicated audit logging.

-- 1. Relax/expand constraints and add columns to connector_definitions
alter table connector_definitions drop constraint if exists connector_definitions_category_check;
alter table connector_definitions add constraint connector_definitions_category_check
  check (category in ('infrastructure', 'ai', 'messaging', 'social', 'data', 'automation', 'finance'));

alter table connector_definitions drop constraint if exists connector_definitions_auth_method_check;
alter table connector_definitions add constraint connector_definitions_auth_method_check
  check (auth_method in ('api_key', 'oauth', 'service_credential', 'mcp_managed', 'cli'));

alter table connector_definitions add column if not exists supported_access_methods text[] not null default array['api']::text[];
alter table connector_definitions add column if not exists preferred_access_method text not null default 'api';

-- 2. Relax/expand status check and add verification + budget columns to connector_connections
alter table connector_connections drop constraint if exists connector_connections_status_check;
alter table connector_connections add constraint connector_connections_status_check
  check (status in (
    'pending', 'connected', 'healthy', 'auth_expired', 'rate_limited',
    'quota_exhausted', 'error', 'disabled', 'requires_reauth',
    'not_configured', 'degraded', 'auth_required', 'disconnected'
  ));

alter table connector_connections add column if not exists last_verified_at timestamptz;
alter table connector_connections add column if not exists discovered_at timestamptz;
alter table connector_connections add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table connector_connections add column if not exists budget_limit_usd numeric default null;
alter table connector_connections add column if not exists current_usage_usd numeric not null default 0;
alter table connector_connections add column if not exists rate_limit_per_minute integer default null;

-- 3. Add budget and method filters to connector_capability_assignments
alter table connector_capability_assignments add column if not exists budget_limit_usd numeric default null;
alter table connector_capability_assignments add column if not exists current_usage_usd numeric not null default 0;
alter table connector_capability_assignments add column if not exists allowed_methods text[] default null;

-- 4. Create dedicated connector_audit_logs table
create table if not exists connector_audit_logs (
  id uuid primary key default gen_random_uuid(),
  connector_key text not null references connector_definitions(key) on delete cascade,
  connection_id uuid references connector_connections(id) on delete set null,
  tenant_id uuid references tenants(id) on delete set null,
  actor_kind text not null check (actor_kind in ('founder', 'hermes', 'admin', 'system')),
  actor_id text,
  event_type text not null check (event_type in (
    'connected', 'authenticated', 'verified', 'capability_discovered',
    'permission_changed', 'scope_changed', 'enabled', 'disabled',
    'disconnected', 'reconnected', 'execution_started', 'execution_completed',
    'execution_failed', 'authorization_denied'
  )),
  capability_key text,
  execution_method text check (execution_method in ('native', 'mcp', 'api', 'cli', 'browser')),
  status text not null check (status in ('success', 'failure', 'denied')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

revoke all on connector_audit_logs from public, anon, authenticated;
grant select, insert, update, delete on connector_audit_logs to service_role;
alter table connector_audit_logs enable row level security;

create index if not exists connector_audit_logs_connector_idx on connector_audit_logs (connector_key);
create index if not exists connector_audit_logs_connection_idx on connector_audit_logs (connection_id);
create index if not exists connector_audit_logs_tenant_idx on connector_audit_logs (tenant_id);
create index if not exists connector_audit_logs_created_idx on connector_audit_logs (created_at desc);

-- 5. Upsert canonical 15 connector definitions
insert into connector_definitions (
  key, label, category, auth_method, scope_level, declared_capabilities,
  description, real_status_source, required_env_vars, supported_access_methods, preferred_access_method
) values
  ('aws', 'AWS', 'infrastructure', 'mcp_managed', 'platform',
   array['infrastructure.inspect', 'infrastructure.deploy_verify', 'infrastructure.ec2', 'infrastructure.logs', 's3.manage'],
   'StratXcel infrastructure host & cloud resources. Operates via MCP/CLI and AWS SDK with IAM authentication. Real status tracks worker heartbeats and authenticated API reachability.',
   '@stratxcel/queue getWorkerHealth() against worker_heartbeats and AWS STS verification',
   array[]::text[],
   array['native', 'mcp', 'cli', 'api']::text[],
   'mcp'),

  ('google', 'Google Services', 'data', 'oauth', 'both',
   array['google.search', 'google.drive', 'google.gmail', 'google.calendar', 'google.maps', 'analytics.read', 'search_console.read'],
   'Unified Google Workspace & Cloud integration (Search, Drive, Gmail, Calendar, Maps, Analytics, GSC). Authenticates via OAuth 2.0 or Service Account.',
   'Google OAuth token validation and Google API health checks',
   array[]::text[],
   array['api', 'oauth']::text[],
   'api'),

  ('google_workspace', 'Google Workspace (Legacy)', 'data', 'oauth', 'company',
   array['analytics.read', 'search_console.read'],
   'Company-scoped Google OAuth for Search Console + GA4. Reads the search_google_connections adapter.',
   'search_google_connections.status read-only adapter',
   array[]::text[],
   array['api', 'oauth']::text[],
   'api'),

  ('openrouter', 'OpenRouter', 'ai', 'api_key', 'platform',
   array['ai.text', 'ai.text_escalation', 'ai.code'],
   'OpenRouter AI provider pool for text completions and high-throughput model routing. Health verified via probeOpenRouterReadiness live check.',
   '@stratxcel/ai-runtime probeOpenRouterReadiness() live check',
   array['OPENROUTER_API_KEY', 'OPENROUTER_ENABLED']::text[],
   array['native', 'api']::text[],
   'native'),

  ('gemini', 'Gemini (Google AI)', 'ai', 'api_key', 'platform',
   array['media.image_generation', 'media.video_generation', 'ai.text', 'ai.multimodal'],
   'Google Gemini API for multimodal reasoning, text completion, and media generation. Health verified via probeGeminiReadiness live check.',
   '@stratxcel/ai-runtime probeGeminiReadiness() live check against GEMINI_API_KEY',
   array['GEMINI_API_KEY']::text[],
   array['native', 'api']::text[],
   'native'),

  ('claude', 'Claude (Anthropic)', 'ai', 'api_key', 'platform',
   array['ai.text', 'ai.code', 'ai.reasoning'],
   'Anthropic Claude API for advanced reasoning, code architecture, and agent workflows. Authenticated via ANTHROPIC_API_KEY.',
   'Anthropic API probe (https://api.anthropic.com/v1/models)',
   array['ANTHROPIC_API_KEY']::text[],
   array['native', 'api']::text[],
   'native'),

  ('github', 'GitHub', 'infrastructure', 'service_credential', 'platform',
   array['infrastructure.repo_read', 'infrastructure.repo_write', 'infrastructure.ci_inspect'],
   'Source repository and CI/CD operations. Authenticated via fine-grained Personal Access Token (PAT) or GitHub App.',
   'GET https://api.github.com/user with vaulted PAT or GITHUB_TOKEN',
   array[]::text[],
   array['api', 'cli', 'mcp']::text[],
   'api'),

  ('meta', 'Meta (Facebook / Instagram / WhatsApp)', 'social', 'oauth', 'company',
   array['messaging.send', 'messaging.receive', 'social.post', 'social.analytics'],
   'Meta Graph API for WhatsApp Cloud messaging, Instagram, and Facebook page operations. Reads phone_bindings and social_accounts.',
   'phone_bindings.status and Meta Graph API token verification',
   array[]::text[],
   array['api', 'oauth']::text[],
   'api'),

  ('whatsapp', 'WhatsApp Cloud API', 'messaging', 'oauth', 'company',
   array['messaging.send', 'messaging.receive', 'messaging.templates'],
   'WhatsApp Cloud API messaging for automated customer engagement and Founder notifications.',
   'phone_bindings.status read-only adapter',
   array[]::text[],
   array['api', 'oauth']::text[],
   'api'),

  ('vercel', 'Vercel', 'infrastructure', 'api_key', 'both',
   array['website.deploy_status', 'website.domain_status', 'website.deploy'],
   'Vercel cloud platform for web application hosting, preview deployments, and custom domain verification.',
   'validateVercelToken() against Vercel API or search_website_connections',
   array[]::text[],
   array['api', 'cli']::text[],
   'api'),

  ('supabase', 'Supabase', 'data', 'service_credential', 'platform',
   array['data.inspect', 'data.query', 'data.migrate'],
   'StratXcel primary Postgres database, Storage, and Realtime platform. Health verified via authenticated database ping.',
   'Postgres connection ping and Supabase Management/Auth verification',
   array[]::text[],
   array['native', 'api', 'cli']::text[],
   'native'),

  ('browser', 'Browser / Computer Automation', 'automation', 'mcp_managed', 'platform',
   array['browser.navigate', 'browser.extract', 'browser.interact', 'browser.screenshot'],
   'Automated browser execution engine (Playwright/Puppeteer/Computer Use) for web action execution when direct APIs do not exist.',
   'Headless browser execution environment readiness probe',
   array[]::text[],
   array['native', 'mcp', 'browser']::text[],
   'mcp'),

  ('s3', 'AWS S3 Storage', 'data', 'service_credential', 'both',
   array['storage.read', 'storage.write', 'storage.upload', 'storage.list'],
   'Object storage for brand media assets, mission artifacts, customer documents, and system backups.',
   'S3 ListBuckets/HeadBucket authenticated probe',
   array[]::text[],
   array['native', 'api', 'cli', 'mcp']::text[],
   'native'),

  ('apollo', 'Apollo.io', 'data', 'api_key', 'both',
   array['leads.search', 'leads.enrich', 'leads.verify'],
   'B2B market discovery, lead search, company intelligence, and email enrichment platform.',
   'Apollo.io API health probe (GET https://api.apollo.io/v1/auth/health)',
   array['APOLLO_API_KEY']::text[],
   array['api']::text[],
   'api'),

  ('payments', 'Payments (Razorpay / Stripe)', 'finance', 'api_key', 'both',
   array['payments.charge', 'payments.refund', 'payments.subscriptions', 'payments.invoices'],
   'Payment processing engine for subscription billing, payment links, customer invoices, and refunds.',
   'Razorpay/Stripe API key validation and webhook status',
   array['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']::text[],
   array['native', 'api']::text[],
   'native'),

  ('telegram', 'Telegram Bot API', 'messaging', 'api_key', 'platform',
   array['messaging.send', 'messaging.receive', 'messaging.webhook'],
   'Telegram bot messaging interface for Founder commands, alerts, and autonomous mission notifications.',
   'Telegram Bot API probe (GET https://api.telegram.org/bot<token>/getMe)',
   array['TELEGRAM_BOT_TOKEN']::text[],
   array['api']::text[],
   'api')
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
