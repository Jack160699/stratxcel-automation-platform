import Link from "next/link";

/**
 * Trust in ordinary language. Technical vocabulary (tenant isolation, RLS,
 * scoped grants) lives on /security — never as an unsupported certification
 * claim.
 */
const TRUST_POINTS = [
  {
    title: "Your business data stays yours",
    body: "Each business gets its own workspace. Your data is not mixed with anyone else's, and you stay the owner of it.",
  },
  {
    title: "You decide what we can reach",
    body: "You connect the accounts you want, with the permissions you choose, and you can disconnect any of them whenever you like.",
  },
  {
    title: "Important actions wait for you",
    body: "Publishing, outreach, and spend changes can be set to pause until you have approved them.",
  },
  {
    title: "You can see what happened",
    body: "Activity in your workspace produces a record you can go back and read.",
  },
  {
    title: "Payments run through Razorpay",
    body: "Card and UPI details are handled by Razorpay. We do not store them.",
  },
  {
    title: "You can ask us to delete it",
    body: "Deletion requests go through a documented process, not an email into the void.",
  },
];

export function HomeTrust() {
  return (
    <section data-home-section="trust" id="trust" className="border-t border-sx-border bg-[#faf9f7]">
      <div className="mx-auto max-w-6xl px-4 py-[clamp(3.5rem,8vw,6rem)] sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="font-sx-sans text-[clamp(1.5rem,3vw+0.4rem,2.4rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-sx-text">
            Your business.
            <br />
            Your data.
            <br />
            Your control.
          </h2>
          <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[16px]">
            You are handing over the accounts your business runs on. Here is exactly what that means.
          </p>
        </div>

        <ul className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST_POINTS.map((point) => (
            <li key={point.title} className="border-t border-sx-border pt-4">
              <p className="font-sx-sans text-[15.5px] font-semibold leading-snug text-sx-text">{point.title}</p>
              <p className="mt-2 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">{point.body}</p>
            </li>
          ))}
        </ul>

        <Link
          href="/security"
          className="mt-9 inline-flex items-center gap-1.5 font-sx-sans text-[14.5px] font-semibold text-sx-accent hover:underline"
        >
          Read the security overview <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
