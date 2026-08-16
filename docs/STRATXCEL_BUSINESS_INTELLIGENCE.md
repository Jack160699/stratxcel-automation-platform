# StratXcel Business Intelligence & Website Pipeline

## 1. Overview

The Business Intelligence Pipeline provides automated, deterministic discovery and extraction of public business facts from websites and connected digital assets.

---

## 2. Pipeline Architecture

```
URL
 ↓
URL Normalization (Strip hashes, tracking params, standard pathing)
 ↓
SSRF Protection (DNS address resolution, private IPv4/IPv6 blocking)
 ↓
Robots.txt Analysis (Identify user-agent rules & sitemap pointers)
 ↓
Sitemap Discovery & Index Recursion (Traverse <sitemapindex> and <urlset>)
 ↓
Priority Queue Initialization (Homepage = 0, About/Services/Contact = 1, Blog = 3, Legal = 4)
 ↓
Bounded Crawl Loop (Max pages, timeouts, redirect depth, response size limits)
 ↓
Extraction Layer:
  • Structured Data (JSON-LD Organization, LocalBusiness, Store, Restaurant, Clinic)
  • Technical SEO (Titles, Meta, H1/H2/H3, Canonical, Alt coverage, Indexability)
  • Contact & Conversion (WhatsApp buttons, Tel links, Mailto, Forms, Booking)
  • Technology & Frameworks (Next.js, React, Vue, Shopify, WooCommerce, WordPress)
  • Social Presence (Instagram, Facebook, LinkedIn, YouTube, X)
 ↓
Fact Normalization Store (Evidence tagging & UNKNOWN fallbacks)
```

---

## 3. Fact / Evidence Rule

> [!IMPORTANT]
> **NO HALLUCINATED BUSINESS FACTS**
> Every extracted business fact is structured with strict provenance:
> ```json
> {
>   "value": "...",
>   "source": "https://example.in",
>   "evidence": "Schema.org LocalBusiness name: 'Example'",
>   "confidence": "HIGH",
>   "observed_at": "2026-08-16T12:00:00Z"
> }
> ```
> If public evidence is absent, `value = "UNKNOWN"` and `confidence = "LOW"`. The system never invents generic claims (e.g. "Audience = modern customers").
