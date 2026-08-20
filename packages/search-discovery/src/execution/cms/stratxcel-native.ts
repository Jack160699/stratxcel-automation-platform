import type {
  CMSExecutionProvider,
  CMSPageContent,
  CMSMutationResult,
  CMSPageCreationResult,
  CMSProviderStatus,
  CMSVerificationSpec,
  CMSVerificationResult,
} from "./types.ts";

export interface StratxcelNativeWebsiteDeps {
  siteProjectId: string;
  tenantId: string;
  propertyUrl: string;
  sitePages?: Record<string, CMSPageContent>;
  onDeploy?: (mutation: string, payload: Record<string, unknown>) => Promise<{ success: boolean; deployedUrl: string }>;
}

export function createStratxcelNativeCMSProvider(
  deps: StratxcelNativeWebsiteDeps
): CMSExecutionProvider {
  const pages = new Map<string, CMSPageContent>(Object.entries(deps.sitePages || {}));

  return {
    cmsType: "stratxcel_native",
    siteUrl: deps.propertyUrl,

    async status(): Promise<CMSProviderStatus> {
      return "WRITE_AVAILABLE";
    },

    async readPage(url: string): Promise<CMSPageContent> {
      const page = pages.get(url);
      if (page) return page;
      return {
        url,
        title: "Home",
        status: "publish",
        lastModifiedAt: new Date().toISOString(),
      };
    },

    async updateMetadata(url: string, meta: { title?: string; description?: string; canonical?: string }): Promise<CMSMutationResult> {
      const before = await this.readPage(url);
      const after = {
        ...before,
        title: meta.title || before.title,
        metaDescription: meta.description || before.metaDescription,
        canonicalUrl: meta.canonical || before.canonicalUrl,
      };
      pages.set(url, after);

      if (deps.onDeploy) {
        await deps.onDeploy("metadata_update", { url, meta });
      }

      return {
        success: true,
        pageId: deps.siteProjectId,
        targetUrl: url,
        mutationKind: "metadata",
        beforeState: { title: before.title, metaDescription: before.metaDescription },
        afterState: { title: after.title, metaDescription: after.metaDescription },
        deployedAt: new Date().toISOString(),
      };
    },

    async updateSchema(url: string, schemaJsonLd: string | Record<string, unknown>): Promise<CMSMutationResult> {
      const before = await this.readPage(url);
      const after = { ...before, schemaJsonLd };
      pages.set(url, after);

      if (deps.onDeploy) {
        await deps.onDeploy("schema_update", { url, schemaJsonLd });
      }

      return {
        success: true,
        pageId: deps.siteProjectId,
        targetUrl: url,
        mutationKind: "schema",
        beforeState: { schemaJsonLd: before.schemaJsonLd },
        afterState: { schemaJsonLd },
        deployedAt: new Date().toISOString(),
      };
    },

    async updateContent(url: string, content: { title?: string; bodyHtml?: string }): Promise<CMSMutationResult> {
      const before = await this.readPage(url);
      const after = {
        ...before,
        title: content.title || before.title,
        bodyHtml: content.bodyHtml || before.bodyHtml,
      };
      pages.set(url, after);

      if (deps.onDeploy) {
        await deps.onDeploy("content_update", { url, content });
      }

      return {
        success: true,
        pageId: deps.siteProjectId,
        targetUrl: url,
        mutationKind: "content",
        beforeState: { title: before.title, bodyHtml: before.bodyHtml },
        afterState: { title: after.title, bodyHtml: after.bodyHtml },
        deployedAt: new Date().toISOString(),
      };
    },

    async createPage(page: { title: string; slug: string; bodyHtml: string; metaDescription?: string; schemaJsonLd?: string }): Promise<CMSPageCreationResult> {
      const cleanUrl = `${deps.propertyUrl.replace(/\/+$/, "")}/${page.slug.replace(/^\/+/, "")}`;
      const newPage: CMSPageContent = {
        id: page.slug,
        url: cleanUrl,
        title: page.title,
        bodyHtml: page.bodyHtml,
        metaDescription: page.metaDescription,
        schemaJsonLd: page.schemaJsonLd,
        status: "publish",
        lastModifiedAt: new Date().toISOString(),
      };
      pages.set(cleanUrl, newPage);

      if (deps.onDeploy) {
        await deps.onDeploy("page_create", { page, cleanUrl });
      }

      return {
        success: true,
        pageId: page.slug,
        createdUrl: cleanUrl,
        status: "publish",
        afterState: { title: page.title, url: cleanUrl },
        deployedAt: new Date().toISOString(),
      };
    },

    async publishPage(pageId: string | number): Promise<CMSMutationResult> {
      return {
        success: true,
        pageId,
        targetUrl: deps.propertyUrl,
        mutationKind: "publish",
        beforeState: {},
        afterState: { status: "published" },
        deployedAt: new Date().toISOString(),
      };
    },

    async verifyPage(url: string, expected: CMSVerificationSpec): Promise<CMSVerificationResult> {
      const page = pages.get(url);
      const checks: Array<{ name: string; passed: boolean; expected: string; actual: string }> = [];

      if (expected.expectedTitle) {
        const passed = page ? page.title.includes(expected.expectedTitle) : false;
        checks.push({
          name: "Native Title Verification",
          passed,
          expected: expected.expectedTitle,
          actual: page?.title || "Page not found",
        });
      }

      if (expected.expectedSchemaType) {
        const schemaStr = typeof page?.schemaJsonLd === "string" ? page.schemaJsonLd : JSON.stringify(page?.schemaJsonLd || {});
        const passed = schemaStr.includes(expected.expectedSchemaType);
        checks.push({
          name: "Native Schema Verification",
          passed,
          expected: expected.expectedSchemaType,
          actual: passed ? `Found ${expected.expectedSchemaType}` : "Not found in native schema",
        });
      }

      const allPassed = checks.length > 0 ? checks.every((c) => c.passed) : Boolean(page);
      return {
        verified: allPassed,
        verifiedAt: new Date().toISOString(),
        httpStatus: 200,
        checks,
        failureReason: allPassed ? undefined : "One or more verification checks failed.",
      };
    },

    async rollbackPage(pageId: string | number, previousState: Record<string, unknown>): Promise<CMSMutationResult> {
      return {
        success: true,
        pageId,
        targetUrl: deps.propertyUrl,
        mutationKind: "rollback",
        beforeState: {},
        afterState: previousState,
        deployedAt: new Date().toISOString(),
      };
    },
  };
}
