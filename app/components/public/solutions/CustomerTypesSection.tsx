import Link from "next/link";
import { PUBLISHED_CUSTOMER_TYPES } from "@/lib/solutions/customer-types";
import { Card } from "@/components/ui/Card";

export function CustomerTypesSection() {
  return (
    <section id="by-customer-type" className="border-b border-sx-border">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold">By business type</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-sx-text-muted">
          Looking for a specific local business journey?{" "}
          <Link href="/solutions#built-around-your-business" className="font-semibold text-sx-accent hover:underline">
            Browse restaurants, clinics, retail, and more
          </Link>
          .
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {PUBLISHED_CUSTOMER_TYPES.map((t) => (
            <li key={t.slug}>
              <Card variant="panel" className="p-5">
                <h3 className="font-semibold">{t.headline}</h3>
                <p className="mt-2 text-sm text-sx-text-muted">{t.description}</p>
                <Link href={`/solutions/${t.slug}`} className="mt-4 inline-block text-sm font-semibold text-sx-accent">
                  View solutions →
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
