"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolvePostLoginRedirect, finalizeAuthWorkspaceIntent } from "@/app/actions/auth";
import { generateRandomNonce, hashNonce } from "@/lib/auth/google-nonce";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          prompt: (notification?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; getNotDisplayedReason: () => string; getSkippedReason: () => string }) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

interface GoogleOneTapProps {
  next?: string;
  mode?: "customer" | "admin";
  onError?: (error: string) => void;
}

export function GoogleOneTap({ next, mode, onError }: GoogleOneTapProps) {
  const router = useRouter();
  const initializedRef = useRef(false);
  const [loaded, setLoaded] = useState(() => typeof window !== "undefined" && !!window.google);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    if (loaded) return;

    // Check if dismissed in this session
    if (typeof window !== "undefined" && sessionStorage.getItem("stratxcel_onetap_dismissed") === "true") {
      return;
    }

    // Load GIS script if not present
    const scriptId = "google-gis-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => setLoaded(true);
      document.head.appendChild(script);
    } else {
      script.addEventListener("load", () => setLoaded(true));
    }
  }, [loaded]);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!loaded || !clientId || !window.google || initializedRef.current) return;

    initializedRef.current = true;
    const rawNonce = generateRandomNonce();

    (async () => {
      try {
        const hashedNonce = await hashNonce(rawNonce);

        window.google?.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential?: string }) => {
            if (!response.credential) {
              onError?.("No credential received from Google One Tap.");
              return;
            }

            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: response.credential,
              nonce: rawNonce,
            });

            if (error) {
              onError?.(error.message);
              return;
            }

            await finalizeAuthWorkspaceIntent(mode ?? "customer");

            const destination = next ?? (await resolvePostLoginRedirect());
            router.push(destination);
            router.refresh();
          },
          nonce: hashedNonce,
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });

        window.google?.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            sessionStorage.setItem("stratxcel_onetap_dismissed", "true");
          }
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "One Tap initialization failed";
        onError?.(msg);
      }
    })();
  }, [loaded, router, onError, next, mode]);

  return null;
}
