-- Follow-up to 20260905140000_business_context_embeddings.sql: Supabase's
-- security linter (extension_in_public) flagged the `vector` extension
-- landing in the public schema. Move it into the standard `extensions`
-- schema instead, matching every other extension in this project. Safe to
-- run any time -- business_context_embeddings was still empty when this
-- was first applied.
alter extension vector set schema extensions;
