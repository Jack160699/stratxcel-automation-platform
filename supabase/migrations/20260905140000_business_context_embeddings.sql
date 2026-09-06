-- Additive: per-tenant business-context vector store for Local AI RAG grounding.
-- StratXcel remains the canonical source of truth (per the Local AI connection
-- brief, section 6) -- this table stores only short, curated context chunks
-- (Brand Brain facts, product/service descriptions, policies) that a business
-- owner or an ingestion job explicitly submits, never a raw database export
-- and never customer PII. Embeddings are computed by the remote local AI
-- server's nomic-embed-text model (768-dim, confirmed live via
-- GET /v1/models) through POST /v1/embeddings -- see
-- packages/ai-runtime/src/rag/business-context.ts for the ingest/retrieve
-- implementation that populates and queries this table.
--
-- No ANN index (ivfflat/hnsw) yet: expected per-tenant volume is small
-- (dozens to low hundreds of chunks), so a tenant/business-scoped exact
-- cosine-distance scan is both simpler and, at this scale, not meaningfully
-- slower. Add an ivfflat index once real volume justifies tuning `lists`.

create extension if not exists vector;

create table if not exists business_context_embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  business_id text not null,
  source text not null default 'manual',
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table business_context_embeddings enable row level security;

create index if not exists business_context_embeddings_tenant_business_idx
  on business_context_embeddings (tenant_id, business_id);

create policy business_context_embeddings_tenant_read on business_context_embeddings for select
  using (
    exists (
      select 1 from tenant_members m
      where m.tenant_id = business_context_embeddings.tenant_id
        and m.user_id = (select auth.uid())
    )
  );

revoke all on business_context_embeddings from public, anon;
grant select on business_context_embeddings to authenticated;
grant select, insert, update, delete on business_context_embeddings to service_role;
