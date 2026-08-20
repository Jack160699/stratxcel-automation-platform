/**
 * Shared nav-model types — plain TypeScript, no JSX, no React import.
 * Deliberately separate from the icon-bearing files (app-navigation.tsx /
 * admin-navigation.tsx / shared-icons.tsx) so this file and the plain data
 * files that use it can be imported directly by a Node test script
 * (`node --experimental-strip-types`, which strips TS types but does not
 * provide a JSX transform — a .tsx file with real JSX can't be imported
 * that way).
 */

import type { ProductRelease } from "@/lib/release/product-release";

export interface NavItemData {
  key: string;
  label: string;
  href: string;
  /**
   * Explicit product release. Required for every nav item.
   * Unknown / missing values fail closed in filterNavGroupsByRelease.
   */
  release: ProductRelease;
  /**
   * Optional Hindi sub-label shown under the English label in the customer
   * shell (StratXcel App Design Spec §4.1) — /admin ignores this field.
   */
  labelHi?: string;
}

export interface NavGroupData {
  label?: string;
  items: NavItemData[];
}
