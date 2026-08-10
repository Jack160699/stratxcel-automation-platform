# Package Autopilot scheduler

Use exactly one scheduler. Vercel is authoritative while the package producer cron remains in `vercel.json`. If the deployed Vercel plan cannot run hourly jobs, remove that Vercel entry and configure Supabase `pg_cron` + `pg_net` to call `/api/social/package-producer` hourly and `/api/social/worker` every 15 minutes.

Store the site URL and bearer secret in Supabase Vault; the cron SQL must retrieve them at runtime. Never place `CRON_SECRET` directly in a migration or scheduled command. Keep the secured HTTP routes unchanged. Database uniqueness, atomic queue claims, and publishing idempotency keys remain authoritative if a scheduler retries or overlaps.

Before switching, disable the old scheduler, verify it has stopped, enable the new scheduler, then check `social_autopilot_producer_runs` and the shared worker heartbeat. Never enable Vercel and Supabase scheduling simultaneously.
