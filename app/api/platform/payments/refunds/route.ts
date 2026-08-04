export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    {
      error: "Direct refund initiation via Platform Admin API is currently disabled. Refunds created directly in the Razorpay Dashboard are automatically reconciled to tenant wallets via webhooks.",
    },
    { status: 501 }
  );
}
