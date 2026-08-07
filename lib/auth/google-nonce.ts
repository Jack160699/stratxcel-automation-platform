/** Helper to generate a random hex string */
export function generateRandomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Helper to SHA-256 hash a nonce string for Google GIS */
export async function hashNonce(nonce: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(nonce);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
