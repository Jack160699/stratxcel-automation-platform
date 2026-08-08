/**
 * Single source of truth for whether the CRM composer can attempt a manual
 * WhatsApp send from this Vercel deployment. The automatic-reply path (the
 * AWS worker, already live in production) is entirely unaffected by this
 * flag — it only gates the dashboard's manual "type a reply" composer,
 * which goes through POST /api/platform/whatsapp/send on the Vercel side.
 *
 * SEND_READY=false is the safe default per the migration brief's fallback:
 * inbound/outbound traffic still renders either way, only the composer
 * itself is disabled with a clear explanation instead of silently failing
 * on click. Flip to true only once Vercel's own WHATSAPP_TOKEN /
 * WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_APP_SECRET env vars are independently
 * confirmed present for this project (residual item: DASHBOARD_MANUAL_SEND_ENV_PENDING).
 */
export const SEND_READY = false;
export const SEND_DISABLED_REASON = "Manual sending is not configured for this deployment.";
