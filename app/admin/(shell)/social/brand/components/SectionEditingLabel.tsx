/** "Editing {item}" header shown while a Brand Brain section's edit form is open — truncates instead of overflowing the card on a very long name/text. */
export function SectionEditingLabel({ label }: { label: string }) {
  return (
    <span className="min-w-0 truncate text-xs" style={{ color: "var(--saut-text-subtle)" }}>
      Editing <span style={{ color: "var(--saut-text)" }}>{label}</span>
    </span>
  );
}
