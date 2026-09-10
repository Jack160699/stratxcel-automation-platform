/**
 * Source Adapters Fabric & Registry
 * StratXcel Autonomous Company OS - Workforce Core
 */

export * from "./google-places-adapter.ts";
export * from "./google-search-adapter.ts";
export * from "./website-crawler-adapter.ts";
export * from "./apollo-adapter.ts";
export * from "./directory-adapters.ts";
export * from "./social-adapters.ts";
export * from "./grounded-catalog-adapter.ts";

import { GooglePlacesAdapter } from "./google-places-adapter.ts";
import { GoogleSearchAdapter } from "./google-search-adapter.ts";
import { WebsiteCrawlerAdapter } from "./website-crawler-adapter.ts";
import { ApolloAdapter } from "./apollo-adapter.ts";
import {
  IndiaMartAdapter,
  JustdialAdapter,
  TradeIndiaAdapter,
  UdyamAdapter,
} from "./directory-adapters.ts";
import { LinkedInAdapter, MetaSocialAdapter } from "./social-adapters.ts";
import { GroundedCatalogAdapter } from "./grounded-catalog-adapter.ts";
import type { LeadSourceAdapter } from "../types.ts";

export function createDefaultSourceAdapters(): LeadSourceAdapter[] {
  return [
    new GroundedCatalogAdapter(),
    new GooglePlacesAdapter(),
    new GoogleSearchAdapter(),
    new WebsiteCrawlerAdapter(),
    new ApolloAdapter(),
    new JustdialAdapter(),
    new IndiaMartAdapter(),
    new TradeIndiaAdapter(),
    new UdyamAdapter(),
    new LinkedInAdapter(),
    new MetaSocialAdapter(),
  ];
}
