/**
 * STRATXCEL final closure brief: real, load-bearing discovery made while
 * fixing the Brand Brain admin-page tenant-scoping bug -- there are TWO
 * real, distinct tenant rows in the live database both literally named
 * "Stratxcel":
 *   - 872723d5-0c21-4638-8921-99213c4ed63a (slug "stratxcel", created
 *     2026-08-09) -- the platform team's own internal/founder tenant. The
 *     currently logged-in staff account has a real tenant_members "owner"
 *     row here, which is why it's what the admin shell's "S Stratxcel ▾"
 *     client switcher and any resolveCurrentTenant()-based lookup
 *     resolves to for that staff session -- NOT the real customer.
 *   - 466e6195-a9f6-4576-8271-29fdae61c18a (slug "stratxcel-ulot", created
 *     2026-08-23) -- the real, live, paying CUSTOMER tenant every real
 *     subscription/billing/entitlement/queue/image-spend finding across
 *     this whole engagement has actually been about.
 *
 * A real bug was caught live because of this: the Brand Brain admin page
 * fix initially used resolveCurrentTenant() (correct in general, and
 * exactly right for a real end-user's own multi-tenant membership) to
 * resolve "the tenant being managed" -- which silently resolved to the
 * WRONG "Stratxcel" (the staff member's own tenant_members row), not the
 * real customer, because admin staff access a real customer's data via
 * the separate stratxcel_admins grant, never by being a genuine
 * tenant_members row for every customer they manage.
 *
 * Until this admin surface has a real, general "which client is staff
 * currently managing" selector (it doesn't today -- see
 * app/admin/(shell)/social/system/page.tsx's own prior comment on this
 * same real constraint), every admin Social Operations page that needs
 * "the" tenant must reference this ONE real, shared, explicitly-named
 * constant -- never re-derive or re-hardcode it independently, and never
 * reach for resolveCurrentTenant()/tenant_members for this purpose.
 */
export const STRATXCEL_TENANT_ID = "466e6195-a9f6-4576-8271-29fdae61c18a";
