import { createHash } from "node:crypto";
import type { ServiceClient } from "@stratxcel/payments-and-wallet";

const memoryFallbackMap = new Map<string, number[]>();

export function promoRateLimitBucket(request: Request, extra = ""): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const realIp = request.headers.get("x-real-ip") ?? "";
  const rawIp = forwarded.split(",")[0]?.trim() || realIp || "127.0.0.1";
  return createHash("sha256").update(`sx_promo_salt_${rawIp}_${extra}`).digest("hex").slice(0, 24);
}

/** Returns true when the request is allowed. */
export async function enforcePromoRateLimit(
  service: ServiceClient,
  bucketHash: string,
  maxRequests = 20,
  windowSeconds = 900
): Promise<boolean> {
  try {
    const { data, error } = await service.rpc("check_and_increment_promo_rate_limit", {
      p_bucket_hash: bucketHash,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });
    if (!error && typeof data === "boolean") return data;
  } catch {
    // fall through to memory
  }

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const timestamps = (memoryFallbackMap.get(bucketHash) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    memoryFallbackMap.set(bucketHash, timestamps);
    return false;
  }
  timestamps.push(now);
  memoryFallbackMap.set(bucketHash, timestamps);
  return true;
}
