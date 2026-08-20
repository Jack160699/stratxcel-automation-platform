import type {
  CMSExecutionProvider,
  CMSPageContent,
  CMSMutationResult,
  CMSPageCreationResult,
  CMSProviderStatus,
  CMSVerificationSpec,
  CMSVerificationResult,
} from "./types.ts";

export interface WordPressCredentials {
  siteUrl: string;
  username: string;
  applicationPassword?: string;
  jwtToken?: string;
  writeEnabled?: boolean;
}

export class WordPressExecutionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Production WordPress REST API Execution Provider.
 * Communicates over standard WordPress Core REST API endpoints.
 */
export function createWordPressExecutionProvider(
  creds: WordPressCredentials,
  customFetch: typeof fetch = fetch
): CMSExecutionProvider {
  const normalizedSiteUrl = creds.siteUrl.replace(/\/+$/, "");

  function getAuthHeader(): Record<string, string> {
    if (creds.applicationPassword) {
      const token = Buffer.from(`${creds.username}:${creds.applicationPassword.replace(/\s+/g, "")}`).toString("base64");
      return { Authorization: `Basic ${token}` };
    }
    if (creds.jwtToken) {
      return { Authorization: `Bearer ${creds.jwtToken}` };
    }
    return {};
  }

  return {
    cmsType: "wordpress",
    siteUrl: normalizedSiteUrl,

    async status(): Promise<CMSProviderStatus> {
      if (!creds.siteUrl || !creds.username) return "NOT_CONNECTED";
      try {
        const res = await customFetch(`${normalizedSiteUrl}/wp-json/wp/v2/users/me`, {
          headers: getAuthHeader(),
          signal: AbortSignal.timeout(6000),
        });

        if (res.status === 401 || res.status === 403) return "REAUTH_REQUIRED";
        if (!res.ok) return "ERROR";

        const user = (await res.json()) as any;
        const canEdit = Boolean(user.capabilities?.edit_posts || user.roles?.some((r: string) => ["administrator", "editor", "author"].includes(r)));

        if (canEdit && creds.writeEnabled !== false) return "WRITE_AVAILABLE";
        return "READ_ONLY";
      } catch {
        return "ERROR";
      }
    },

    async readPage(url: string): Promise<CMSPageContent> {
      const parsed = new URL(url);
      const slug = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/").pop() || "home";

      const res = await customFetch(`${normalizedSiteUrl}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`, {
        headers: getAuthHeader(),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        throw new WordPressExecutionError("WP_PAGE_READ_FAILED", `Failed to read page from WordPress: HTTP ${res.status}`);
      }

      const pages = (await res.json()) as any[];
      if (!pages || pages.length === 0) {
        throw new WordPressExecutionError("WP_PAGE_NOT_FOUND", `WordPress page with slug "${slug}" not found.`);
      }

      const p = pages[0];
      return {
        id: p.id,
        url,
        title: p.title?.rendered || "",
        bodyHtml: p.content?.rendered || "",
        status: p.status || "publish",
        lastModifiedAt: p.modified_gmt ? `${p.modified_gmt}Z` : new Date().toISOString(),
      };
    },

    async updateMetadata(url: string, meta: { title?: string; description?: string; canonical?: string }): Promise<CMSMutationResult> {
      if (creds.writeEnabled === false) {
        throw new WordPressExecutionError("WP_WRITE_DISABLED", "WordPress connector is in read-only mode for this workspace.");
      }

      const before = await this.readPage(url);
      const pageId = before.id;

      const payload: Record<string, unknown> = {};
      if (meta.title) payload.title = meta.title;
      if (meta.description) payload.meta = { description: meta.description };

      const res = await customFetch(`${normalizedSiteUrl}/wp-json/wp/v2/pages/${pageId}`, {
        method: "POST",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new WordPressExecutionError("WP_METADATA_UPDATE_FAILED", `WordPress metadata update failed (HTTP ${res.status}): ${errText.slice(0, 200)}`);
      }

      const updated = (await res.json()) as any;
      return {
        success: true,
        pageId,
        targetUrl: url,
        mutationKind: "metadata",
        beforeState: { title: before.title, metaDescription: before.metaDescription },
        afterState: { title: updated.title?.rendered, metaDescription: meta.description },
        deployedAt: new Date().toISOString(),
        providerReference: String(pageId),
      };
    },

    async updateSchema(url: string, schemaJsonLd: string | Record<string, unknown>): Promise<CMSMutationResult> {
      if (creds.writeEnabled === false) {
        throw new WordPressExecutionError("WP_WRITE_DISABLED", "WordPress connector is in read-only mode.");
      }

      const before = await this.readPage(url);
      const schemaString = typeof schemaJsonLd === "string" ? schemaJsonLd : JSON.stringify(schemaJsonLd);

      const res = await customFetch(`${normalizedSiteUrl}/wp-json/wp/v2/pages/${before.id}`, {
        method: "POST",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meta: { stratxcel_schema_jsonld: schemaString },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        throw new WordPressExecutionError("WP_SCHEMA_UPDATE_FAILED", `WordPress schema update failed: HTTP ${res.status}`);
      }

      return {
        success: true,
        pageId: before.id,
        targetUrl: url,
        mutationKind: "schema",
        beforeState: { schemaJsonLd: before.schemaJsonLd },
        afterState: { schemaJsonLd: schemaString },
        deployedAt: new Date().toISOString(),
      };
    },

    async updateContent(url: string, content: { title?: string; bodyHtml?: string }): Promise<CMSMutationResult> {
      if (creds.writeEnabled === false) {
        throw new WordPressExecutionError("WP_WRITE_DISABLED", "WordPress connector is in read-only mode.");
      }

      const before = await this.readPage(url);
      const payload: Record<string, unknown> = {};
      if (content.title) payload.title = content.title;
      if (content.bodyHtml) payload.content = content.bodyHtml;

      const res = await customFetch(`${normalizedSiteUrl}/wp-json/wp/v2/pages/${before.id}`, {
        method: "POST",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        throw new WordPressExecutionError("WP_CONTENT_UPDATE_FAILED", `WordPress content update failed: HTTP ${res.status}`);
      }

      return {
        success: true,
        pageId: before.id,
        targetUrl: url,
        mutationKind: "content",
        beforeState: { title: before.title, bodyHtml: before.bodyHtml },
        afterState: { title: content.title ?? before.title, bodyHtml: content.bodyHtml },
        deployedAt: new Date().toISOString(),
      };
    },

    async createPage(page: { title: string; slug: string; bodyHtml: string; metaDescription?: string; schemaJsonLd?: string }): Promise<CMSPageCreationResult> {
      if (creds.writeEnabled === false) {
        throw new WordPressExecutionError("WP_WRITE_DISABLED", "WordPress connector is in read-only mode.");
      }

      const res = await customFetch(`${normalizedSiteUrl}/wp-json/wp/v2/pages`, {
        method: "POST",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: page.title,
          slug: page.slug,
          content: page.bodyHtml,
          status: "publish",
          meta: {
            description: page.metaDescription,
            stratxcel_schema_jsonld: page.schemaJsonLd,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new WordPressExecutionError("WP_PAGE_CREATION_FAILED", `WordPress page creation failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
      }

      const created = (await res.json()) as any;
      return {
        success: true,
        pageId: created.id,
        createdUrl: created.link || `${normalizedSiteUrl}/${page.slug}`,
        status: "publish",
        afterState: { id: created.id, title: page.title, slug: page.slug },
        deployedAt: new Date().toISOString(),
      };
    },

    async publishPage(pageId: string | number): Promise<CMSMutationResult> {
      const res = await customFetch(`${normalizedSiteUrl}/wp-json/wp/v2/pages/${pageId}`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "publish" }),
      });

      if (!res.ok) {
        throw new WordPressExecutionError("WP_PUBLISH_FAILED", `WordPress publish failed: HTTP ${res.status}`);
      }

      const page = (await res.json()) as any;
      return {
        success: true,
        pageId,
        targetUrl: page.link,
        mutationKind: "publish",
        beforeState: { status: "draft" },
        afterState: { status: "publish" },
        deployedAt: new Date().toISOString(),
      };
    },

    async verifyPage(url: string, expected: CMSVerificationSpec): Promise<CMSVerificationResult> {
      const checks: Array<{ name: string; passed: boolean; expected: string; actual: string }> = [];

      try {
        const res = await customFetch(url, {
          headers: { "User-Agent": "StratXcel-Verification-Bot/1.0" },
          signal: AbortSignal.timeout(8000),
        });

        const statusPassed = !expected.requireHttpStatus200 || res.status === 200;
        checks.push({
          name: "HTTP Status 200",
          passed: statusPassed,
          expected: "200",
          actual: String(res.status),
        });

        const html = await res.text();

        if (expected.expectedTitle) {
          const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const actualTitle = match ? match[1].trim() : "";
          const passed = actualTitle.toLowerCase().includes(expected.expectedTitle.toLowerCase());
          checks.push({
            name: "Page Title Verification",
            passed,
            expected: expected.expectedTitle,
            actual: actualTitle,
          });
        }

        if (expected.expectedSchemaType) {
          const passed = html.includes(`"@type":"${expected.expectedSchemaType}"`) || html.includes(`"@type": "${expected.expectedSchemaType}"`);
          checks.push({
            name: "JSON-LD Schema Verification",
            passed,
            expected: expected.expectedSchemaType,
            actual: passed ? `Found @type: ${expected.expectedSchemaType}` : "Schema type not found in rendered HTML",
          });
        }

        if (expected.expectedTextSnippet) {
          const passed = html.includes(expected.expectedTextSnippet);
          checks.push({
            name: "Body Content Snippet",
            passed,
            expected: expected.expectedTextSnippet,
            actual: passed ? "Snippet found" : "Snippet not found",
          });
        }

        const allPassed = checks.every((c) => c.passed);
        return {
          verified: allPassed,
          verifiedAt: new Date().toISOString(),
          httpStatus: res.status,
          checks,
          failureReason: allPassed ? undefined : "One or more verification checks failed against live HTML response.",
        };
      } catch (err) {
        return {
          verified: false,
          verifiedAt: new Date().toISOString(),
          checks,
          failureReason: err instanceof Error ? err.message : "Live verification request failed",
        };
      }
    },

    async rollbackPage(pageId: string | number, previousState: Record<string, unknown>): Promise<CMSMutationResult> {
      const payload: Record<string, unknown> = {};
      if (previousState.title) payload.title = previousState.title;
      if (previousState.bodyHtml) payload.content = previousState.bodyHtml;

      const res = await customFetch(`${normalizedSiteUrl}/wp-json/wp/v2/pages/${pageId}`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new WordPressExecutionError("WP_ROLLBACK_FAILED", `Rollback failed: HTTP ${res.status}`);
      }

      return {
        success: true,
        pageId,
        targetUrl: `${normalizedSiteUrl}/?p=${pageId}`,
        mutationKind: "rollback",
        beforeState: {},
        afterState: previousState,
        deployedAt: new Date().toISOString(),
      };
    },
  };
}

/**
 * Creates a deterministic fixture/mock WordPress provider for testing.
 */
export function createFixtureWordPressProvider(options: {
  siteUrl: string;
  initialPages?: Record<string, CMSPageContent>;
  writeEnabled?: boolean;
}): CMSExecutionProvider {
  const pages = new Map<string, CMSPageContent>(Object.entries(options.initialPages || {}));
  const writeEnabled = options.writeEnabled !== false;

  return {
    cmsType: "wordpress",
    siteUrl: options.siteUrl,
    async status(): Promise<CMSProviderStatus> {
      return writeEnabled ? "WRITE_AVAILABLE" : "READ_ONLY";
    },
    async readPage(url: string): Promise<CMSPageContent> {
      const p = pages.get(url);
      if (!p) throw new WordPressExecutionError("WP_PAGE_NOT_FOUND", `Page ${url} not found`);
      return p;
    },
    async updateMetadata(url: string, meta: { title?: string; description?: string }): Promise<CMSMutationResult> {
      if (!writeEnabled) throw new WordPressExecutionError("WP_WRITE_DISABLED", "Write disabled");
      const current = pages.get(url) || { url, title: "Home", status: "publish" };
      const updated = { ...current, title: meta.title || current.title, metaDescription: meta.description };
      pages.set(url, updated);
      return {
        success: true,
        pageId: current.id ?? 1,
        targetUrl: url,
        mutationKind: "metadata",
        beforeState: { title: current.title },
        afterState: { title: updated.title },
        deployedAt: new Date().toISOString(),
      };
    },
    async updateSchema(url: string, schema: any): Promise<CMSMutationResult> {
      if (!writeEnabled) throw new WordPressExecutionError("WP_WRITE_DISABLED", "Write disabled");
      const current = pages.get(url) || { url, title: "Home", status: "publish" };
      const updated = { ...current, schemaJsonLd: schema };
      pages.set(url, updated);
      return {
        success: true,
        pageId: current.id ?? 1,
        targetUrl: url,
        mutationKind: "schema",
        beforeState: {},
        afterState: { schemaJsonLd: schema },
        deployedAt: new Date().toISOString(),
      };
    },
    async updateContent(url: string, content: { title?: string; bodyHtml?: string }): Promise<CMSMutationResult> {
      if (!writeEnabled) throw new WordPressExecutionError("WP_WRITE_DISABLED", "Write disabled");
      const current = pages.get(url) || { url, title: "Home", status: "publish" };
      const updated = { ...current, title: content.title || current.title, bodyHtml: content.bodyHtml };
      pages.set(url, updated);
      return {
        success: true,
        pageId: current.id ?? 1,
        targetUrl: url,
        mutationKind: "content",
        beforeState: {},
        afterState: { title: updated.title, bodyHtml: updated.bodyHtml },
        deployedAt: new Date().toISOString(),
      };
    },
    async createPage(page: { title: string; slug: string; bodyHtml: string }): Promise<CMSPageCreationResult> {
      if (!writeEnabled) throw new WordPressExecutionError("WP_WRITE_DISABLED", "Write disabled");
      const url = `${options.siteUrl}/${page.slug}`;
      pages.set(url, { id: 101, url, title: page.title, bodyHtml: page.bodyHtml, status: "publish" });
      return {
        success: true,
        pageId: 101,
        createdUrl: url,
        status: "publish",
        afterState: { id: 101, title: page.title },
        deployedAt: new Date().toISOString(),
      };
    },
    async publishPage(pageId: string | number): Promise<CMSMutationResult> {
      return {
        success: true,
        pageId,
        targetUrl: options.siteUrl,
        mutationKind: "publish",
        beforeState: { status: "draft" },
        afterState: { status: "publish" },
        deployedAt: new Date().toISOString(),
      };
    },
    async verifyPage(url: string, expected: CMSVerificationSpec): Promise<CMSVerificationResult> {
      const page = pages.get(url);
      const checks: Array<{ name: string; passed: boolean; expected: string; actual: string }> = [];

      if (expected.expectedTitle) {
        const passed = page ? page.title.includes(expected.expectedTitle) : false;
        checks.push({
          name: "Title Check",
          passed,
          expected: expected.expectedTitle,
          actual: page?.title || "Page not found",
        });
      }

      const allPassed = checks.length > 0 ? checks.every((c) => c.passed) : Boolean(page);
      return {
        verified: allPassed,
        verifiedAt: new Date().toISOString(),
        httpStatus: page ? 200 : 404,
        checks,
        failureReason: allPassed ? undefined : "Verification check failed",
      };
    },
    async rollbackPage(pageId: string | number, prev: Record<string, unknown>): Promise<CMSMutationResult> {
      return {
        success: true,
        pageId,
        targetUrl: options.siteUrl,
        mutationKind: "rollback",
        beforeState: {},
        afterState: prev,
        deployedAt: new Date().toISOString(),
      };
    },
  };
}
