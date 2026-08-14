export type MetaTemplateEndpointFailure =
  | "WRONG_OBJECT"
  | "WRONG_API_VERSION"
  | "AUTHORIZATION"
  | "HTTP_ERROR";

export interface MetaTemplateApiEntry {
  id: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  components?: unknown[];
}

export interface SafeMetaEndpointDiagnostic {
  label: "waba_lookup" | "template_list" | "phone_list" | "business_list" | "waba_candidates";
  wabaId: string;
  apiVersion: string;
  httpStatus: number;
  errorCode: number | null;
  responseMessage: string | null;
  objectId: string | null;
  objectName: string | null;
}

export interface MetaTemplateInspection {
  configuredWabaId: string;
  resolvedWabaId: string | null;
  apiVersion: string;
  diagnostics: SafeMetaEndpointDiagnostic[];
  templates: MetaTemplateApiEntry[] | null;
}

interface MetaGraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface MetaGraphObjectBody extends MetaGraphErrorBody {
  id?: string;
  name?: string;
  metadata?: {
    type?: string;
  };
  data?: Array<{
    id: string;
    name?: string;
    verified_name?: string;
  }>;
}

interface GraphResponse {
  response: Response;
  body: MetaGraphObjectBody;
}

export class MetaTemplateEndpointError extends Error {
  readonly failure: MetaTemplateEndpointFailure;
  readonly httpStatus: number;
  readonly errorCode: number | null;
  readonly errorSubcode: number | null;
  readonly diagnostics: SafeMetaEndpointDiagnostic[];

  constructor(input: {
    failure: MetaTemplateEndpointFailure;
    httpStatus: number;
    errorCode?: number | null;
    errorSubcode?: number | null;
    responseMessage?: string | null;
    diagnostics?: SafeMetaEndpointDiagnostic[];
  }) {
    const details = [
      input.errorCode != null ? `code ${input.errorCode}` : null,
      input.errorSubcode != null ? `subcode ${input.errorSubcode}` : null,
      input.responseMessage?.trim() || null,
    ].filter(Boolean);
    super(`Meta template sync failed: HTTP ${input.httpStatus}${details.length ? ` (${details.join("; ")})` : ""}`);
    this.name = "MetaTemplateEndpointError";
    this.failure = input.failure;
    this.httpStatus = input.httpStatus;
    this.errorCode = input.errorCode ?? null;
    this.errorSubcode = input.errorSubcode ?? null;
    this.diagnostics = input.diagnostics ?? [];
  }
}

export function getMetaGraphApiVersion(): string {
  return process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v26.0";
}

export function buildMetaGraphUrl(apiVersion: string, objectId: string, edge?: string, query?: URLSearchParams): string {
  const path = edge ? `${objectId}/${edge}` : objectId;
  const suffix = query?.size ? `?${query.toString()}` : "";
  return `https://graph.facebook.com/${apiVersion}/${path}${suffix}`;
}

export async function inspectMetaTemplateEndpoint(
  input: { wabaId: string; phoneNumberId: string; apiVersion?: string },
  fetchFn: typeof fetch = fetch,
): Promise<MetaTemplateInspection> {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!token) throw new Error("WHATSAPP_TOKEN is not configured");

  const apiVersion = input.apiVersion?.trim() || getMetaGraphApiVersion();
  if (!/^v\d+\.\d+$/.test(apiVersion)) throw new Error("Invalid Meta Graph API version");
  const diagnostics: SafeMetaEndpointDiagnostic[] = [];
  const configuredLookup = await graphGet(
    buildMetaGraphUrl(apiVersion, input.wabaId, undefined, new URLSearchParams({ fields: "id,name", metadata: "1" })),
    token,
    fetchFn,
  );
  diagnostics.push(toDiagnostic("waba_lookup", input.wabaId, apiVersion, configuredLookup));

  const configuredPhones = await requestPhoneNumbers(input.wabaId, apiVersion, token, fetchFn);
  diagnostics.push(toDiagnostic("phone_list", input.wabaId, apiVersion, configuredPhones));
  const configuredOwnsPlatformPhone =
    configuredPhones.body.data?.some((phone) => String(phone.id) === input.phoneNumberId) ?? false;

  const configuredTemplates = await requestTemplates(input.wabaId, apiVersion, token, fetchFn);
  diagnostics.push(toDiagnostic("template_list", input.wabaId, apiVersion, configuredTemplates));
  if (configuredTemplates.response.ok) {
    return {
      configuredWabaId: input.wabaId,
      resolvedWabaId: input.wabaId,
      apiVersion,
      diagnostics,
      templates: configuredTemplates.body.data as MetaTemplateApiEntry[] | undefined ?? [],
    };
  }

  const failure = classifyMetaFailure(configuredTemplates);
  if (!configuredTemplates.response.ok && failure !== "WRONG_OBJECT") {
    throw toEndpointError(configuredTemplates, failure, diagnostics);
  }

  const candidates = await discoverWabaCandidates(input.wabaId, apiVersion, token, diagnostics, fetchFn);
  for (const candidate of candidates) {
    if (candidate.id === input.wabaId) continue;
    const candidateTemplates = await requestTemplates(candidate.id, apiVersion, token, fetchFn);
    diagnostics.push(toDiagnostic("template_list", candidate.id, apiVersion, candidateTemplates));
    if (candidateTemplates.response.ok) {
      return {
        configuredWabaId: input.wabaId,
        resolvedWabaId: candidate.id,
        apiVersion,
        diagnostics,
        templates: candidateTemplates.body.data as MetaTemplateApiEntry[] | undefined ?? [],
      };
    }
  }

  throw toEndpointError(configuredTemplates, "WRONG_OBJECT", diagnostics);
}

async function discoverWabaCandidates(
  objectId: string,
  apiVersion: string,
  token: string,
  diagnostics: SafeMetaEndpointDiagnostic[],
  fetchFn: typeof fetch,
): Promise<Array<{ id: string; name?: string }>> {
  const candidates = new Map<string, { id: string; name?: string }>();
  const portfolioIds = new Set([objectId]);
  const businesses = await graphGet(
    buildMetaGraphUrl(
      apiVersion,
      "me",
      "businesses",
      new URLSearchParams({ fields: "id,name", limit: "100" }),
    ),
    token,
    fetchFn,
  );
  diagnostics.push(toDiagnostic("business_list", objectId, apiVersion, businesses));
  for (const business of businesses.body.data ?? []) portfolioIds.add(String(business.id));

  for (const portfolioId of portfolioIds) {
    for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
      const result = await graphGet(
        buildMetaGraphUrl(
          apiVersion,
          portfolioId,
          edge,
          new URLSearchParams({ fields: "id,name", limit: "100" }),
        ),
        token,
        fetchFn,
      );
      diagnostics.push(toDiagnostic("waba_candidates", portfolioId, apiVersion, result));
      for (const candidate of result.body.data ?? []) {
        candidates.set(String(candidate.id), { id: String(candidate.id), name: candidate.name });
      }
    }
  }
  return [...candidates.values()];
}

async function requestTemplates(
  wabaId: string,
  apiVersion: string,
  token: string,
  fetchFn: typeof fetch,
): Promise<GraphResponse> {
  return graphGet(
    buildMetaGraphUrl(
      apiVersion,
      wabaId,
      "message_templates",
      new URLSearchParams({ fields: "id,name,status,language,category,components", limit: "200" }),
    ),
    token,
    fetchFn,
  );
}

async function requestPhoneNumbers(
  wabaId: string,
  apiVersion: string,
  token: string,
  fetchFn: typeof fetch,
): Promise<GraphResponse> {
  return graphGet(
    buildMetaGraphUrl(
      apiVersion,
      wabaId,
      "phone_numbers",
      new URLSearchParams({ fields: "id,verified_name", limit: "100" }),
    ),
    token,
    fetchFn,
  );
}

async function graphGet(url: string, token: string, fetchFn: typeof fetch): Promise<GraphResponse> {
  const response = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await response.json().catch(() => ({}))) as MetaGraphObjectBody;
  return { response, body };
}

function toDiagnostic(
  label: SafeMetaEndpointDiagnostic["label"],
  wabaId: string,
  apiVersion: string,
  result: GraphResponse,
): SafeMetaEndpointDiagnostic {
  const firstObject = result.body.data?.[0];
  return {
    label,
    wabaId,
    apiVersion,
    httpStatus: result.response.status,
    errorCode: result.body.error?.code ?? null,
    responseMessage:
      result.body.error?.message ??
      (result.body.metadata?.type ? `Object type: ${result.body.metadata.type}` : null),
    objectId: result.body.id ?? firstObject?.id ?? null,
    objectName: result.body.name ?? firstObject?.name ?? firstObject?.verified_name ?? null,
  };
}

function classifyMetaFailure(result: GraphResponse): MetaTemplateEndpointFailure {
  const code = result.body.error?.code;
  const message = result.body.error?.message ?? "";
  if (
    code === 2635 ||
    code === 12 ||
    /(?:deprecated|unsupported|invalid).*(?:api|graph).*version|version.*(?:deprecated|unsupported|invalid)/i.test(message)
  ) {
    return "WRONG_API_VERSION";
  }
  if (code === 100 && /nonexisting field\s*\(message_templates\)/i.test(message)) {
    return "WRONG_OBJECT";
  }
  if (result.response.status === 401 || result.response.status === 403 || code === 190 || code === 200) {
    return "AUTHORIZATION";
  }
  return "HTTP_ERROR";
}

function toEndpointError(
  result: GraphResponse,
  failure: MetaTemplateEndpointFailure,
  diagnostics: SafeMetaEndpointDiagnostic[],
): MetaTemplateEndpointError {
  return new MetaTemplateEndpointError({
    failure,
    httpStatus: result.response.status,
    errorCode: result.body.error?.code,
    errorSubcode: result.body.error?.error_subcode,
    responseMessage: result.body.error?.message,
    diagnostics,
  });
}

