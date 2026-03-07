import { Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/MarketingLayout";

const TELLA_PRICE_PER_USER = 13;
const LOAM_STARTER_PRICE = 15;

const comparisonRows = [
  {
    feature: "Price",
    tella: "$13/user/month",
    loam: "From $15/workspace/month",
    note: "Tella is per user. loam stays flat for the whole team.",
  },
  {
    feature: "Style",
    tella: "Polished demos and tutorials",
    loam: "Fast team updates and feedback",
    note: "Different sports, honestly.",
  },
  {
    feature: "Editing",
    tella: "Built-in presentation tooling",
    loam: "Upload, share, reply",
    note: "Less production workflow, more send-the-link.",
  },
  {
    feature: "Seats",
    tella: "Per user",
    loam: "Unlimited",
    note: "Your whole team can watch without seat math.",
  },
  {
    feature: "Open source",
    tella: "No",
    loam: "Yes",
    note: "You can inspect and fork loam.",
  },
  {
    feature: "Speed to send",
    tella: "More polish before publish",
    loam: "Record, upload, ship",
    note: "Useful when the update matters more than the edit.",
  },
];

const teamSizes = [3, 5, 10, 20];

function annualSavings(teamSize: number) {
  return (TELLA_PRICE_PER_USER * teamSize - LOAM_STARTER_PRICE) * 12;
}

const savingsCommentary: Record<number, string> = {
  3: "Enough to make quick videos feel quick again.",
  5: "A small tool budget back in your pocket.",
  10: "Real money for a team that records a lot.",
  20: "Way too much to spend on basic async updates.",
};

export default function CompareTella() {
  return (
    <MarketingLayout>
      <section className="px-6 pt-20 pb-24 md:pt-28 md:pb-32 border-b-2 border-[var(--border)] bg-[var(--background)]">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-[14vw] sm:text-[10vw] md:text-[8vw] font-black leading-[0.85] tracking-tighter uppercase">
            loam vs
            <br />
            Tella.tv
          </h1>
          <div className="mt-10 md:mt-14 max-w-2xl">
            <p className="text-2xl md:text-3xl font-black uppercase tracking-tight leading-tight">
              Tella makes prettier videos.
              <br />
              We make quicker sharing.
              <br />
              <span className="text-[var(--foreground-muted)]">
                Different sport.
              </span>
            </p>
            <p className="mt-6 text-lg text-[var(--foreground-muted)] font-medium max-w-lg">
              Tella is great for polished demos, tutorials, and course-style
              content. loam is for the screen recording that needs to get from
              one person to the rest of the team before the moment passes.
              Fewer editing steps. Faster async communication.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--surface-alt)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-16 text-center">
            HEAD TO
            <br />
            HEAD.
          </h2>

          <div className="border-2 border-[var(--border)] shadow-[8px_8px_0px_0px_var(--shadow-color)] bg-[var(--background)]">
            <div className="grid grid-cols-3 border-b-2 border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground-inverse)]">
              <div className="p-4 md:p-6 font-black uppercase tracking-wider text-sm">
                Feature
              </div>
              <div className="p-4 md:p-6 font-black uppercase tracking-wider text-sm border-l-2 border-[var(--border)]">
                Tella.tv
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
                  {row.tella}
                </div>
                <div className="p-4 md:p-6 border-l-2 border-[var(--border)] flex items-center font-bold text-[var(--accent)]">
                  {row.loam}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-[var(--foreground-muted)] mt-6 md:hidden">
            * Tella pricing based on Tella Pro at $13/user/month billed yearly.
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
            Tella Pro starts at $13 per user per month when billed yearly. loam
            Starter starts at $15 per workspace per month. If multiple people on
            the team need to record and share updates, flat pricing changes the
            math quickly.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {teamSizes.map((size) => {
              const savings = annualSavings(size);
              const tellaAnnual = TELLA_PRICE_PER_USER * size * 12;
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
                        Tella.tv
                      </span>
                      <span className="font-black text-[var(--foreground-muted)] line-through">
                        ${tellaAnnual.toLocaleString()}/yr
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
            Tella is good when the video itself is the product. loam is better
            when the point is getting the update to the team quickly.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border-2 border-[var(--border)] bg-[var(--background)] shadow-[8px_8px_0px_0px_var(--shadow-color)]">
              <div className="border-b-2 border-[var(--border)] p-6">
                <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">
                  Use Tella.tv if...
                </h3>
              </div>
              <div className="p-6">
                <ul className="space-y-5">
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You are making polished product demos, tutorials, or
                      course-style videos where presentation quality matters a
                      lot
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You want built-in editing, presenter layouts, and a
                      workflow that spends more time shaping the final video
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      Only a few people on the team are creators, so per-user
                      pricing is not much of a problem
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You are optimizing for a polished output, not the fastest
                      possible path from recording to link sharing
                    </span>
                  </li>
                </ul>
                <p className="text-sm text-[var(--foreground-muted)] mt-6 pt-4 border-t-2 border-[var(--border-subtle)]">
                  Tella is strong if you want a lightweight recording studio.
                  That is just not the same job we are doing.
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
                      Your team records quick walkthroughs, bug reports, product
                      updates, and video feedback that should ship in minutes
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--accent-light)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You want one flat monthly price instead of counting how
                      many people need a recording seat
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--accent-light)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You care more about upload, share, watch, reply than about
                      built-in editing polish
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--accent-light)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You want an open source tool that stays simple and easy to
                      adapt to your own workflow
                    </span>
                  </li>
                </ul>
                <p className="text-sm text-[var(--foreground-muted)] mt-6 pt-4 border-t border-[var(--border-subtle)]">
                  loam is intentionally less like a mini production studio and
                  more like async team communication that happens to be video.
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
            START 7-DAY TRIAL
          </Link>
          <p className="text-sm text-[var(--foreground-muted)] mt-6">
            If you need a tiny production studio, use Tella.
            <br />
            If you need async team video, use loam.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
