import { selectDomainRegistrar, RegistrarDisabledError } from "@stratxcel/websites-and-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Never returns fabricated availability/pricing. In 'disabled' mode (the
 * default — no real registrar is configured), this fails closed with a
 * clear 503 rather than a fake-looking result. In 'sandbox' mode, the
 * response is explicitly labeled so it can never be mistaken for a real
 * registrar quote downstream.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");

    if (!domain) {
      return Response.json({ error: "domain query parameter is required" }, { status: 400 });
    }

    const registrar = selectDomainRegistrar();
    if (registrar.mode === "disabled") {
      return Response.json(
        { error: "Domain search is not yet available — the registrar integration is being activated." },
        { status: 503 }
      );
    }

    const result = await registrar.searchDomain(domain);
    return Response.json({ ...result, mode: registrar.mode, provider: registrar.providerName });
  } catch (err) {
    if (err instanceof RegistrarDisabledError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : "Failed to search domain";
    return Response.json({ error: msg }, { status: 400 });
  }
}
