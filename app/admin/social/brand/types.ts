export type BrandActionResult = { ok: true; message: string } | { ok: false; error: string };

export type BrandFormAction = (prevState: BrandActionResult | null, formData: FormData) => Promise<BrandActionResult>;
