import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const FIELD_BASE =
  "w-full min-w-0 rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-2.5 text-[12.5px] text-sx-text placeholder:text-sx-text-subtle outline-none transition-[border-color,box-shadow] duration-150 ease-out focus-visible:border-sx-accent focus-visible:shadow-[0_0_0_3px_rgb(58_160_255_/_0.16)] disabled:cursor-not-allowed disabled:opacity-50";

export function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={htmlFor}>
      <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-sx-text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-9 ${FIELD_BASE} ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-[70px] resize-y py-2 leading-[1.5] ${FIELD_BASE} ${className}`} {...rest} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`h-9 ${FIELD_BASE} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function FieldLabel({ className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`text-[10.5px] font-medium uppercase tracking-[0.1em] text-sx-text-muted ${className}`} {...rest} />;
}
