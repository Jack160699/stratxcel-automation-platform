# Final Capability Audit (Integrated)

Post-wiring truth for `feat/v1-workforce-capability-wiring`.

| KEY | Static status | Notes |
|-----|---------------|-------|
| research.web / research.serp | PLANNED | Separate research workstream |
| content.shortform | NOT_CONFIGURED | PENDING_AI_RUNTIME_PR_45 |
| content.longform | PLANNED | |
| media.image_generation | NOT_CONFIGURED | May depend on PR #45 |
| media.carousel_generation / media.video_generation | UNAVAILABLE | |
| social.schedule / social.publish | AVAILABLE | Host → lib/social |
| seo.audit | AVAILABLE | search-web engine |
| seo.article | PLANNED | |
| seo.publish | NOT_CONFIGURED | No CMS bridge |
| website.generate | AVAILABLE | Draft only |
| website.deploy | PLANNED | Later Website Execution workstream |
| website.audit | AVAILABLE | Preserved + URL safety |
| ads.* | PLANNED | No spend / ads.publish unavailable path |
| crm.read / crm.write | AVAILABLE | leads-and-crm |
| whatsapp.send | AVAILABLE | outbound choke-point |
| analytics.read | AVAILABLE | reporting host; missing ≠ zeros |
| report.generate / brand.audit / conversion.audit / sales.analyze | PLANNED | |
| content.publish | NOT_CONFIGURED | |

## Counts

| Status | Count |
|--------|------:|
| AVAILABLE | 9 |
| UNAVAILABLE | 2 |
| NOT_CONFIGURED | 4 |
| PLANNED | 16 |

See [WORKFORCE_CAPABILITY_WIRING_V1.md](./WORKFORCE_CAPABILITY_WIRING_V1.md).
