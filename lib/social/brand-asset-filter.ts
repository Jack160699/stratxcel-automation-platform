export const BRAND_ASSET_PURPOSES = new Set([
  "BRAND_ASSET",
  "LOGO_VARIANT",
  "brand_asset",
  "logo_variant",
  "logo",
  "brand_logo",
  "brand_mark",
  "shop_profile_photo",
  "shop_photo",
  "brand",
]);

export const LOGO_VARIANT_KEYS = new Set([
  "transparent",
  "monoDark",
  "monoLight",
  "badge",
  "monochrome_dark",
  "monochrome_light",
  "dark",
  "light",
]);

function addCleanIdentifiers(target: Set<string>, urlOrPath: string) {
  if (!urlOrPath || typeof urlOrPath !== "string") return;
  const clean = urlOrPath.trim().toLowerCase();
  if (!clean) return;
  target.add(clean);

  // Extract path without query parameters
  const noQuery = clean.split("?")[0].split("#")[0];
  target.add(noQuery);

  // Extract exact filename / last path component
  const segments = noQuery.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && lastSegment.length > 2) {
    target.add(lastSegment);
  }

  // Extract full UUIDs
  const uuidMatches = noQuery.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi);
  if (uuidMatches) {
    for (const u of uuidMatches) {
      target.add(u.toLowerCase());
    }
  }
}

export function extractBrandBrainIdentifiers(brainInput: any): Set<string> {
  const identifiers = new Set<string>();
  if (!brainInput) return identifiers;

  const contents: any[] = [];
  if (Array.isArray(brainInput)) {
    for (const b of brainInput) {
      if (b?.content) contents.push(b.content);
      else if (b && typeof b === "object") contents.push(b);
    }
  } else if (brainInput.content) {
    contents.push(brainInput.content);
  } else if (typeof brainInput === "object") {
    contents.push(brainInput);
  }

  for (const c of contents) {
    if (!c || typeof c !== "object") continue;
    if (typeof c.logo_url === "string") addCleanIdentifiers(identifiers, c.logo_url);
    if (typeof c.profile_photo_url === "string") addCleanIdentifiers(identifiers, c.profile_photo_url);
    if (typeof c.shop_photo_url === "string") addCleanIdentifiers(identifiers, c.shop_photo_url);

    if (c.logo_variants && typeof c.logo_variants === "object") {
      for (const vUrl of Object.values(c.logo_variants)) {
        if (typeof vUrl === "string") addCleanIdentifiers(identifiers, vUrl);
      }
    }
    if (Array.isArray(c.photos)) {
      for (const p of c.photos) {
        if (typeof p === "string") addCleanIdentifiers(identifiers, p);
        else if (p && typeof p.url === "string") addCleanIdentifiers(identifiers, p.url);
      }
    }
    if (Array.isArray(c.brand_assets)) {
      for (const a of c.brand_assets) {
        if (typeof a === "string") addCleanIdentifiers(identifiers, a);
        else if (a && typeof a.url === "string") addCleanIdentifiers(identifiers, a.url);
      }
    }
  }

  return identifiers;
}

export function isBrandOrLogoAsset(
  asset: {
    id?: string;
    original_name?: string;
    storage_path?: string;
    provenance?: Record<string, unknown> | null;
    source_type?: string;
    generation_job_id?: string | null;
    previewUrl?: string | null;
    url?: string | null;
  },
  activeBrandBrain?: any
): boolean {
  if (!asset) return false;

  const provenance = (asset.provenance || {}) as Record<string, unknown>;
  const purpose = String(provenance.purpose || "").trim();
  const purposeUpper = purpose.toUpperCase();

  // 1. Filter out by explicit purpose tag (e.g. BRAND_ASSET, LOGO_VARIANT, shop_profile_photo)
  if (
    purpose &&
    (BRAND_ASSET_PURPOSES.has(purpose) ||
      purposeUpper === "BRAND_ASSET" ||
      purposeUpper === "LOGO_VARIANT" ||
      purposeUpper === "LOGO" ||
      purposeUpper === "BRAND_LOGO" ||
      purposeUpper === "BRAND_MARK" ||
      purposeUpper === "SHOP_PROFILE_PHOTO" ||
      purposeUpper === "SHOP_PHOTO" ||
      purposeUpper === "BRAND")
  ) {
    return true;
  }

  // 2. Filter out by variant tag (e.g. transparent, monoDark, monoLight, badge)
  const variant = String(provenance.variant || "").trim();
  const variantUpper = variant.toUpperCase();
  if (
    variant &&
    (LOGO_VARIANT_KEYS.has(variant) ||
      variantUpper === "TRANSPARENT" ||
      variantUpper === "MONODARK" ||
      variantUpper === "MONOLIGHT" ||
      variantUpper === "BADGE" ||
      variantUpper === "MONOCHROME_DARK" ||
      variantUpper === "MONOCHROME_LIGHT" ||
      variantUpper === "DARK" ||
      variantUpper === "LIGHT")
  ) {
    return true;
  }

  // 3. Filter out by type or category tag
  const type = String(provenance.type || "").toLowerCase().trim();
  if (
    type === "logo" ||
    type === "brand_asset" ||
    type === "logo_variant" ||
    type === "brand" ||
    type === "brand_logo" ||
    type === "brand_mark" ||
    type === "shop_profile_photo"
  ) {
    return true;
  }

  const category = String(provenance.category || "").toLowerCase().trim();
  if (
    category === "brand_asset" ||
    category === "logo_variant" ||
    category === "brand_assets" ||
    category === "logo" ||
    category === "brand"
  ) {
    return true;
  }

  if (provenance.isBrandAsset === true || provenance.isLogoVariant === true) {
    return true;
  }

  // 4. Filter out by storage path structure (comprehensive directory & token matching)
  const path = String(asset.storage_path || "").toLowerCase();
  if (path) {
    if (
      path.includes("/shop-profile-photos/") ||
      path.includes("/brand-assets/") ||
      path.includes("/logo-variants/") ||
      path.includes("/logos/") ||
      path.includes("/brand/") ||
      path.includes("/brands/") ||
      path.includes("/profile-photos/") ||
      path.includes("/shop-photos/") ||
      path.includes("logo") ||
      path.includes("transparent") ||
      path.includes("monodark") ||
      path.includes("mono_dark") ||
      path.includes("mono-dark") ||
      path.includes("monolight") ||
      path.includes("mono_light") ||
      path.includes("mono-light") ||
      path.includes("monochrome") ||
      path.includes("badge")
    ) {
      return true;
    }
  }

  // 5. Filter out by logo/brand filename patterns (strictly excluding any logo/variant names)
  const name = String(asset.original_name || "").toLowerCase();
  if (name) {
    if (
      name.includes("logo") ||
      name.includes("transparent") ||
      name.includes("monodark") ||
      name.includes("mono_dark") ||
      name.includes("mono-dark") ||
      name.includes("monolight") ||
      name.includes("mono_light") ||
      name.includes("mono-light") ||
      name.includes("monochrome") ||
      name.includes("badge") ||
      name.includes("brand_mark") ||
      name.includes("brandmark") ||
      name.includes("brand-mark") ||
      name.includes("brand_asset") ||
      name.includes("brandasset") ||
      name.includes("brand-asset") ||
      name.includes("brand_profile") ||
      name.includes("shop_profile") ||
      name.includes("profile_photo") ||
      name.includes("shop_photo") ||
      name.startsWith("brand-") ||
      name.startsWith("brand_") ||
      name === "brand"
    ) {
      return true;
    }
  }

  // 6. Cross-reference against Active and Historic Brand Brain records
  if (activeBrandBrain) {
    const identifiers = extractBrandBrainIdentifiers(activeBrandBrain);
    if (identifiers.size > 0) {
      if (asset.id && asset.id.length >= 8) {
        const idLower = asset.id.toLowerCase();
        if (identifiers.has(idLower)) return true;
        for (const ident of identifiers) {
          if (ident.includes(idLower)) return true;
        }
      }
      if (asset.storage_path) {
        const pathLower = asset.storage_path.toLowerCase();
        const noQueryPath = pathLower.split("?")[0].split("#")[0];
        if (identifiers.has(noQueryPath)) return true;

        const pathSegments = noQueryPath.split("/").filter(Boolean);
        const fileName = pathSegments[pathSegments.length - 1];
        if (fileName && identifiers.has(fileName)) return true;

        for (const ident of identifiers) {
          if (ident.length > 8 && (ident.includes(noQueryPath) || noQueryPath.endsWith(ident))) {
            return true;
          }
        }
      }
      if (asset.original_name) {
        const nameLower = asset.original_name.toLowerCase();
        if (identifiers.has(nameLower)) return true;
      }
      const assetUrl = asset.previewUrl || asset.url;
      if (assetUrl) {
        const urlLower = assetUrl.toLowerCase().split("?")[0].split("#")[0];
        if (identifiers.has(urlLower)) return true;
        for (const ident of identifiers) {
          if (ident.length > 8 && urlLower.includes(ident)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}
