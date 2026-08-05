import { SandboxDomainRegistrar } from "@stratxcel/websites-and-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");

    if (!domain) {
      return Response.json({ error: "domain query parameter is required" }, { status: 400 });
    }

    const registrar = new SandboxDomainRegistrar();
    const result = await registrar.searchDomain(domain);

    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to search domain";
    return Response.json({ error: msg }, { status: 400 });
  }
}
