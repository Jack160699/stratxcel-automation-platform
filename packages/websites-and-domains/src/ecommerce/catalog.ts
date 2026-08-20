/**
 * E-Commerce Catalog & Product Manager
 *
 * Handles creation, updates, category linking, and publishing lifecycle.
 */

import type { Product, ProductVariant, Category, Collection, ProductStatus } from "./types.ts";

export class CatalogManager {
  private products: Map<string, Product> = new Map();
  private categories: Map<string, Category> = new Map();
  private collections: Map<string, Collection> = new Map();

  /**
   * Creates a new product in the catalog.
   */
  public createProduct(
    params: Omit<Product, "id" | "createdAt" | "updatedAt" | "slug"> & { slug?: string }
  ): Product {
    if (!params.name || !params.tenantId || params.priceCents < 0) {
      throw new Error("Invalid product: name, tenantId, and valid priceCents are required");
    }

    const id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const slug = params.slug || params.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const product: Product = {
      ...params,
      id,
      slug,
      status: params.status || "ACTIVE",
      tags: params.tags || [],
      images: params.images || [],
      variants: params.variants || [],
      currency: params.currency || "INR",
      taxRatePercentage: params.taxRatePercentage ?? 18.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.products.set(id, product);
    return product;
  }

  /**
   * Updates an existing product.
   */
  public updateProduct(tenantId: string, productId: string, updates: Partial<Product>): Product {
    const product = this.products.get(productId);
    if (!product || product.tenantId !== tenantId) {
      throw new Error(`Product ${productId} not found for tenant ${tenantId}`);
    }

    const updated = {
      ...product,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.products.set(productId, updated);
    return updated;
  }

  /**
   * Archives a product (removes from public display).
   */
  public archiveProduct(tenantId: string, productId: string): Product {
    return this.updateProduct(tenantId, productId, { status: "ARCHIVED" });
  }

  /**
   * Retrieves a product by ID with tenant isolation.
   */
  public getProduct(tenantId: string, productId: string): Product {
    const product = this.products.get(productId);
    if (!product || product.tenantId !== tenantId) {
      throw new Error(`Product ${productId} not found for tenant ${tenantId}`);
    }
    return product;
  }

  /**
   * Lists public active products for a store (omits DRAFT and ARCHIVED).
   */
  public listPublicProducts(tenantId: string, siteProjectId?: string): Product[] {
    const results: Product[] = [];
    for (const product of this.products.values()) {
      if (product.tenantId === tenantId && product.status === "ACTIVE") {
        if (!siteProjectId || product.siteProjectId === siteProjectId) {
          results.push(product);
        }
      }
    }
    return results;
  }

  /**
   * Creates a category.
   */
  public createCategory(params: Omit<Category, "id">): Category {
    const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const category: Category = { ...params, id };
    this.categories.set(id, category);
    return category;
  }

  /**
   * Creates a collection.
   */
  public createCollection(params: Omit<Collection, "id">): Collection {
    const id = `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const collection: Collection = { ...params, id };
    this.collections.set(id, collection);
    return collection;
  }
}

export const catalogManager = new CatalogManager();
