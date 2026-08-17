import { NextResponse } from "next/server";

export async function GET() {
  const timestamp = new Date().toISOString();
  const envSummary = {
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    whatsappMode: process.env.WHATSAPP_INTEGRATION_MODE || "disabled",
    razorpayMode: process.env.RAZORPAY_INTEGRATION_MODE || "disabled",
    hermesMode: process.env.HERMES_MODE || "disabled",
  };

  return NextResponse.json(
    {
      status: "healthy",
      timestamp,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || null,
      environment: envSummary,
    },
    { status: 200 }
  );
}
