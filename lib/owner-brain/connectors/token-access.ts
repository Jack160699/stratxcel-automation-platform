import { createDevEncryptedVault } from "@stratxcel/byok";
import { getServiceContext } from "../db-context";
import { refreshGoogleAccessToken } from "./google-oauth";

/** Decrypts the connection's stored refresh token and exchanges it for a fresh access token. Never returns or logs the refresh token itself. */
export async function getFreshGoogleAccessToken(connectionId: string): Promise<string> {
  const service = getServiceContext().supabase;
  const { data: connection, error } = await service.from("owner_source_connections").select("encrypted_token_ref").eq("id", connectionId).single();
  if (error) throw new Error(`getFreshGoogleAccessToken lookup failed: ${error.message}`);
  if (!connection.encrypted_token_ref) throw new Error("Connection has no stored token");

  const vault = createDevEncryptedVault(service);
  const refreshToken = await vault.retrieve(connection.encrypted_token_ref);
  if (!refreshToken) throw new Error("Stored token could not be retrieved from vault");

  const { accessToken } = await refreshGoogleAccessToken(refreshToken);
  return accessToken;
}

/** Same shape for any bearer-style connector (GitHub, Notion) whose stored secret IS the usable credential (no refresh step). */
export async function getStoredSecret(connectionId: string): Promise<string> {
  const service = getServiceContext().supabase;
  const { data: connection, error } = await service.from("owner_source_connections").select("encrypted_token_ref").eq("id", connectionId).single();
  if (error) throw new Error(`getStoredSecret lookup failed: ${error.message}`);
  if (!connection.encrypted_token_ref) throw new Error("Connection has no stored token");
  const vault = createDevEncryptedVault(service);
  const secret = await vault.retrieve(connection.encrypted_token_ref);
  if (!secret) throw new Error("Stored token could not be retrieved from vault");
  return secret;
}
