export const PUBLIC_CTAS = {
  productDemo: { label: "See Stratxcel in Action", href: "/experience", event: "explore_product" as const, surface: "public_product_demo" },
  exploreProducts: { label: "Explore Products", href: "/products", event: "explore_product" as const, surface: "public_nav" },
  explorePlatform: { label: "Explore Products", href: "/products", event: "explore_product" as const, surface: "public_nav" },
  secondary: { label: "See How It Works", href: "/how-it-works", event: "explore_product" as const, surface: "public_secondary" },
  audit: { label: "Start Business Audit", href: "/audit", event: "start_audit" as const, surface: "public_audit" },
  pricing: { label: "View Pricing", href: "/pricing", event: "view_pricing" as const, surface: "public_pricing" },
  primary: { label: "Sign up", href: "/signup", event: "signup_intent" as const, surface: "public_header" },
  signIn: { label: "Log in", href: "/login" },
  androidApp: { label: "Get the Android App", href: "/download", event: "explore_product" as const, surface: "public_android_app" },
} as const;
