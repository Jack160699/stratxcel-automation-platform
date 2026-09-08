-- Migration: 20260908130000_whatsapp_otp_delivery_tracking.sql
--
-- STRATXCEL PRODUCTION REPAIR mission, Section 3/13/28: WhatsApp OTP
-- delivery status was never tracked at all. sendWhatsAppOtp() only ever
-- recorded that Meta's Graph API *accepted* the send request (a real
-- provider_message_id/wamid) -- there was no way to distinguish that from
-- "actually delivered to the phone," even though the delivery-receipt
-- webhook path (sent/delivered/read/failed) already exists and is wired
-- for regular CRM messages (packages/whatsapp/src/messages.ts's
-- updateWhatsAppMessageStatus/updateAgentChannelMessageStatus/
-- updateAuditDeliveryEventStatus). This migration adds the same real,
-- provider-sourced delivery_status concept to OTP records specifically.
--
-- Also fixes a related, previously-flagged honesty gap: consumed_at was
-- overloaded between "the customer actually verified this code" and "a
-- newer OTP superseded this one before it was ever entered" (distinguished
-- only by inspecting metadata->>'superseded', an untyped, unindexed JSON
-- field). Adds a proper `outcome` column instead.

ALTER TABLE public.whatsapp_otp_verifications
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS delivery_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome text;

ALTER TABLE public.whatsapp_otp_verifications
  DROP CONSTRAINT IF EXISTS whatsapp_otp_verifications_delivery_status_check;
ALTER TABLE public.whatsapp_otp_verifications
  ADD CONSTRAINT whatsapp_otp_verifications_delivery_status_check
  CHECK (delivery_status IN ('accepted', 'sent', 'delivered', 'read', 'failed'));

ALTER TABLE public.whatsapp_otp_verifications
  DROP CONSTRAINT IF EXISTS whatsapp_otp_verifications_outcome_check;
ALTER TABLE public.whatsapp_otp_verifications
  ADD CONSTRAINT whatsapp_otp_verifications_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('verified', 'superseded', 'locked_max_attempts', 'expired_unused'));

COMMENT ON COLUMN public.whatsapp_otp_verifications.delivery_status IS
  'Real, provider-sourced WhatsApp delivery lifecycle for this OTP send. '
  '"accepted" means only that Meta''s Graph API returned a message id at '
  'send time (the previous, and only, signal this table ever tracked) -- '
  'sent/delivered/read/failed arrive later via the real Meta delivery-'
  'receipt webhook, correlated by provider_message_id '
  '(updateWhatsAppOtpDeliveryStatus in packages/whatsapp/src/messages.ts). '
  'Never advances backwards (rank-guarded), matching the existing '
  'whatsapp_messages status convention.';

COMMENT ON COLUMN public.whatsapp_otp_verifications.outcome IS
  'Why this record stopped being the active OTP for its phone+purpose, '
  'set alongside consumed_at: verified (customer entered the correct '
  'code), superseded (a newer OTP was requested before this one was '
  'used), locked_max_attempts (too many wrong guesses). NULL while still '
  'active (consumed_at IS NULL) or for a record that simply expired '
  'unused (see the app-level EXPIRED case -- expires_at has already '
  'passed but the row itself is never mutated on expiry alone, since '
  'nothing needs to happen to it).';

-- The webhook correlation path (updateWhatsAppOtpDeliveryStatus) looks up
-- by provider_message_id specifically -- this table had no index on that
-- column at all before now.
CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_provider_message_id
  ON public.whatsapp_otp_verifications(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Backfill: every existing consumed row predates this column and cannot be
-- retroactively classified as verified vs. superseded vs. locked without
-- re-deriving it from metadata -- do that once, honestly, rather than
-- leaving historical rows all NULL forever.
UPDATE public.whatsapp_otp_verifications
SET outcome = CASE
  WHEN (metadata->>'superseded')::boolean IS TRUE THEN 'superseded'
  WHEN (metadata->>'locked')::boolean IS TRUE THEN 'locked_max_attempts'
  WHEN consumed_at IS NOT NULL THEN 'verified'
  ELSE NULL
END
WHERE consumed_at IS NOT NULL AND outcome IS NULL;
