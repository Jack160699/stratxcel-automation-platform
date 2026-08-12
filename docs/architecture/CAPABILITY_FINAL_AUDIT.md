# Final Capability Audit (Integrated)

Post-integration truth table. Optimize for honesty, not green status.

Legend for **Expected executability**: what `requestCapability` should do in production runtime today without test injection.

| KEY | Static status | Real runtime adapter | Provider | Config required | Integration required | Entitlement | External mutation | Approval | Expected executability |
|-----|---------------|----------------------|----------|-----------------|----------------------|-------------|-------------------|----------|------------------------|
| research.web | PLANNED | No | placeholder | — | — | — | no | no | NOT_READY |
| research.serp | PLANNED | Partial search-discovery; workforce path planned | placeholder | — | search_console | — | no | no | NOT_READY |
| content.shortform | NOT_CONFIGURED | Existing Social/Hermes draft path; workforce provider not wired | content-shortform-hermes (placeholder) | yes | — | — | no | no | WAITING_CONFIGURATION |
| content.longform | PLANNED | No | placeholder | — | — | — | no | no | NOT_READY |
| media.image_generation | AVAILABLE | Canonical AI Runtime provider shared by Creative Studio, Social, and Workforce | media-image-ai-runtime | provider + Supabase storage | — | active subscription + plan budget | no | no; downstream external publish still requires approval | READY only when dynamic readiness, tenant, mission, usage, and budget gates pass |
| media.carousel_generation | UNAVAILABLE | No real carousel without fake images | media-carousel-placeholder | — | media_generator | — | no | no | BLOCKED |
| media.video_generation | UNAVAILABLE | None | media-video-placeholder | — | — | — | no | no | BLOCKED |
| social.schedule | AVAILABLE | Canonical Social package queue via host-bound Workforce adapter | social-schedule-queue | host-bound | social_account | social_posts | no | yes | READY only with tenant, entitlement, integration, approval/standing authorization, and safety gates |
| social.publish | AVAILABLE | Canonical Social publish/worker path via host-bound Workforce adapter | social-publish-meta | host-bound | social_account | social_posts | yes | yes | READY only with exact approval/standing authorization, artifact scope, idempotency, and safety gates |
| seo.audit | AVAILABLE | search-web `buildSeoAuditReport` via Workforce adapter | seo-audit-search-discovery | no | — | — | no | no | READY with tenant, feature flag, safe URL, and real page inventory |
| seo.article | PLANNED | Draft pipeline contracts | placeholder | — | — | — | no | no | NOT_READY |
| seo.publish | NOT_CONFIGURED | No CMS bridge | seo-publish-placeholder | yes | cms_or_site_host | — | yes | yes | WAITING_CONFIGURATION |
| website.generate | AVAILABLE | websites-and-domains draft generator via Workforce adapter | website-generate-domains | no | — | website_maintenance | no | no | READY with entitlement; produces a draft artifact and never claims deployment |
| website.deploy | PLANNED | No production deploy from workforce | placeholder | — | domain_dns | website_maintenance | yes | yes | NOT_READY |
| website.audit | AVAILABLE | search-web `buildWebsiteAudit` | website-audit-internal | feature `search_web` | — | **none** (audit ≠ generate) | no | no | READY when flag + pages inventory |
| ads.plan | PLANNED | Acquisition `createCampaignPlan` (authorizesSpend=false) | placeholder | — | — | meta_ad_campaigns | no | no | NOT_READY via requestCapability |
| ads.publish | PLANNED / UNAVAILABLE provider | None | ads-publish-placeholder | — | meta_ads_account | meta_ad_campaigns | yes | yes | BLOCKED |
| ads.audit | PLANNED | No | placeholder | — | meta_ads_account | meta_ad_campaigns | no | no | NOT_READY |
| crm.read | AVAILABLE | tenant-scoped leads-and-crm repository adapter | crm-supabase | host-bound service client | — | — | no | no | READY with mission tenant and closed read operation allowlist |
| crm.write | AVAILABLE | tenant-scoped leads-and-crm repository adapter | crm-supabase | host-bound service client | — | — | yes | yes | READY only with exact approval or verified Hermes mission-tool grant and idempotency |
| crm.followup_plan | PLANNED | revenue-ops plan builders | placeholder | — | — | — | no | no | NOT_READY via requestCapability |
| whatsapp.send | AVAILABLE | canonical packages/whatsapp outbound choke point | whatsapp-meta | host-bound service client | whatsapp_binding | whatsapp_contacts | yes | yes | READY only with outbound binding, consent/session, entitlement, approval, Shadow/kill-switch, and idempotency gates |
| whatsapp.followup_plan | PLANNED | revenue-ops sequence drafts (sendAuthorized=false) | placeholder | — | — | whatsapp_contacts | no | no | NOT_READY via requestCapability |
| analytics.read | AVAILABLE | canonical tenant-scoped Search/Google GA4 reader | analytics-read-reporting | connected Google + selected GA4 property | analytics_property | — | no | no | READY when configured; persists truthful `analytics_evidence`; empty GA4 rows are valid |
| analytics.attribution | PLANNED | Performance loop contracts; unknown attribution honest | placeholder | — | analytics_property | — | no | no | NOT_READY |
| report.generate | PLANNED | No | placeholder | — | — | — | no | no | NOT_READY |
| brand.audit | PLANNED | Intelligence / Brand Brain readiness helpers | placeholder | — | — | — | no | no | NOT_READY |
| conversion.audit | PLANNED | revenue-ops conversion diagnosis | placeholder | — | — | — | no | no | NOT_READY |
| sales.analyze | PLANNED | revenue-ops sales specialists | placeholder | — | — | — | no | no | NOT_READY |
| content.publish | NOT_CONFIGURED | No | content-publish-placeholder | yes | cms_or_site_host | — | yes | yes | WAITING_CONFIGURATION |

## Counts (integrated)

| Status | Count |
|--------|------:|
| AVAILABLE | 10 |
| NOT_CONFIGURED | 3 |
| PLANNED | 15 |
| UNAVAILABLE | 2 |

A blocked reality is better than a fake success.
