import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { MarketingFooter } from "@/components/MarketingFooter";

export default function Homepage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className="min-h-screen font-sans bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--accent)] selection:text-[var(--foreground-inverse)]"
    >
      {/* Minimal nav */}
      <nav className={`fixed w-full top-0 z-50 px-6 py-4 flex justify-between items-center transition-all duration-200 ${scrolled ? "bg-[var(--background)] border-b-2 border-[var(--border)] text-[var(--foreground)]" : "bg-[var(--background)] border-b-2 border-[var(--border)] text-[var(--foreground-inverse)]"}`}>
        <div className="flex items-center gap-4">
          <span className={`font-brand text-xl font-bold tracking-tighter transition-opacity duration-200 ${scrolled ? "opacity-100" : "opacity-0"}`}>loam.</span>
        </div>
        <div className="flex gap-6 items-center text-sm font-bold uppercase tracking-wide">
          <a href="#pricing" className="hover:text-[var(--accent)] underline-offset-4">Pricing</a>
          <Link to="/compare/loom" className="hover:text-[var(--accent)] underline-offset-4 hidden sm:block">Compare</Link>
          <Link to="/sign-in" className="hover:text-[var(--accent)] underline-offset-4">Log in</Link>
          <Link
            to="/sign-up"
            className={`px-4 py-2 border-2 border-[var(--border)] transition-colors hover:bg-[var(--foreground)] hover:text-[var(--background)]`}
          >
            Start
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section 
        className="relative px-6 pt-32 pb-32 md:pb-24 min-h-[85vh] flex flex-col justify-end bg-cover bg-center bg-no-repeat text-[var(--foreground-inverse)] border-b-2 border-[var(--border)] overflow-x-clip"
        style={{ backgroundImage: `url('/loam.jpg')` }}
      >
        {/* Lighter tint since text is now in highly contrasting blocks or heavily shadowed */}
        <div className="absolute inset-0 bg-[var(--media-overlay-subtle)] pointer-events-none" />

        <div className="relative z-10 w-full max-w-7xl mx-auto">
          {/* Massive Title with Brutalist Depth */}
          <h1 
            className="font-brand-display ml-[-0.7vw] text-[27vw] leading-[0.8] tracking-[-0.1em] sm:text-[23vw]"
            style={{ 
              WebkitTextStroke: "2px var(--border)",
              textShadow: "6px 6px 0 var(--accent), 12px 12px 0 var(--shadow-color), 0 20px 40px var(--media-shadow)",
            }}
          >
            loam
          </h1>

          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-12 mt-20 md:mt-24">
            
            {/* Highly Creative Contrast Subheadline Blocks (Stickers) */}
            <div className="flex flex-col items-start gap-4 md:gap-6 max-w-full">
              <div className="bg-[var(--background)] text-[var(--foreground)] px-5 py-3 md:px-8 md:py-4 border-2 border-[var(--border)] shadow-[6px_6px_0px_0px_var(--shadow-color)] md:shadow-[8px_8px_0px_0px_var(--shadow-color)] -rotate-2 origin-bottom-left max-w-full">
                <p className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight uppercase leading-tight md:leading-none">Async video sharing for teams.</p>
              </div>
              <div className="bg-[var(--accent)] text-[var(--foreground-inverse)] px-5 py-3 md:px-8 md:py-4 border-2 border-[var(--border)] shadow-[6px_6px_0px_0px_var(--shadow-color)] md:shadow-[8px_8px_0px_0px_var(--shadow-color)] rotate-1 origin-top-left ml-2 md:ml-8 max-w-full">
                <p className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight uppercase leading-tight md:leading-none">Screen recordings, updates, feedback.</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 lg:justify-end pb-2 mt-4 lg:mt-0">
              <div className="bg-[var(--background)] text-[var(--foreground)] px-6 py-4 md:px-8 md:py-5 border-2 border-[var(--border)] shadow-[6px_6px_0px_0px_var(--shadow-color)] md:shadow-[8px_8px_0px_0px_var(--shadow-color)] self-start sm:self-auto">
                <span className="text-3xl md:text-4xl font-black block leading-none">From $15/mo</span>
                <span className="block text-xs md:text-sm font-bold uppercase tracking-wider text-[var(--foreground-muted)] mt-1 md:mt-2">Flat team pricing</span>
              </div>
              <Link to="/sign-up"
                className="bg-[var(--foreground)] text-[var(--background)] px-6 py-4 md:px-8 md:py-5 border-2 border-[var(--border)] font-black text-lg md:text-xl hover:bg-[var(--accent)] hover:text-[var(--background)] transition-colors flex items-center justify-center shadow-[6px_6px_0px_0px_var(--shadow-color)] md:shadow-[8px_8px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] md:hover:shadow-[6px_6px_0px_0px_var(--shadow-color)] self-start sm:self-auto"
              >
                START 7-DAY TRIAL →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Brutalist Value Props Bar */}
      <section className="border-b-2 border-[var(--border)] bg-[var(--background)]">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y-2 md:divide-y-0 md:divide-x-2 divide-[var(--border)]">
          {[
            { id: "01", title: "OPEN SOURCE", desc: "Fully open source. Read the code, fork it, make it yours." },
            { id: "02", title: "FAST PLAYBACK", desc: "Share videos that open fast and start playing without drama." },
            { id: "03", title: "ASYNC FIRST", desc: "Walkthroughs, bug reports, and feedback built for teams in different time zones." },
            { id: "04", title: "PRIVATE BY DEFAULT", desc: "Videos start private. Optional share links count to workspace watch budgets." },
          ].map((item, i) => (
            <div key={i} className="p-8 lg:p-12 group hover:bg-[var(--surface-strong)] hover:text-[var(--foreground-inverse)] transition-colors flex flex-col">
              <div className="text-sm font-black text-[var(--foreground-muted)] group-hover:text-[var(--accent-light)] mb-8">/{item.id}</div>
              <h3 className="text-3xl lg:text-4xl font-black mb-4 uppercase tracking-tighter leading-none">{item.title}</h3>
              <p className="text-lg font-medium opacity-80 mt-auto">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works - Completely Rethought */}
      <section className="border-b-2 border-[var(--border)] bg-[var(--surface-alt)] px-6 py-24 md:py-32">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-16 text-center">
            HOW IT WORKS.
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {[
              { step: "1", action: "UPLOAD", desc: "Drop in a screen recording, demo, or walkthrough." },
              { step: "2", action: "SHARE", desc: "Send a link to your team, customer, or client." },
              { step: "3", action: "RESPOND", desc: "They watch when ready and reply with comments in context." },
            ].map((item, i) => (
              <div key={i} className="bg-[var(--background)] border-2 border-[var(--border)] shadow-[12px_12px_0px_0px_var(--shadow-color)] flex flex-col hover:-translate-y-2 hover:translate-x-2 hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] transition-all">
                <div className="border-b-2 border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground-inverse)] p-6 flex justify-between items-end">
                  <span className="text-7xl font-black leading-none">{item.step}</span>
                  <span className="text-xl font-bold tracking-widest text-[var(--foreground-muted)] mb-1">STEP</span>
                </div>
                <div className="p-8 flex-grow flex flex-col">
                  <h3 className="text-3xl md:text-4xl font-black uppercase tracking-tighter mb-4 text-[var(--accent)]">{item.action}</h3>
                  <p className="text-lg font-medium text-[var(--foreground)]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--background)]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-16">
            <div className="lg:w-1/3">
              <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-6">
                THE<br/>RIVAL.
              </h2>
              <p className="text-xl text-[var(--foreground-muted)] font-medium max-w-sm">
                Loom is great software. But async updates and screen recordings do not need a whole workplace suite.
              </p>
            </div>

            <div className="lg:w-2/3">
              <div className="grid grid-cols-1 md:grid-cols-2 border-2 border-[var(--border)] shadow-[12px_12px_0px_0px_var(--shadow-color)]">
                {/* Competitor */}
                <div className="p-8 md:p-12 border-b-2 md:border-b-0 md:border-r-2 border-[var(--border)] bg-[var(--surface)]">
                  <div className="text-sm font-bold tracking-widest text-[var(--foreground-muted)] mb-2">THE OTHER GUYS</div>
                  <div className="text-5xl font-black tracking-tighter mb-8">Loom</div>
                  
                  <div className="mb-8">
                    <div className="text-3xl font-black">$18</div>
                    <div className="text-[var(--foreground-muted)] font-bold uppercase text-sm tracking-wider">Per user / month</div>
                  </div>

                  <ul className="space-y-4 text-lg font-medium text-[var(--foreground)]">
                    <li className="flex items-start gap-3">
                      <span className="text-[var(--destructive)] font-black">×</span>
                      Bigger platform surface
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-[var(--destructive)] font-black">×</span>
                      Per-seat pricing
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-[var(--destructive)] font-black">×</span>
                      More meetings + AI product weight
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-[var(--destructive)] font-black">×</span>
                      Closed source
                    </li>
                  </ul>
                </div>

                {/* Us */}
                <div className="p-8 md:p-12 bg-[var(--surface-strong)] text-[var(--foreground-inverse)]">
                  <div className="text-sm font-bold tracking-widest text-[var(--accent-light)] mb-2">THE SOLUTION</div>
                  <div className="text-5xl font-black tracking-tighter mb-8 text-[var(--accent-light)]">loam</div>
                  
                  <div className="mb-8">
                    <div className="text-3xl font-black text-[var(--accent-light)]">Flat $15/mo</div>
                    <div className="text-[var(--foreground-muted)] font-bold uppercase text-sm tracking-wider">Workspace / month</div>
                  </div>

                  <ul className="space-y-4 text-lg font-medium">
                    <li className="flex items-start gap-3">
                      <span className="text-[var(--accent-light)] font-black">✓</span>
                      Focused async sharing
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-[var(--accent-light)] font-black">✓</span>
                      Unlimited seats
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-[var(--accent-light)] font-black">✓</span>
                      Simple link workflow
                    </li>
                  </ul>
                  
                  <div className="mt-12 pt-6 border-t border-[var(--border-subtle)]">
                    <span className="block text-sm font-bold text-[var(--foreground-muted)] uppercase tracking-wider mb-1">Yearly savings (5 users)</span>
                    <span className="text-4xl font-black text-[var(--accent-light)] line-through">$900</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quote */}
      <section className="px-6 py-32 bg-[var(--accent)] text-[var(--foreground-inverse)] border-b-2 border-[var(--border)]">
        <div className="max-w-5xl mx-auto text-center">
          <blockquote className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-tight mb-8">
            "Record it once. Share the link. Let the team watch on their own time."
          </blockquote>
          <div className="inline-block border-2 border-[var(--border)] px-6 py-3 font-bold uppercase tracking-wider">
            Built for async teams
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--surface-alt)]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-16 text-center">
            PRICING.
          </h2>
          
          <div className="flex flex-col md:flex-row gap-8 justify-center items-center">
            <div className="bg-[var(--background)] border-2 border-[var(--border)] shadow-[8px_8px_0px_0px_var(--shadow-color)] p-8 w-full max-w-md flex flex-col hover:-translate-y-2 hover:translate-x-2 hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] transition-all">
              <div className="text-xl font-bold uppercase tracking-widest text-[var(--foreground-muted)] mb-2">Starter</div>
              <div className="text-6xl font-black tracking-tighter mb-4">$15<span className="text-2xl text-[var(--foreground-muted)]">/mo</span></div>
              <p className="text-lg font-medium text-[var(--foreground)] mb-8">Flat team pricing for async video without seat math.</p>
              
              <ul className="space-y-4 text-lg font-bold flex-grow mb-8">
                <li className="flex items-center gap-3"><span className="text-[var(--accent)] text-2xl">✓</span> Unlimited seats</li>
                <li className="flex items-center gap-3"><span className="text-[var(--accent)] text-2xl">✓</span> 100GB Storage</li>
                <li className="flex items-center gap-3"><span className="text-[var(--accent)] text-2xl">✓</span> 5,000 shared-link watch minutes / month</li>
                <li className="flex items-center gap-3"><span className="text-[var(--accent)] text-2xl">✓</span> 4,000 member watch minutes / month</li>
              </ul>
              
              <Link to="/sign-up" className="bg-[var(--surface-strong)] text-[var(--foreground-inverse)] text-center py-4 border-2 border-[var(--border)] font-black uppercase hover:bg-[var(--accent)] transition-colors">Start Starter</Link>
            </div>

            <div className="bg-[var(--surface-strong)] text-[var(--foreground-inverse)] border-2 border-[var(--border)] shadow-[8px_8px_0px_0px_var(--shadow-color)] p-8 w-full max-w-md flex flex-col transform md:-translate-y-4 hover:-translate-y-6 hover:translate-x-2 hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] transition-all">
              <div className="flex justify-between items-start mb-2">
                <div className="text-xl font-bold uppercase tracking-widest text-[var(--accent-light)]">Pro</div>
                <div className="bg-[var(--accent)] text-xs font-black px-2 py-1 uppercase tracking-wider -rotate-3">More headroom</div>
              </div>
              <div className="text-6xl font-black tracking-tighter mb-4">$49<span className="text-2xl text-[var(--foreground-muted)]">/mo</span></div>
              <p className="text-lg font-medium mb-8">More storage and more guest headroom for heavier sharing.</p>
              
              <ul className="space-y-4 text-lg font-bold flex-grow mb-8">
                <li className="flex items-center gap-3"><span className="text-[var(--accent-light)] text-2xl">✓</span> Unlimited seats</li>
                <li className="flex items-center gap-3"><span className="text-[var(--accent-light)] text-2xl">✓</span> 500GB Storage</li>
                <li className="flex items-center gap-3"><span className="text-[var(--accent-light)] text-2xl">✓</span> 15,000 shared-link watch minutes / month</li>
                <li className="flex items-center gap-3"><span className="text-[var(--accent-light)] text-2xl">✓</span> 10,000 member watch minutes / month</li>
              </ul>
              
              <Link to="/sign-up" className="bg-[var(--background)] text-[var(--foreground)] text-center py-4 border-2 border-[var(--border)] font-black uppercase hover:bg-[var(--surface-muted)] transition-colors">Start Pro</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Massive CTA */}
      <section className="px-6 py-32 bg-[var(--background)]">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <h2 className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-[0.8] mb-8">
            START<br/>NOW.
          </h2>
          <p className="text-2xl text-[var(--foreground-muted)] font-medium mb-12">
            Starter is $15/month. Pro is $49/month.
          </p>
          <Link to="/sign-up"
            className="bg-[var(--surface-strong)] text-[var(--foreground-inverse)] px-12 py-6 border-2 border-[var(--border)] text-2xl font-black uppercase tracking-wider hover:bg-[var(--accent)] hover:border-[var(--accent)] transition-colors shadow-[12px_12px_0px_0px_var(--shadow-accent)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[8px_8px_0px_0px_var(--shadow-accent)]"
          >
            CREATE YOUR TEAM
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
