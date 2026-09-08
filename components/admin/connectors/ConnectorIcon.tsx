import React from "react";

export function ConnectorIcon({
  connectorKey,
  className = "h-5 w-5",
  size = 40,
}: {
  connectorKey: string;
  className?: string;
  size?: number;
}) {
  const containerStyle = { width: size, height: size };

  return (
    <div
      style={containerStyle}
      className="flex shrink-0 items-center justify-center rounded-xl border border-sx-border/80 bg-sx-surface-2/90 text-sx-text shadow-sm transition-colors duration-150 group-hover:border-sx-border group-hover:bg-sx-surface-3"
      aria-hidden="true"
    >
      {renderIcon(connectorKey, className)}
    </div>
  );
}

function renderIcon(key: string, className: string) {
  switch (key) {
    case "google_ai_pro":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          {/* Google G with 4-colors */}
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            fill="#EA4335"
          />
        </svg>
      );

    case "google":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            fill="#EA4335"
          />
        </svg>
      );

    case "gemini":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"
            fill="url(#gemini-grad)"
          />
          <defs>
            <linearGradient id="gemini-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#93C5FD" />
              <stop offset="0.5" stopColor="#818CF8" />
              <stop offset="1" stopColor="#C084FC" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "claude":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M14.5 4.5L12 8L9.5 4.5H5.5L9.5 10L5.5 15.5H9.5L12 12L14.5 15.5H18.5L14.5 10L18.5 4.5H14.5Z"
            fill="#D97706"
          />
          <circle cx="12" cy="12" r="2.5" fill="#F59E0B" />
        </svg>
      );

    case "openrouter":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#818CF8" />
          <path d="M2 17L12 22L22 17" stroke="#818CF8" />
          <path d="M2 12L12 17L22 12" stroke="#818CF8" />
        </svg>
      );

    case "github":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
          />
        </svg>
      );

    case "vercel":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 3L22 20H2L12 3Z" />
        </svg>
      );

    case "supabase":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M13.4 2.1L3.9 14.1C3.5 14.6 3.9 15.3 4.5 15.3H11.5L10.6 21.9C10.5 22.4 11.1 22.7 11.5 22.3L21 10.3C21.4 9.8 21 9.1 20.4 9.1H13.4L14.3 2.5C14.4 2 13.8 1.7 13.4 2.1Z"
            fill="#3ECF8E"
          />
        </svg>
      );

    case "aws":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M6.5 14.5C9.5 17 14.5 17 17.5 14.5"
            stroke="#FF9900"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M16 13L18 14.5L16 16" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M4 11C3 9 3 6 6 5C9 4 11 6 12 7C13 6 15 4 18 5C21 6 21 9 20 11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );

    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="#25D366">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.44 19.65L5.27 16.62L5.07 16.31C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.68 12.04 3.68C14.25 3.68 16.31 4.54 17.87 6.1C19.42 7.66 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15ZM16.56 14.37C16.31 14.25 15.09 13.65 14.86 13.56C14.63 13.48 14.47 13.44 14.3 13.68C14.14 13.93 13.67 14.48 13.53 14.64C13.38 14.81 13.24 14.83 12.99 14.71C12.74 14.58 11.94 14.32 11 13.48C10.26 12.82 9.77 12.01 9.62 11.76C9.48 11.51 9.6 11.38 9.73 11.25C9.84 11.14 9.98 10.96 10.1 10.82C10.23 10.68 10.27 10.58 10.35 10.41C10.43 10.25 10.39 10.11 10.33 9.98C10.27 9.86 9.77 8.64 9.57 8.14C9.37 7.66 9.17 7.72 9.01 7.72H8.53C8.36 7.72 8.1 7.78 7.87 8.03C7.65 8.28 7.02 8.87 7.02 10.07C7.02 11.27 7.89 12.43 8.01 12.6C8.14 12.76 9.73 15.22 12.17 16.27C12.75 16.52 13.2 16.67 13.55 16.78C14.13 16.97 14.67 16.94 15.09 16.88C15.56 16.81 16.53 16.29 16.73 15.72C16.93 15.15 16.93 14.66 16.87 14.56C16.81 14.46 16.65 14.4 16.4 14.28L16.56 14.37Z" />
        </svg>
      );

    case "telegram":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="#229ED9">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.53 2.77-1.19 3.35-1.4 3.73-1.4.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
        </svg>
      );

    case "meta":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path
            d="M6.5 15.5C4.5 15.5 3 14 3 12C3 10 4.5 8.5 6.5 8.5C8.8 8.5 10.5 11 12 12C13.5 13 15.2 15.5 17.5 15.5C19.5 15.5 21 14 21 12C21 10 19.5 8.5 17.5 8.5C15.2 8.5 13.5 11 12 12C10.5 13 8.8 15.5 6.5 15.5Z"
            stroke="#0081FB"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "apollo":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <circle cx="12" cy="12" r="8" stroke="#F59E0B" strokeWidth="2" />
          <path d="M12 7V17M7 12H17" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" fill="#F59E0B" />
        </svg>
      );

    case "s3":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="#E25A1C" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5V12C4 13.66 7.58 15 12 15C16.42 15 20 13.66 20 12V5" />
          <path d="M4 12V19C4 20.66 7.58 22 12 22C16.42 22 20 20.66 20 19V12" />
        </svg>
      );

    case "payments":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <circle cx="6" cy="15" r="1" fill="currentColor" />
          <circle cx="10" cy="15" r="1" fill="currentColor" />
        </svg>
      );

    case "browser":
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <circle cx="6.5" cy="6.5" r="1" fill="currentColor" />
          <circle cx="9.5" cy="6.5" r="1" fill="currentColor" />
        </svg>
      );
  }
}
