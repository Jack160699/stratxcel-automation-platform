export const PUBLIC_CTAS = {
  primary: { label: "Get Started", href: "/signup", event: "signup_intent" as const, surface: "public_header" },
  explorePlatform: { label: "Explore Platform", href: "/products", event: "explore_product" as const, surface: "public_nav" },
  secondary: { label: "See How It Works", href: "/how-it-works", event: "explore_product" as const, surface: "public_secondary" },
  audit: { label: "Start Business Audit", href: "/audit", event: "start_audit" as const, surface: "public_audit" },
  pricing: { label: "View Pricing", href: "/pricing", event: "view_pricing" as const, surface: "public_pricing" },
  signIn: { label: "Sign in", href: "/login" },
} as const;
