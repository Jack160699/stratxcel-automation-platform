# V1 Stable + Admin-Only Beta / V2 Mode

Canonical release contract for Stratxcel product surfaces.

## Classification
- `ProductRelease = "v1" | "v2"`
- Declared explicitly on each nav/product surface (`components/shell/navigation/*-nav-data.ts`)
- Never inferred from routes, branches, flags, or table existence
- Unknown release → fail closed (not visible)

## Who sees what
| Actor | Default | Beta control | Can see V2 |
|---|---|---|---|
| Public | V1 | No | No (technical pages redirect) |
| Customer `/app` | V1 | No | No |
| Staff (non owner-admin) | V1 | No | No |
| Owner-admin | V1 | Yes (admin header) | Only when Beta ON |

## Persistence
Server-owned httpOnly cookie `sx_release_mode=beta`. Not authorization by itself — every V2 request still requires owner-admin auth **and** Beta.

## Guards
- Pages: `requireReleaseAccess("v2")`
- APIs: `requireReleaseAccessApi("v2")` / `requireOperatingBrainApiAccess()`
- Public technical: `gatePublicTechnicalPage()`

## Promotion rule
A surface becomes Stable V1 only when product accepts it as default for all customers/staff — then flip `release` to `"v1"` and remove Beta-only framing. Nav + route/API guards must stay consistent.
