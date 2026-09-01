export interface VercelDomainStatus {
  domain: string;
  apexDomain: string;
  verified: boolean;
  sslActive: boolean;
  configured: boolean;
  error?: string;
}

const DEFAULT_PROJECT_ID = process.env.VERCEL_PROJECT_ID ?? "prj_81j5A5rArsPVVNspwSPGGfuhg9NZ";
const DEFAULT_TEAM_ID = process.env.VERCEL_TEAM_ID ?? "team_UWCzHaOLdAOtezWqRxYNxdYf";

/**
 * Attaches a domain to the Vercel project. Never claims verified/SSL state
 * that wasn't actually confirmed by Vercel — a missing token, a network
 * failure, or a rejected API call all resolve to `configured: false`, not a
 * fabricated "it worked." Domain attachment is a multi-step async process
 * on Vercel's side even after a successful 2xx here (DNS propagation, cert
 * issuance) — callers must still poll getVercelDomainStatus before ever
 * marking a customer's site "live".
 */
export async function attachDomainToVercel(
  domainName: string,
  projectId: string = DEFAULT_PROJECT_ID,
  token: string = process.env.VERCEL_AUTH_TOKEN ?? "",
  teamId: string = DEFAULT_TEAM_ID
): Promise<VercelDomainStatus> {
  if (!token) {
    return {
      domain: domainName,
      apexDomain: domainName,
      verified: false,
      sslActive: false,
      configured: false,
      error: "VERCEL_AUTH_TOKEN is not configured — domain attachment was not attempted",
    };
  }

  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/domains${query}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domainName }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        domain: domainName,
        apexDomain: domainName,
        verified: false,
        sslActive: false,
        configured: false,
        error: `Vercel domain attach HTTP ${res.status}: ${errText}`,
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    return {
      domain: (data.name as string) ?? domainName,
      apexDomain: (data.apexName as string) ?? domainName,
      verified: (data.verified as boolean) ?? false,
      // Vercel does not return certificate state on the attach call itself —
      // SSL readiness is only known via getVercelDomainStatus's own poll.
      sslActive: false,
      configured: true,
    };
  } catch (err) {
    return {
      domain: domainName,
      apexDomain: domainName,
      verified: false,
      sslActive: false,
      configured: false,
      error: err instanceof Error ? err.message : "Vercel domain API network error",
    };
  }
}

/**
 * Polls Vercel's own view of a domain already attached to the project — the
 * only source of truth for "is this actually verified and does it actually
 * have a certificate yet." Never called before attachDomainToVercel.
 */
export async function getVercelDomainStatus(
  domainName: string,
  projectId: string = DEFAULT_PROJECT_ID,
  token: string = process.env.VERCEL_AUTH_TOKEN ?? "",
  teamId: string = DEFAULT_TEAM_ID
): Promise<VercelDomainStatus> {
  if (!token) {
    return { domain: domainName, apexDomain: domainName, verified: false, sslActive: false, configured: false, error: "VERCEL_AUTH_TOKEN is not configured" };
  }

  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}/domains/${encodeURIComponent(domainName)}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { domain: domainName, apexDomain: domainName, verified: false, sslActive: false, configured: false, error: `Vercel domain status HTTP ${res.status}: ${errText}` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const verified = (data.verified as boolean) ?? false;
    // Vercel reports certs on a nested object once issued; absence means not yet issued.
    const sslActive = Boolean((data as { certs?: unknown[] }).certs?.length);

    return {
      domain: (data.name as string) ?? domainName,
      apexDomain: (data.apexName as string) ?? domainName,
      verified,
      sslActive,
      configured: true,
    };
  } catch (err) {
    return {
      domain: domainName,
      apexDomain: domainName,
      verified: false,
      sslActive: false,
      configured: false,
      error: err instanceof Error ? err.message : "Vercel domain status network error",
    };
  }
}
