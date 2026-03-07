import { Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/MarketingLayout";

const painPoints = [
  {
    id: "01",
    title: "ASYNC COMMUNICATION BREAKS CONTEXT",
    description:
      "Hand-off messages bounce between chat, slides, and tickets. loam gives everyone one shared reference: a single link they can open in the right context.",
  },
  {
    id: "02",
    title: "WAITING KILLS MOMENTUM",
    description:
      "Teams lose time when uploads stall. loam keeps playback fast and lightweight, so small teams can move from recording to share in minutes.",
  },
  {
    id: "03",
    title: "FEEDBACK GETS LOST",
    description:
      "Slack threads and email attachments scatter decisions. loam stores comments on the video itself so decisions stay attached to the right moment.",
  },
  {
    id: "04",
    title: "SEAT-LINEAR BILLING KILLS ADOPTION",
    description:
      "Small teams and remote collaborators scale better when pricing is team-wide, not per-user. loam stays flat so every reviewer gets access when needed.",
  },
];

const steps = [
  {
    step: "1",
    action: "Record or upload",
    description:
      "Record a screen walkthrough or upload a local video. Playback is optimized for quick shareability, not post-production workflows.",
  },
  {
    step: "2",
    action: "Share instantly",
    description:
      "Send a private link by default. Add optional public share links only when you need broader distribution.",
  },
  {
    step: "3",
    action: "Close the loop",
    description:
      "Collect replies from teammates and external viewers in one place, then continue work with fewer meetings and better traceability.",
  },
];

export default function ForVideoEditors() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="px-6 py-24 md:py-32 border-b-2 border-[#1a1a1a] bg-[var(--background)]">
        <div className="max-w-5xl mx-auto">
          <div className="text-sm font-bold uppercase tracking-widest text-[#888] mb-6">
            FOR SMALL TEAMS
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.85] mb-8">
            SCREEN RECORDINGS THAT KEEP TEAMS
            <br />
            MOVING ASYNCHRONOUSLY.
          </h1>
          <p className="text-xl md:text-2xl font-medium text-[#888] max-w-3xl mb-12">
            For small teams that ship updates, walkthroughs, bug fixes, and product notes.
            loam is focused on async sharing and simple playback without seat tax
            or workflow bloat.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              to="/sign-up"
              className="bg-[#1a1a1a] text-[#f0f0e8] px-8 py-4 border-2 border-[#1a1a1a] font-black text-lg uppercase tracking-wider hover:bg-[#2d5a2d] transition-colors shadow-[6px_6px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] text-center"
            >
              START 7-DAY TRIAL
            </Link>
            <div className="flex items-center gap-3 px-4">
              <span className="text-2xl font-black">$15/mo</span>
              <span className="text-sm font-bold text-[#888] uppercase tracking-wider">
                Starter workspace, unlimited seats
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="px-6 py-24 md:py-32 border-b-2 border-[#1a1a1a] bg-[#e8e8e0]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-4 text-center">
            THE PAIN IS REAL.
          </h2>
          <p className="text-lg text-[#888] font-medium text-center mb-16 max-w-2xl mx-auto">
            Small teams hit these same bottlenecks. loam removes the friction layer.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {painPoints.map((point) => (
              <div
                key={point.id}
                className="bg-[#f0f0e8] border-2 border-[#1a1a1a] shadow-[8px_8px_0px_0px_var(--shadow-color)] hover:-translate-y-1 hover:translate-x-1 hover:shadow-[6px_6px_0px_0px_var(--shadow-color)] transition-all"
              >
                <div className="border-b-2 border-[#1a1a1a] px-6 py-4 flex justify-between items-center">
                  <span className="text-sm font-black text-[#888]">
                    /{point.id}
                  </span>
                  <span className="text-sm font-bold text-[#2d5a2d] uppercase tracking-wider">
                    SOLVED
                  </span>
                </div>
                <div className="p-6 md:p-8">
                  <h3 className="text-xl md:text-2xl font-black uppercase tracking-tight mb-4 leading-tight">
                    {point.title}
                  </h3>
                  <p className="text-base font-medium text-[#1a1a1a] leading-relaxed">
                    {point.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works for Teams */}
      <section className="px-6 py-24 md:py-32 border-b-2 border-[#1a1a1a] bg-[var(--background)]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-4 text-center">
            HOW IT WORKS.
          </h2>
          <p className="text-lg text-[#888] font-medium text-center mb-16 max-w-2xl mx-auto">
            Three steps. No onboarding calls, no training videos, no "schedule a
            demo" buttons.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((item) => (
              <div
                key={item.step}
                className="bg-[#f0f0e8] border-2 border-[#1a1a1a] shadow-[12px_12px_0px_0px_var(--shadow-color)] flex flex-col hover:-translate-y-2 hover:translate-x-2 hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] transition-all"
              >
                <div className="border-b-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8] p-6 flex justify-between items-end">
                  <span className="text-7xl font-black leading-none">
                    {item.step}
                  </span>
                  <span className="text-xl font-bold tracking-widest text-[#888] mb-1">
                    STEP
                  </span>
                </div>
                <div className="p-8 flex-grow flex flex-col">
                  <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter mb-4 text-[#2d5a2d]">
                    {item.action}
                  </h3>
                  <p className="text-base font-medium text-[#1a1a1a] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Callout */}
      <section className="px-6 py-24 md:py-32 border-b-2 border-[#1a1a1a] bg-[#2d5a2d] text-[#f0f0e8]">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-6xl md:text-8xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85] mb-8">
            $15/MONTH.
            <br />
            <span className="text-[#7cb87c]">NOT PER USER.</span>
            <br />
            TOTAL.
          </h2>
          <p className="text-xl md:text-2xl font-medium max-w-2xl mx-auto mb-4 text-[#f0f0e8]/80">
            Unlimited seats. Private-by-default sharing. Better async workflows.
          </p>
          <p className="text-lg font-bold text-[#7cb87c]">
            Stop paying per-seat tax on collaboration.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-32 bg-[var(--background)]">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <h2 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.85] mb-6">
            START SHARING FASTER.
          </h2>
          <p className="text-xl text-[#888] font-medium mb-12 max-w-xl">
            Start your 7-day trial. A card is required to prevent failed
            subscriptions, then cancel anytime before renewal.
          </p>
          <Link
            to="/sign-up"
            className="bg-[#1a1a1a] text-[#f0f0e8] px-12 py-6 border-2 border-[#1a1a1a] text-2xl font-black uppercase tracking-wider hover:bg-[#2d5a2d] hover:border-[#2d5a2d] transition-colors shadow-[12px_12px_0px_0px_var(--shadow-accent)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[8px_8px_0px_0px_var(--shadow-accent)]"
          >
            START 7-DAY TRIAL
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
