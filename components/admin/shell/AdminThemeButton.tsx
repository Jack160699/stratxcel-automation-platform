"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { Sun, Moon } from "lucide-react";

export function AdminThemeButton() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-sx-border/80 bg-sx-surface-2 text-sx-text-muted transition-colors hover:border-sx-border-strong hover:bg-sx-surface-1 hover:text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent"
    >
      {isDark ? (
        <Sun size={15} strokeWidth={1.75} className="text-amber-300 transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon size={15} strokeWidth={1.75} className="text-sx-text-muted transition-transform duration-200 hover:-rotate-12" />
      )}
    </button>
  );
}
