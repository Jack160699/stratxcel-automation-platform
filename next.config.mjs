/** @type {import('next').NextConfig} */
const nextConfig = {
  // Phase 3 monorepo packages ship raw TS source (no build step) — Next
  // does not transpile node_modules/workspace-linked code by default, so
  // each must be listed here or the dashboard's imports of them fail at
  // build time despite typechecking fine.
  transpilePackages: [
    "@stratxcel/audit",
    "@stratxcel/payments-and-wallet",
    "@stratxcel/leads-and-crm",
    "@stratxcel/missions",
    "@stratxcel/approvals",
    "@stratxcel/whatsapp",
    "@stratxcel/websites-and-domains",
    "@stratxcel/human-handoff",
    "@stratxcel/brand-brain",
  ],
};

export default nextConfig;
