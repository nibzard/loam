import { Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/MarketingLayout";

const plans = [
  {
    name: "Starter",
    price: "$15",
    priceNote: "/mo",
    eyebrow: "Small teams",
    summary: "Flat team pricing for async video without seat math.",
    features: [
      "Unlimited seats",
      "100GB storage",
      "5,000 shared-link watch minutes / month",
      "4,000 team watch minutes / month",
      "Private by default sharing",
    ],
    cta: "Start Starter",
    featured: false,
  },
  {
    name: "Pro",
    price: "$49",
    priceNote: "/mo",
    eyebrow: "Bigger libraries",
    summary: "More storage and more guest headroom for heavier sharing.",
    features: [
      "Unlimited seats",
      "500GB storage",
      "15,000 shared-link watch minutes / month",
      "10,000 team watch minutes / month",
      "Private by default sharing",
    ],
    cta: "Start Pro",
    featured: true,
  },
] as const;

const guardrails = [
  {
    title: "Private First",
    body: "Every video starts private. External sharing is explicit, which keeps accidental public delivery from turning into your bill.",
  },
  {
    title: "No Per-Video Caps",
    body: "Limits are set at the workspace level. We don't cap views per video, which keeps the model simple.",
  },
  {
    title: "Workspace Watch Budgets",
    body: "Each plan has separate monthly caps for external shared-link watch minutes and internal team watch minutes.",
  },
] as const;

const faqItems = [
  {
    q: "What counts as a seat?",
    a: "Anyone on your team. Both plans keep seats unlimited. The pricing guardrails are about delivery usage, not headcount.",
  },
  {
    q: "What is a watch minute?",
    a: "A watch minute is one full minute of playback time. If a video is partly watched, only the time actually watched is counted.",
  },
  {
    q: "What counts as a team watch minute?",
    a: "All logged-in member and invited-viewer playback counts toward the team watch minute budget. That is the cost-control side for internal usage.",
  },
  {
    q: "What happens if I hit a cap?",
    a: "You can upgrade to Pro, move older videos behind a share and re-upload the most critical content, or wait for the monthly reset.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. New teams receive a 7-day free trial. A valid card is required to start it.",
  },
  {
    q: "Is loam open source?",
    a: "Yes. The hosted product is open source, and the repo stays available if you want to inspect or fork it.",
  },
] as const;

export default function PricingPage() {
  return (
    <MarketingLayout>
      <section className="px-6 pt-24 pb-16 md:pt-32 md:pb-24 bg-[var(--background)] border-b-2 border-[var(--border)]">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-[0.85]">
            PRICING.
          </h1>
          <p className="text-2xl md:text-3xl font-bold mt-8 max-w-3xl">
            Flat team plans. No seat tax.
            <span className="text-[var(--foreground-muted)]"> Private by default, with clear storage and playback guardrails.</span>
          </p>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 bg-[var(--surface-alt)] border-b-2 border-[var(--border)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={
                  plan.featured
                    ? "bg-[var(--foreground)] text-[var(--foreground-inverse)] border-2 border-[var(--border)] shadow-[8px_8px_0px_0px_var(--shadow-color)] p-8 flex flex-col transform md:-translate-y-4 hover:-translate-y-6 hover:translate-x-2 hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] transition-all"
                    : "bg-[var(--background)] border-2 border-[var(--border)] shadow-[8px_8px_0px_0px_var(--shadow-color)] p-8 flex flex-col hover:-translate-y-2 hover:translate-x-2 hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] transition-all"
                }
              >
                <div className="flex justify-between items-start mb-3 gap-4">
                  <div>
                    <div
                      className={
                        plan.featured
                          ? "text-xl font-bold uppercase tracking-widest text-[var(--accent-light)]"
                          : "text-xl font-bold uppercase tracking-widest text-[var(--foreground-muted)]"
                      }
                    >
                      {plan.name}
                    </div>
                    <div
                      className={
                        plan.featured
                          ? "text-xs font-black uppercase tracking-wider text-[var(--foreground-muted)] mt-1"
                          : "text-xs font-black uppercase tracking-wider text-[var(--foreground-muted)] mt-1"
                      }
                    >
                      {plan.eyebrow}
                    </div>
                  </div>
                  {plan.featured && (
                    <div className="bg-[var(--accent)] text-xs font-black px-2 py-1 uppercase tracking-wider -rotate-3">
                      More headroom
                    </div>
                  )}
                </div>
                <div className="text-6xl font-black tracking-tighter mb-4">
                  {plan.price}
                  <span className="text-2xl text-[var(--foreground-muted)]">{plan.priceNote}</span>
                </div>
                <p className="text-lg font-medium mb-8">{plan.summary}</p>

                <ul className="space-y-4 text-lg font-bold flex-grow mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <span className={plan.featured ? "text-[var(--accent-light)] text-2xl" : "text-[var(--accent)] text-2xl"}>
                        &#10003;
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/sign-up"
                  className={
                    plan.featured
                      ? "bg-[var(--background)] text-[var(--foreground)] text-center py-4 border-2 border-[var(--border)] font-black uppercase hover:bg-[var(--surface-muted)] transition-colors"
                      : "bg-[var(--foreground)] text-[var(--foreground-inverse)] text-center py-4 border-2 border-[var(--border)] font-black uppercase hover:bg-[var(--accent)] transition-colors"
                  }
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 bg-[var(--background)] border-b-2 border-[var(--border)]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-16">
            HOW THE
            <br />
            LIMITS WORK.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {guardrails.map((item) => (
              <div
                key={item.title}
                className="border-2 border-[var(--border)] bg-[var(--surface-alt)] shadow-[8px_8px_0px_0px_var(--shadow-color)] p-6"
              >
                <h3 className="text-2xl font-black uppercase tracking-tight mb-4">
                  {item.title}
                </h3>
                <p className="text-lg font-medium text-[var(--foreground)]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 bg-[var(--background)] border-b-2 border-[var(--border)]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-16">
            FAQ.
          </h2>

          <div className="divide-y-2 divide-[var(--border)] border-y-2 border-[var(--border)]">
            {faqItems.map((item) => (
              <div key={item.q} className="py-8">
                <h3 className="text-xl md:text-2xl font-black uppercase tracking-tight mb-3">
                  {item.q}
                </h3>
                <p className="text-lg font-medium text-[var(--foreground-muted)]">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-32 bg-[var(--foreground)] text-[var(--foreground-inverse)]">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4">
            PICK THE PLAN.
          </h2>
          <p className="text-xl text-[var(--foreground-muted)] font-medium mb-12 max-w-xl">
            Starter is built for most teams. Pro is there when your library and guest sharing grow up.
          </p>
          <Link
            to="/sign-up"
            className="bg-[var(--background)] text-[var(--foreground)] px-12 py-6 border-2 border-[var(--border)] text-2xl font-black uppercase tracking-wider hover:bg-[var(--accent)] hover:text-[var(--foreground-inverse)] hover:border-[var(--accent)] transition-colors shadow-[8px_8px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_0px_var(--shadow-accent)]"
          >
            START 7-DAY TRIAL
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
