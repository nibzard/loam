import { Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/MarketingLayout";

const LOOM_PRICE_PER_USER = 18;
const LOAM_STARTER_PRICE = 15;

const comparisonRows = [
  {
    feature: "Price",
    loom: "$18/user/month",
    loam: "From $15/workspace/month",
    note: "Still flat team pricing. Just no longer fantasy-priced.",
  },
  {
    feature: "Seats",
    loom: "Per user",
    loam: "Unlimited",
    note: "Adding teammates should not trigger procurement.",
  },
  {
    feature: "Scope",
    loom: "Video messaging + meetings + AI",
    loam: "Screen recordings and async feedback",
    note: "We stay narrower on purpose.",
  },
  {
    feature: "Complexity",
    loom: "Broad workplace suite",
    loam: "Focused sharing workflow",
    note: "Less surface area. Fewer places to get lost.",
  },
  {
    feature: "Open source",
    loom: "No",
    loam: "Yes",
    note: "Fork it, audit it, keep it.",
  },
  {
    feature: "Playback",
    loom: "Polished, heavier stack",
    loam: "Fast share-first viewer",
    note: "We care a lot about time-to-watch.",
  },
];

const teamSizes = [3, 5, 10, 20];

function annualSavings(teamSize: number) {
  return (LOOM_PRICE_PER_USER * teamSize - LOAM_STARTER_PRICE) * 12;
}

const savingsCommentary: Record<number, string> = {
  3: "Enough to stop calling it a rounding error.",
  5: "A decent team dinner every month.",
  10: "Budget you can spend on actual work.",
  20: "The spreadsheet starts looking personal.",
};

export default function CompareLoom() {
  return (
    <MarketingLayout>
      <section className="px-6 pt-20 pb-24 md:pt-28 md:pb-32 border-b-2 border-[var(--border)] bg-[var(--background)]">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-[14vw] sm:text-[10vw] md:text-[8vw] font-black leading-[0.85] tracking-tighter uppercase">
            loam vs
            <br />
            Loom
          </h1>
          <div className="mt-10 md:mt-14 max-w-2xl">
            <p className="text-2xl md:text-3xl font-black uppercase tracking-tight leading-tight">
              Loom is great.
              <br />
              We just want less of it.
              <br />
              <span className="text-[var(--foreground-muted)]">
                That is the strategy.
              </span>
            </p>
            <p className="mt-6 text-lg text-[var(--foreground-muted)] font-medium max-w-lg">
              Loom is a broad video messaging platform for work. loam is a
              narrower tool for screen recordings, walkthroughs, bug reports,
              and async feedback. Less platform. Less seat math. Faster path
              from record to watch.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--surface-alt)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-16 text-center">
            SIDE BY
            <br />
            SIDE.
          </h2>

          <div className="border-2 border-[var(--border)] shadow-[8px_8px_0px_0px_var(--shadow-color)] bg-[var(--background)]">
            <div className="grid grid-cols-3 border-b-2 border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground-inverse)]">
              <div className="p-4 md:p-6 font-black uppercase tracking-wider text-sm">
                Feature
              </div>
              <div className="p-4 md:p-6 font-black uppercase tracking-wider text-sm border-l-2 border-[var(--border)]">
                Loom
              </div>
              <div className="p-4 md:p-6 font-black uppercase tracking-wider text-sm border-l-2 border-[var(--border)] text-[var(--accent-light)]">
                loam
              </div>
            </div>

            {comparisonRows.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 ${i < comparisonRows.length - 1 ? "border-b-2 border-[var(--border)]" : ""}`}
              >
                <div className="p-4 md:p-6 flex flex-col justify-center">
                  <span className="font-black uppercase tracking-tight text-lg">
                    {row.feature}
                  </span>
                  <span className="text-xs text-[var(--foreground-muted)] mt-1 hidden md:block">
                    {row.note}
                  </span>
                </div>
                <div className="p-4 md:p-6 border-l-2 border-[var(--border)] flex items-center text-[var(--foreground-muted)] font-medium">
                  {row.loom}
                </div>
                <div className="p-4 md:p-6 border-l-2 border-[var(--border)] flex items-center font-bold text-[var(--accent)]">
                  {row.loam}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-[var(--foreground-muted)] mt-6 md:hidden">
            * Loom pricing based on Loom Business at $18/user/month.
          </p>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--background)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4 text-center">
            DO THE
            <br />
            MATH.
          </h2>
          <p className="text-center text-lg text-[var(--foreground-muted)] font-medium mb-16 max-w-lg mx-auto">
            Loom Business starts at $18 per user per month. loam Starter starts
            at $15 per workspace per month. If everyone on the team needs
            access, flat pricing still compounds in your favor.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {teamSizes.map((size) => {
              const savings = annualSavings(size);
              const loomAnnual = LOOM_PRICE_PER_USER * size * 12;
              const loamAnnual = LOAM_STARTER_PRICE * 12;

              return (
                <div
                  key={size}
                  className="border-2 border-[var(--border)] bg-[var(--background)] shadow-[6px_6px_0px_0px_var(--shadow-color)] hover:-translate-y-1 hover:translate-x-1 hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] transition-all flex flex-col"
                >
                  <div className="border-b-2 border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground-inverse)] p-5">
                    <span className="text-4xl font-black">{size}</span>
                    <span className="text-sm font-bold uppercase tracking-wider text-[var(--foreground-muted)] ml-2">
                      {size === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <div className="p-5 flex flex-col flex-grow">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
                        Loom
                      </span>
                      <span className="font-black text-[var(--foreground-muted)] line-through">
                        ${loomAnnual.toLocaleString()}/yr
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline mb-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                        loam
                      </span>
                      <span className="font-black text-[var(--accent)]">
                        ${loamAnnual}/yr
                      </span>
                    </div>
                    <div className="border-t-2 border-[var(--border-subtle)] pt-4 mt-auto">
                      <div className="text-3xl font-black text-[var(--accent)]">
                        ${savings.toLocaleString()}
                      </div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
                        saved per year
                      </div>
                      <p className="text-sm text-[var(--foreground-muted)] mt-2 italic">
                        {savingsCommentary[size]}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--surface-alt)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4 text-center">
            HONEST
            <br />
            ADVICE.
          </h2>
          <p className="text-center text-lg text-[var(--foreground-muted)] font-medium mb-16 max-w-lg mx-auto">
            Loom is good software. If you want the bigger platform, use the
            bigger platform. Here is where we actually differ.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border-2 border-[var(--border)] bg-[var(--background)] shadow-[8px_8px_0px_0px_var(--shadow-color)]">
              <div className="border-b-2 border-[var(--border)] p-6">
                <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">
                  Use Loom if...
                </h3>
              </div>
              <div className="p-6">
                <ul className="space-y-5">
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You want a broad workplace video platform with meeting
                      capture, AI summaries, transcripts, and admin layers
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You are standardizing video across a larger company and
                      per-seat pricing is not the deciding factor
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You want one vendor for recorded updates, meeting capture,
                      and a lot of workplace workflow around them
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      More product breadth matters more to you than having a
                      narrower, faster path to sharing a recording
                    </span>
                  </li>
                </ul>
                <p className="text-sm text-[var(--foreground-muted)] mt-6 pt-4 border-t-2 border-[var(--border-subtle)]">
                  Genuinely: Loom is strong software. We are not trying to win
                  by becoming a smaller purple Loom clone.
                </p>
              </div>
            </div>

            <div className="border-2 border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground-inverse)] shadow-[8px_8px_0px_0px_var(--shadow-accent)]">
              <div className="border-b-2 border-[var(--border)] p-6">
                <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-[var(--accent-light)]">
                  Use loam if...
                </h3>
              </div>
              <div className="p-6">
                <ul className="space-y-5">
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--accent-light)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You mostly share screen recordings, product walkthroughs,
                      bug reports, and async feedback videos
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--accent-light)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You want one flat bill no matter how many teammates,
                      contractors, or clients need access
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--accent-light)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You want an open source codebase that you can inspect,
                      fork, and keep under your control
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--accent-light)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You care a lot about a fast watch page and very little
                      about a giant workplace suite
                    </span>
                  </li>
                </ul>
                <p className="text-sm text-[var(--foreground-muted)] mt-6 pt-4 border-t border-[var(--border-subtle)]">
                  loam is deliberately narrower than Loom. That is a feature,
                  not a missing roadmap.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-32 bg-[var(--background)]">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <h2 className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-[0.8] mb-4">
            START
            <br />
            NOW.
          </h2>
          <p className="text-xl md:text-2xl text-[var(--foreground-muted)] font-medium mb-12 max-w-md">
            Starter is $15/month for the whole workspace. Pro is $49 if you
            need more storage and more guest headroom.
          </p>
          <Link
            to="/sign-up"
            className="bg-[var(--surface-strong)] text-[var(--foreground-inverse)] px-12 py-6 border-2 border-[var(--border)] text-2xl font-black uppercase tracking-wider hover:bg-[var(--accent)] hover:border-[var(--accent)] transition-colors shadow-[12px_12px_0px_0px_var(--shadow-accent)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[8px_8px_0px_0px_var(--shadow-accent)]"
          >
            TRY LOAM FREE
          </Link>
          <p className="text-sm text-[var(--foreground-muted)] mt-6">
            Or keep paying $18/user/month.
            <br />
            We are not your finance department.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
