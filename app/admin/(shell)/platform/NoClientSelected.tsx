import Link from "next/link";

export function NoClientSelected({ what }: { what: string }) {
  return (
    <p className="text-sm text-sx-text-subtle">
      Create or select a client to view {what} —{" "}
      <Link href="/admin/platform/tenants" className="text-sx-accent hover:underline">
        go to Clients
      </Link>
      .
    </p>
  );
}
