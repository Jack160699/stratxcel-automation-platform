# Final Capability Audit (Integrated)

Post-integration truth table. Optimize for honesty, not green status.

Legend for **Expected executability**: what `requestCapability` should do in production runtime today without test injection.

| KEY | Static status | Real runtime adapter | Provider | Config required | Integration required | Entitlement | External mutation | Approval | Expected executability |
|-----|---------------|----------------------|----------|-----------------|----------------------|-------------|-------------------|----------|------------------------|
| research.web | PLANNED | No | placeholder | — | — | — | no | no | NOT_READY |
| research.serp | PLANNED | Partial search-discovery; workforce path planned | placeholder | — | search_console | — | no | no | NOT_READY |
| content.shortform | NOT_CONFIGURED | Existing Social/Hermes draft path; workforce provider not wired | content-shortform-hermes (placeholder) | yes | — | — | no | no | WAITING_CONFIGURATION |
| content.longform | PLANNED | No | placeholder | — | — | — | no | no | NOT_READY |
| media.image_generation | NOT_CONFIGURED | Creative Studio boundary only | media-image-placeholder | yes | media_generator | — | no | no | WAITING_CONFIGURATION |
| media.carousel_generation | UNAVAILABLE | No real carousel without fake images | media-carousel-placeholder | — | media_generator | — | no | no | BLOCKED |
| media.video_generation | UNAVAILABLE | None | media-video-placeholder | — | — | — | no | no | BLOCKED |
| social.schedule | NOT_CONFIGURED | Existing package queue; workforce provider not wired | social-schedule-queue | yes | social_account | social_posts | no | no | WAITING_CONFIGURATION |
| social.publish | NOT_CONFIGURED | Existing Social worker; workforce provider not wired | social-publish-meta | yes | social_account | social_posts | yes | yes | WAITING_CONFIGURATION |
| seo.audit | NOT_CONFIGURED | search-web `buildSeoAuditReport` exists; capability provider not wired | seo-audit-search-discovery | yes | — | — | no | no | WAITING_CONFIGURATION |
| seo.article | PLANNED | Draft pipeline contracts | placeholder | — | — | — | no | no | NOT_READY |
| seo.publish | NOT_CONFIGURED | No CMS bridge | seo-publish-placeholder | yes | cms_or_site_host | — | yes | yes | WAITING_CONFIGURATION |
| website.generate | NOT_CONFIGURED | websites-and-domains draft path; workforce provider not wired | website-generate-domains | yes | — | website_maintenance | no | no | WAITING_CONFIGURATION |
| website.deploy | PLANNED | No production deploy from workforce | placeholder | — | domain_dns | website_maintenance | yes | yes | NOT_READY |
| website.audit | AVAILABLE | search-web `buildWebsiteAudit` | website-audit-internal | feature `search_web` | — | **none** (audit ≠ generate) | no | no | READY when flag + pages inventory |
| ads.plan | PLANNED | Acquisition `createCampaignPlan` (authorizesSpend=false) | placeholder | — | — | meta_ad_campaigns | no | no | NOT_READY via requestCapability |
| ads.publish | PLANNED / UNAVAILABLE provider | None | ads-publish-placeholder | — | meta_ads_account | meta_ad_campaigns | yes | yes | BLOCKED |
| ads.audit | PLANNED | No | placeholder | — | meta_ads_account | meta_ad_campaigns | no | no | NOT_READY |
| crm.read | NOT_CONFIGURED | leads-and-crm repository exists; workforce provider not wired | crm-supabase | yes | — | — | no | no | WAITING_CONFIGURATION |
| crm.write | NOT_CONFIGURED | repository exists; workforce provider not wired | crm-supabase | yes | — | — | yes | yes | WAITING_CONFIGURATION |
| crm.followup_plan | PLANNED | revenue-ops plan builders | placeholder | — | — | — | no | no | NOT_READY via requestCapability |
| whatsapp.send | NOT_CONFIGURED | packages/whatsapp outbound; workforce not wired | whatsapp-meta | yes | whatsapp_binding | whatsapp_contacts | yes | yes | WAITING_CONFIGURATION |
| whatsapp.followup_plan | PLANNED | revenue-ops sequence drafts (sendAuthorized=false) | placeholder | — | — | whatsapp_contacts | no | no | NOT_READY via requestCapability |
| analytics.read | NOT_CONFIGURED | Reporting bridge incomplete for workforce | analytics-read-placeholder | yes | analytics_property | — | no | no | WAITING_CONFIGURATION |
| analytics.attribution | PLANNED | Performance loop contracts; unknown attribution honest | placeholder | — | analytics_property | — | no | no | NOT_READY |
| report.generate | PLANNED | No | placeholder | — | — | — | no | no | NOT_READY |
| brand.audit | PLANNED | Intelligence / Brand Brain readiness helpers | placeholder | — | — | — | no | no | NOT_READY |
| conversion.audit | PLANNED | revenue-ops conversion diagnosis | placeholder | — | — | — | no | no | NOT_READY |
| sales.analyze | PLANNED | revenue-ops sales specialists | placeholder | — | — | — | no | no | NOT_READY |
| content.publish | NOT_CONFIGURED | No | content-publish-placeholder | yes | cms_or_site_host | — | yes | yes | WAITING_CONFIGURATION |

## Counts (integrated)

| Status | Count |
|--------|------:|
| AVAILABLE | 1 |
| NOT_CONFIGURED | 12 |
| PLANNED | 15 |
| UNAVAILABLE | 2 |

A blocked reality is better than a fake success.
