import Link from "next/link";

export function NoClientSelected({ what }: { what: string }) {
  return (
    <p className="text-sm text-slate-500">
      Create or select a client to view {what} —{" "}
      <Link href="/admin/platform/tenants" className="text-sky-400 hover:underline">
        go to Clients
      </Link>
      .
    </p>
  );
}
