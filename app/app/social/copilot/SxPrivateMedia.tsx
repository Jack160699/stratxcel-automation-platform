"use client";

import { useEffect, useState } from "react";

/**
 * sx-token styled private media thumbnail — the customer-app equivalent of
 * admin's PrivateMedia (AttachmentMedia.tsx), which depends on the saut-*
 * stylesheet this surface deliberately doesn't load. Same real endpoint
 * (/api/social/copilot/media-preview), same signed-URL-per-render pattern,
 * same explicit error+retry (never a silent blank box).
 */
export function SxPrivateMedia({
  assetId,
  mimeType,
  alt = "",
  className = "",
}: {
  assetId: string;
  mimeType: string;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [resolvedMime, setResolvedMime] = useState(mimeType);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    // react-hooks/set-state-in-effect: resetting to a loading state before
    // starting a new fetch when a dependency (assetId/retryToken) changes
    // is the documented data-fetching pattern (react.dev "You Might Not
    // Need an Effect" -> "Fetching data"), not the "adjusting state from a
    // prop" case that rule exists to catch -- unlike that case, this one
    // genuinely belongs in the effect (it's gated by the same `active`
    // cleanup flag as the fetch itself).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(null);
    setError(null);
    fetch(`/api/social/copilot/media-preview?assetId=${encodeURIComponent(assetId)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Media preview unavailable.");
        return body as { url?: string; mimeType?: string };
      })
      .then((result) => {
        if (!active) return;
        if (!result?.url) {
          setError("Media preview unavailable.");
          return;
        }
        setUrl(result.url);
        setResolvedMime(result.mimeType || mimeType);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Media preview unavailable.");
      });
    return () => {
      active = false;
    };
  }, [assetId, mimeType, retryToken]);

  if (error) {
    return (
      <div className={`flex items-center justify-between gap-2 rounded-sx-sm bg-sx-danger/10 p-2.5 text-xs text-sx-danger ${className}`} role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => setRetryToken((n) => n + 1)} className="shrink-0 font-semibold underline underline-offset-2">
          Retry
        </button>
      </div>
    );
  }
  if (!url) {
    return <div className={`animate-pulse bg-sx-surface-2 ${className}`} aria-label="Loading media preview" />;
  }
  if (resolvedMime.startsWith("video/")) {
    return <video src={url} className={className} controls muted playsInline />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
