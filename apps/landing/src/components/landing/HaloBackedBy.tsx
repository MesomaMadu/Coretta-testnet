"use client";

const BACKERS = [
  "Fundamental Labs",
  "KUCOIN",
  "NGC",
  "NxGen",
  "Matter Labs",
  "DEXTools",
  "NGRAVE",
  "Polychain",
] as const;

/** Static partner list (no marquee / slide animation). */
export default function HaloBackedBy() {
  return (
    <section id="ecosystem" className="bg-[#F5F5F5] px-6 py-16">
      <div className="mx-auto grid max-w-[88rem] grid-cols-1 items-start gap-8 md:grid-cols-4">
        <p className="text-base leading-relaxed text-black/70 md:col-span-1">
          Built on premier infrastructure
          <br />
          and forward-thinking partners.
        </p>
        <ul className="flex flex-wrap items-center gap-x-8 gap-y-4 md:col-span-3">
          {BACKERS.map((name) => (
            <li
              key={name}
              className="text-sm font-semibold tracking-wide text-black/50"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
