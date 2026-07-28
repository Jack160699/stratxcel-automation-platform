const KIND_STYLE: Record<"error" | "success" | "info", { color: string; role: "alert" | "status" }> = {
  error: { color: "var(--saut-danger)", role: "alert" },
  success: { color: "var(--saut-success)", role: "status" },
  info: { color: "var(--saut-text-muted)", role: "status" },
};

export function AuthStatusMessage({ kind, children }: { kind: "error" | "success" | "info"; children: string }) {
  const { color, role } = KIND_STYLE[kind];
  return (
    <p role={role} className="text-xs leading-relaxed" style={{ color }}>
      {children}
    </p>
  );
}
