-- Migration: 20260817030000_whatsapp_otp_verifications.sql
-- Dedicated, secure, auditable storage for WhatsApp OTP generation, delivery, and verification.

CREATE TABLE IF NOT EXISTS public.whatsapp_otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_phone text NOT NULL,
  otp_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'onboarding_verification',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempt_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  ip_address text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying history by phone and purpose
CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_phone_purpose ON public.whatsapp_otp_verifications(destination_phone, purpose, created_at DESC);

-- Partial index for fast active unconsumed OTP lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_active ON public.whatsapp_otp_verifications(destination_phone, purpose)
  WHERE consumed_at IS NULL;

-- Index for IP-based rate limiting
CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_ip ON public.whatsapp_otp_verifications(ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

-- Index for user reference
CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_user ON public.whatsapp_otp_verifications(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.whatsapp_otp_verifications ENABLE ROW LEVEL SECURITY;

-- Service role full access only (all verification must happen server-side)
CREATE POLICY "Service role full access on whatsapp_otp_verifications"
  ON public.whatsapp_otp_verifications FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Revoke all permissions from public/anon/authenticated
REVOKE ALL ON public.whatsapp_otp_verifications FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_otp_verifications TO service_role;

COMMENT ON TABLE public.whatsapp_otp_verifications IS 'Secure single-use hashed WhatsApp OTP verification records with attempt tracking, rate limits, and replay protection.';
