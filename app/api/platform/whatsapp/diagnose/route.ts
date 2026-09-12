import { NextResponse } from "next/server";
import { requireAdminAggregateReadContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleDiagnose(request, null);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const testPhone = body.phone ? String(body.phone).replace(/\D/g, "") : null;
  return handleDiagnose(request, testPhone);
}

async function handleDiagnose(request: Request, testPhone: string | null) {
  // Authorize: Bearer token or Staff Admin
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const isServiceRole =
    (authHeader && expectedKey && authHeader === `Bearer ${expectedKey}`) ||
    (authHeader && process.env.INTERNAL_SERVICE_KEY && authHeader === `Bearer ${process.env.INTERNAL_SERVICE_KEY}`) ||
    (authHeader && process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`);

  if (!isServiceRole) {
    const agg = await requireAdminAggregateReadContext();
    if (!agg.ok) return NextResponse.json({ error: agg.error }, { status: agg.status });
  }

  const token =
    process.env.WHATSAPP_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim() ||
    process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();

  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    "993296527209625";

  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() ?? "v20.0";

  if (!token) {
    return NextResponse.json({ ok: false, error: "WHATSAPP_TOKEN not configured" }, { status: 500 });
  }

  const results: Record<string, unknown> = {};

  // 1. Check Phone Number ID & Business Account details
  try {
    const phoneRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,account_mode,status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const phoneData = await phoneRes.json();
    results.phoneDetails = {
      httpStatus: phoneRes.status,
      data: phoneData,
    };
  } catch (err: any) {
    results.phoneDetails = { error: err.message };
  }

  // 2. Check WABA / WhatsApp Business Account
  const wabaId = "1420911403384345";
  try {
    const wabaRes = await fetch(`https://graph.facebook.com/${apiVersion}/${wabaId}?fields=id,name,currency,timezone_id,message_template_namespace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const wabaData = await wabaRes.json();
    results.wabaDetails = {
      httpStatus: wabaRes.status,
      data: wabaData,
    };
  } catch (err: any) {
    results.wabaDetails = { error: err.message };
  }

  // 3. Check Templates on WABA
  try {
    const tplRes = await fetch(`https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?name=stratxcel_outreach_intro`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tplData = await tplRes.json();
    results.templateDetails = {
      httpStatus: tplRes.status,
      data: tplData,
    };
  } catch (err: any) {
    results.templateDetails = { error: err.message };
  }

  // 4. Token debug info (inspect permissions without exposing token)
  try {
    const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const debugData = await debugRes.json();
    results.tokenDebug = {
      httpStatus: debugRes.status,
      appId: debugData?.data?.app_id,
      isValid: debugData?.data?.is_valid,
      scopes: debugData?.data?.scopes,
      expiresAt: debugData?.data?.expires_at,
    };
  } catch (err: any) {
    results.tokenDebug = { error: err.message };
  }

  // 5. If testPhone is supplied, execute a test API call and capture exact Meta error response
  if (testPhone) {
    try {
      const sendRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: testPhone,
          type: "template",
          template: {
            name: "stratxcel_outreach_intro",
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: "Prospect Name" },
                  { type: "text", text: "we noticed untapped local customer demand for your business. We have a proven plan starting at ₹3,000" },
                ],
              },
            ],
          },
        }),
      });

      const sendData = await sendRes.json();
      results.testSend = {
        destination: testPhone,
        httpStatus: sendRes.status,
        response: sendData,
      };
    } catch (err: any) {
      results.testSend = { error: err.message };
    }
  }

  return NextResponse.json({ ok: true, results });
}
