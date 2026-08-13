/** Breathing room after the hero — one idea, before any product is named. */
export function HomeOpeningStatement() {
  return (
    <section data-home-section="opening-statement" className="bg-[#f7f8fc]">
      <div className="mx-auto max-w-3xl px-4 py-[clamp(4rem,10vw,7.5rem)] text-center sm:px-6">
        <h2 className="font-sx-sans text-[clamp(1.6rem,3.4vw+0.4rem,2.75rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-sx-text">
          One connected place for your business.
        </h2>
        <p className="mx-auto mt-5 max-w-xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[17px]">
          Your customers find you, message you, and decide about you across Google, social, WhatsApp, and your website.
          Stratxcel keeps all of it in one workspace, so nothing is missed and you can see what is actually happening.
        </p>
      </div>
    </section>
  );
}
