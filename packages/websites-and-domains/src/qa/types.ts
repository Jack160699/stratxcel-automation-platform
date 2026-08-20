/**
 * Automated Browser QA Engine Types & Structured Scoring Contracts
 */

export type QACheckStatus = "PASSED" | "FAILED" | "WARNING";
export type QASeverity = "critical" | "warning" | "info";

export type QACategory =
  | "CORE_LOADING"
  | "RESPONSIVE_VIEWPORT"
  | "NAVIGATION"
  | "ASSETS"
  | "FORMS"
  | "ECOMMERCE"
  | "AI_AGENT"
  | "TECHNICAL"
  | "SEO";

export interface QACheckDetail {
  id: string;
  name: string;
  category: QACategory;
  status: QACheckStatus;
  severity: QASeverity;
  message: string;
  durationMs: number;
  viewport?: "375px" | "768px" | "1024px" | "1440px";
  route?: string;
  autoFixable?: boolean;
  fixRecommendation?: string;
}

export interface BrowserQAResult {
  status: "PASSED" | "FAILED" | "WARNING";
  score: number; // 0 to 100
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  criticalFailures: string[];
  warnings: string[];
  checks: QACheckDetail[];
  durationMs: number;
  runId: string;
  projectId: string;
  tenantId: string;
  version: number;
  previewUrl: string;
  runAt: string;
  customerFacingSummary: {
    state: "good" | "warning" | "blocked";
    title: string;
    description: string;
    canPublish: boolean;
    canAutoFix: boolean;
  };
}

export interface BrowserQAInput {
  projectId: string;
  tenantId: string;
  version: number;
  previewUrl: string;
  siteModel?: {
    name?: string;
    pages?: Array<{
      id: string;
      title: string;
      slug: string;
      sections: Array<{
        type: string;
        heading?: string;
        subheading?: string;
        ctaText?: string;
        ctaLink?: string;
        products?: Array<{ name: string; priceCents?: number }>;
        images?: Array<{ url: string; altText?: string }>;
        items?: Array<{ title?: string; description?: string }>;
      }>;
      seo?: { title?: string; description?: string };
    }>;
  };
  hasEcommerce?: boolean;
  hasAiAgent?: boolean;
  timeoutMs?: number;
}
