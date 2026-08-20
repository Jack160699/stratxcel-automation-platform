/**
 * E-Commerce Intelligence Analyzer for Website Intelligence Engine
 *
 * Detects:
 *   - Platforms (Shopify, WooCommerce, Magento, BigCommerce, Custom)
 *   - Currencies (INR ₹, USD $, EUR €, GBP £)
 *   - Cart & Checkout buttons / links
 *   - Product listings & pricing patterns
 */

import type { EcommerceUnderstanding } from "./schema.ts";

export function analyzeEcommerce(html: string): EcommerceUnderstanding {
  let platformDetected: EcommerceUnderstanding["platformDetected"] = "None";
  let isEcommerce = false;
  const features: string[] = [];

  // 1. Platform Detection
  if (/cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html)) {
    platformDetected = "Shopify";
    isEcommerce = true;
    features.push("Shopify hosted storefront");
  } else if (/woocommerce|wc-api|wp-content\/plugins\/woocommerce/i.test(html)) {
    platformDetected = "WooCommerce";
    isEcommerce = true;
    features.push("WooCommerce WordPress plugin");
  } else if (/mage\/cookies|varienForm|Magento/i.test(html)) {
    platformDetected = "Magento";
    isEcommerce = true;
    features.push("Magento enterprise e-commerce platform");
  } else if (/bigcommerce/i.test(html)) {
    platformDetected = "BigCommerce";
    isEcommerce = true;
    features.push("BigCommerce storefront");
  }

  // 2. Cart & Checkout Detection
  const cartDetected = /add-to-cart|shopping-cart|cart-drawer|\/cart\b|view-cart/i.test(html);
  const checkoutDetected = /\/checkout\b|proceed-to-checkout|buy-now|pay-now/i.test(html);

  if (cartDetected) features.push("Shopping cart functionality");
  if (checkoutDetected) features.push("Direct checkout pathway");

  // 3. Currency Detection
  let currency = "INR";
  if (html.includes("₹") || /INR\b/i.test(html)) {
    currency = "INR";
  } else if (html.includes("$") || /USD\b/i.test(html)) {
    currency = "USD";
  } else if (html.includes("€") || /EUR\b/i.test(html)) {
    currency = "EUR";
  } else if (html.includes("£") || /GBP\b/i.test(html)) {
    currency = "GBP";
  }

  // 4. Product Listing Detection
  const priceMatches = html.match(/(?:₹|\$|€|£)\s*\d+(?:\.\d{2})?/g) || [];
  const productCountEstimate = Math.min(priceMatches.length, 50);

  if (priceMatches.length > 0 || cartDetected || checkoutDetected) {
    isEcommerce = true;
    if (platformDetected === "None") {
      platformDetected = "Custom";
    }
  }

  return {
    isEcommerce,
    platformDetected,
    currency,
    productCountEstimate,
    cartDetected,
    checkoutDetected,
    features,
  };
}
