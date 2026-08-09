import crypto from "node:crypto";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { getServiceContext, type OwnerContext } from "../db-context";
import { hashPairingCode } from "./pairing-hash";

export { hashPairingCode };

/** Generates a one-time pairing code (shown once in the admin UI) and stores only its hash. */
export async function createPendingDevice(ctx: OwnerContext, deviceName: string): Promise<{ deviceId: string; pairingCode: string }> {
  const pairingCode = crypto.randomBytes(16).toString("hex");
  const { data, error } = await ctx.supabase
    .from("owner_desktop_devices")
    .insert({ owner_id: ctx.ownerId, device_name: deviceName, pairing_token_hash: hashPairingCode(pairingCode), status: "PENDING_PAIRING" })
    .select("id")
    .single();
  if (error) throw new Error(`createPendingDevice failed: ${error.message}`);
  return { deviceId: data.id as string, pairingCode };
}

/** Called by the desktop companion's pairing endpoint. Issues a bearer token, vaults it, marks the device PAIRED. Never returns the vault ref — only the raw bearer token, once, to the device itself. */
export async function completeDevicePairing(input: { deviceId: string; pairingCode: string }): Promise<{ ok: true; bearerToken: string } | { ok: false; reason: string }> {
  const service = getServiceContext().supabase;
  const { data: device, error } = await service.from("owner_desktop_devices").select("*").eq("id", input.deviceId).maybeSingle();
  if (error) throw new Error(`completeDevicePairing lookup failed: ${error.message}`);
  if (!device) return { ok: false, reason: "not_found" };
  if (device.status !== "PENDING_PAIRING") return { ok: false, reason: "already_paired_or_revoked" };
  if (device.pairing_token_hash !== hashPairingCode(input.pairingCode)) return { ok: false, reason: "invalid_code" };

  const bearerToken = crypto.randomBytes(32).toString("base64url");
  const vault = createDevEncryptedVault(service);
  const ref = await vault.store(bearerToken);

  const { error: updateError } = await service
    .from("owner_desktop_devices")
    .update({ status: "PAIRED", encrypted_token_ref: ref, pairing_token_hash: null, last_seen_at: new Date().toISOString() })
    .eq("id", input.deviceId);
  if (updateError) throw new Error(`completeDevicePairing update failed: ${updateError.message}`);

  return { ok: true, bearerToken };
}

/** Verifies a device's bearer token against the vault (constant-time compare) and returns its owner_id — used by the desktop-companion ingestion API. */
export async function authenticateDevice(bearerToken: string): Promise<{ deviceId: string; ownerId: string } | null> {
  const service = getServiceContext().supabase;
  const { data: devices, error } = await service
    .from("owner_desktop_devices")
    .select("id, owner_id, encrypted_token_ref")
    .eq("status", "PAIRED");
  if (error) throw new Error(`authenticateDevice failed: ${error.message}`);
  const vault = createDevEncryptedVault(service);
  for (const device of devices ?? []) {
    if (!device.encrypted_token_ref) continue;
    const stored = await vault.retrieve(device.encrypted_token_ref);
    if (!stored) continue;
    const a = Buffer.from(stored);
    const b = Buffer.from(bearerToken);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      await service.from("owner_desktop_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
      return { deviceId: device.id as string, ownerId: device.owner_id as string };
    }
  }
  return null;
}

export async function listDevices(ctx: OwnerContext) {
  const { data, error } = await ctx.supabase
    .from("owner_desktop_devices")
    .select("id, device_name, status, last_seen_at, created_at, revoked_at")
    .eq("owner_id", ctx.ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listDevices failed: ${error.message}`);
  return data ?? [];
}

export async function revokeDevice(ctx: OwnerContext, deviceId: string): Promise<void> {
  const { data: device, error: readError } = await ctx.supabase
    .from("owner_desktop_devices")
    .select("encrypted_token_ref")
    .eq("id", deviceId)
    .eq("owner_id", ctx.ownerId)
    .single();
  if (readError) throw new Error(`revokeDevice read failed: ${readError.message}`);

  if (device.encrypted_token_ref) {
    const vault = createDevEncryptedVault(getServiceContext().supabase);
    await vault.revoke(device.encrypted_token_ref);
  }

  const { error } = await ctx.supabase
    .from("owner_desktop_devices")
    .update({ status: "REVOKED", revoked_at: new Date().toISOString(), encrypted_token_ref: null })
    .eq("id", deviceId)
    .eq("owner_id", ctx.ownerId);
  if (error) throw new Error(`revokeDevice failed: ${error.message}`);
}
