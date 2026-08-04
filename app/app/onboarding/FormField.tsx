import type { ReactNode } from "react";

/** Label + control + hint/error, wired for aria-describedby — callers pass the matching id to their input. */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const hintId = hint && !error ? `${htmlFor}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between font-sx-sans text-[10.5px] font-medium uppercase tracking-[0.1em] text-sx-text-muted">
        <span>{label}</span>
        {optional && <span className="normal-case tracking-normal text-sx-text-subtle">Optional</span>}
      </label>
      {children}
      {hintId && (
        <p id={hintId} className="font-sx-sans text-[11.5px] leading-snug text-sx-text-subtle">
          {hint}
        </p>
      )}
      {errorId && (
        <p id={errorId} role="alert" className="font-sx-sans text-[11.5px] leading-snug text-sx-danger">
          {error}
        </p>
      )}
    </div>
  );
}
