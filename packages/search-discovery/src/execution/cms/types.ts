/**
 * Provider-Neutral CMS Connector Types
 */

export type CMSType =
  | "wordpress"
  | "stratxcel_native"
  | "vercel"
  | "nextjs"
  | "webflow"
  | "shopify"
  | "webhook";

export type CMSProviderStatus =
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "REAUTH_REQUIRED"
  | "READ_ONLY"
  | "WRITE_AVAILABLE"
  | "ERROR";

export interface CMSPageContent {
  id?: string | number;
  url: string;
  title: string;
  metaDescription?: string;
  canonicalUrl?: string;
  schemaJsonLd?: string | Record<string, unknown>;
  bodyHtml?: string;
  status: "publish" | "draft" | "private" | "unknown";
  lastModifiedAt?: string;
}

export interface CMSMutationResult {
  success: boolean;
  pageId?: string | number;
  targetUrl: string;
  mutationKind: "metadata" | "schema" | "content" | "publish" | "rollback";
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  deployedAt: string;
  providerReference?: string;
  error?: string;
}

export interface CMSPageCreationResult {
  success: boolean;
  pageId: string | number;
  createdUrl: string;
  status: "publish" | "draft";
  beforeState?: Record<string, unknown>;
  afterState: Record<string, unknown>;
  deployedAt: string;
  error?: string;
}

export interface CMSVerificationSpec {
  expectedTitle?: string;
  expectedMetaDescription?: string;
  expectedSchemaType?: string;
  expectedTextSnippet?: string;
  expectedCanonicalUrl?: string;
  requireHttpStatus200?: boolean;
}

export interface CMSVerificationResult {
  verified: boolean;
  verifiedAt: string;
  httpStatus?: number;
  checks: Array<{
    name: string;
    passed: boolean;
    expected: string;
    actual: string;
  }>;
  failureReason?: string;
}

export interface CMSExecutionProvider {
  readonly cmsType: CMSType;
  readonly siteUrl: string;
  status(): Promise<CMSProviderStatus>;
  readPage(url: string): Promise<CMSPageContent>;
  updateMetadata(
    url: string,
    meta: { title?: string; description?: string; canonical?: string }
  ): Promise<CMSMutationResult>;
  updateSchema(
    url: string,
    schemaJsonLd: string | Record<string, unknown>
  ): Promise<CMSMutationResult>;
  updateContent(
    url: string,
    content: { title?: string; bodyHtml?: string; headings?: string[] }
  ): Promise<CMSMutationResult>;
  createPage(page: {
    title: string;
    slug: string;
    bodyHtml: string;
    metaDescription?: string;
    schemaJsonLd?: string;
  }): Promise<CMSPageCreationResult>;
  publishPage(pageId: string | number): Promise<CMSMutationResult>;
  verifyPage(
    url: string,
    expected: CMSVerificationSpec
  ): Promise<CMSVerificationResult>;
  rollbackPage(
    pageId: string | number,
    previousState: Record<string, unknown>
  ): Promise<CMSMutationResult>;
}
