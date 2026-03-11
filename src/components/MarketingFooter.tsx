import { Link } from "@tanstack/react-router";

export function MarketingFooter() {
  return (
    <footer className="border-t-2 border-[var(--border)] bg-[var(--surface-strong)] px-6 py-16 text-[var(--foreground-inverse)]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
          <div>
            <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-[var(--foreground-inverse)]/65">
              Product
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <Link
                  to="/pricing"
                  className="hover:text-[var(--accent-light)] transition-colors"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  to="/sign-up"
                  className="hover:text-[var(--accent-light)] transition-colors"
                >
                  Start 7-day trial
                </Link>
              </li>
              <li>
                <Link
                  to="/sign-in"
                  className="hover:text-[var(--accent-light)] transition-colors"
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-[var(--foreground-inverse)]/65">
              Compare
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <Link
                  to="/compare/loom"
                  className="hover:text-[var(--accent-light)] transition-colors"
                >
                  loam vs Loom
                </Link>
              </li>
              <li>
                <Link
                  to="/compare/tella"
                  className="hover:text-[var(--accent-light)] transition-colors"
                >
                  loam vs Tella.tv
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-[var(--foreground-inverse)]/65">
              Use cases
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <Link
                  to="/for/video-editors"
                  className="hover:text-[var(--accent-light)] transition-colors"
                >
                  For small teams
                </Link>
              </li>
              <li>
                <Link
                  to="/for/agencies"
                  className="hover:text-[var(--accent-light)] transition-colors"
                >
                  For agencies
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-[var(--foreground-inverse)]/65">
              Forked from
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <a
                  href="https://lawn.video"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--accent-light)] transition-colors"
                >
                  lawn.video <span aria-hidden="true">♥</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-[var(--foreground-inverse)]/15 pt-8 md:flex-row">
          <span className="font-brand text-3xl font-bold tracking-tighter">loam.</span>
          <span className="text-sm text-[var(--foreground-inverse)]/70">
            Async video sharing for teams.
          </span>
        </div>
      </div>
    </footer>
  );
}
