import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export default function HomepageMono() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 200);
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-mono selection:bg-[var(--accent)] selection:text-[var(--foreground-inverse)]">
      <nav className="sticky top-0 z-50 px-6 py-4 flex justify-between items-center bg-[var(--background)]">
        <div className="flex items-center gap-4">
          <span className={`text-xl font-black transition-opacity duration-200 ${scrolled ? "opacity-100" : "opacity-0"}`}>loam</span>
          <span className={`text-xs text-[var(--foreground-muted)] hidden sm:inline border-l border-[var(--foreground-muted)] pl-4 transition-opacity duration-200 ${scrolled ? "opacity-100" : "opacity-0"}`}>async video</span>
        </div>
        <div className="flex gap-4 text-sm">
          <Link to="/sign-in" className="hover:underline">Sign In</Link>
          <Link to="/sign-up" className="font-bold underline underline-offset-4">Start</Link>
        </div>
      </nav>

      <section className="px-6 pt-8 pb-16">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-[20vw] sm:text-[18vw] font-black leading-[0.85] tracking-tight">
            loam
          </h1>

          <div className="max-w-2xl mt-8">
            <p className="text-2xl sm:text-3xl font-bold leading-tight">
              Async video sharing for teams.
              <br />
              <span className="text-[var(--accent)]">Less features. No bull$#!t.</span>
            </p>
          </div>

          <div className="mt-12 flex flex-wrap gap-6 items-center">
            <div className="bg-[var(--accent)] text-[var(--foreground-inverse)] px-6 py-4">
              <span className="text-3xl font-black">from $15/mo</span>
              <span className="text-sm ml-2 opacity-70">flat team pricing</span>
            </div>
            <Link
              to="/sign-up"
              className="border-2 border-[var(--border)] px-6 py-4 font-bold hover:bg-[var(--surface-strong)] hover:text-[var(--foreground-inverse)] transition-colors"
            >
              Get Started →
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y-2 border-[var(--border)]">
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Context-rich", desc: "Replies tied to playback moments" },
            { title: "Unlimited seats", desc: "One price for everyone" },
            { title: "0.3s response", desc: "Built for speed" },
            { title: "Async-ready", desc: "Built to move teams forward" },
          ].map((item, index) => (
            <div
              key={index}
              className={`p-6 ${index < 3 ? "border-r-2 border-[var(--border)]" : ""} ${index < 2 ? "lg:border-r-2" : "lg:border-r-0"}`}
            >
              <div className="font-black">{item.title}</div>
              <div className="text-sm text-[var(--foreground-muted)]">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-black mb-2">How loam compares</h2>
          <p className="text-[var(--foreground-muted)] mb-8">Loom is solid software. Here's where we differ.</p>

          <div className="space-y-6">
            <div className="bg-[var(--surface-strong)] text-[var(--foreground-inverse)] p-8">
              <div className="text-sm tracking-widest text-[var(--accent-light)] mb-4">PRICING MODEL</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div>
                  <div className="text-[var(--foreground-muted)] text-sm mb-1">Loom</div>
                  <div className="text-2xl font-black">$18/user/mo</div>
                  <div className="text-sm text-[var(--foreground-muted)] mt-2">Team of 5 = $1,080/year</div>
                </div>
                <div>
                  <div className="text-[var(--accent-light)] text-sm mb-1">loam</div>
                  <div className="text-2xl font-black text-[var(--accent-light)]">from $15/mo</div>
                  <div className="text-sm text-[var(--foreground-muted)] mt-2">Team of 5 = $180/year</div>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
                <span className="text-sm text-[var(--foreground-muted)]">Annual savings with 5 users: </span>
                <span className="text-xl font-black text-[var(--accent-light)]">$900</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border-2 border-[var(--border)] p-6">
                <div className="font-black mb-2">Loom</div>
                <ul className="text-sm text-[var(--foreground-muted)] space-y-1">
                  <li>• Broader workplace suite</li>
                  <li>• Meeting and AI extras</li>
                  <li>• Per-seat pricing</li>
                </ul>
              </div>
              <div className="border-2 border-[var(--accent)] p-6">
                <div className="font-black text-[var(--accent)] mb-2">loam</div>
                <ul className="text-sm space-y-1">
                  <li>• Focused async sharing</li>
                  <li>• Simpler, faster viewer</li>
                  <li>• Flat team pricing</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--surface-strong)] text-[var(--foreground-inverse)] px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-black mb-12">How it works</h2>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
            {[
              { step: "1", action: "Upload", desc: "your video" },
              { step: "2", action: "Share", desc: "the link" },
              { step: "3", action: "Click", desc: "to comment" },
            ].map((item, index) => (
              <div key={index} className="flex items-center gap-4">
                <span className="w-16 h-16 bg-[var(--accent)] flex items-center justify-center text-3xl font-black">
                  {item.step}
                </span>
                <div>
                  <div className="text-xl font-black">{item.action}</div>
                  <div className="text-sm text-[var(--foreground-muted)]">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 border-b-2 border-[var(--border)]">
        <div className="max-w-3xl mx-auto text-center">
          <blockquote className="text-2xl sm:text-3xl font-bold leading-tight">
            "Record it once. Share the link. Let the team watch on their own
            time."
          </blockquote>
          <p className="mt-4 text-[var(--foreground-muted)]">Built for async teams</p>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-5xl sm:text-6xl font-black">
            Pick your plan
          </h2>
          <p className="text-xl text-[var(--foreground-muted)] mt-4 mb-8">
            Starter is $15/month. Pro is $49/month.
          </p>
          <Link
            to="/sign-up"
            className="inline-block bg-[var(--accent)] text-[var(--foreground-inverse)] px-12 py-5 text-xl font-black hover:bg-[var(--accent-hover)] transition-colors"
          >
            Start with Starter
          </Link>
          <p className="mt-4 text-sm text-[var(--foreground-muted)]">Upgrade to Pro anytime</p>
        </div>
      </section>

      <footer className="border-t-2 border-[var(--border)] px-6 py-8">
        <div className="max-w-5xl mx-auto flex justify-between items-center text-sm">
          <span className="font-black text-xl">loam</span>
          <div className="flex gap-6 text-[var(--foreground-muted)]">
            <a href="/github" className="hover:text-[var(--foreground)]">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
