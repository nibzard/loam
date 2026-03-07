import { Link } from "@tanstack/react-router";

export function MarketingFooter() {
  return (
    <footer className="border-t-2 border-[#1a1a1a] px-6 py-16 bg-[#1a1a1a] text-[#f0f0e8]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[#888] mb-4">
              Product
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <Link
                  to="/pricing"
                  className="hover:text-[#7cb87c] transition-colors"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  to="/sign-up"
                  className="hover:text-[#7cb87c] transition-colors"
                >
                  Start 7-day trial
                </Link>
              </li>
              <li>
                <Link
                  to="/sign-in"
                  className="hover:text-[#7cb87c] transition-colors"
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[#888] mb-4">
              Compare
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <Link
                  to="/compare/loom"
                  className="hover:text-[#7cb87c] transition-colors"
                >
                  loam vs Loom
                </Link>
              </li>
              <li>
                <Link
                  to="/compare/tella"
                  className="hover:text-[#7cb87c] transition-colors"
                >
                  loam vs Tella.tv
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[#888] mb-4">
              Use cases
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <Link
                  to="/for/video-editors"
                  className="hover:text-[#7cb87c] transition-colors"
                >
                  For small teams
                </Link>
              </li>
              <li>
                <Link
                  to="/for/agencies"
                  className="hover:text-[#7cb87c] transition-colors"
                >
                  For agencies
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[#888] mb-4">
              Open source
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <a
                  href="https://github.com/nibzard/loam"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#7cb87c] transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[#333] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="font-black text-3xl tracking-tighter">loam.</span>
          <span className="text-sm text-[#888]">
            Async video sharing for teams.
          </span>
        </div>
      </div>
    </footer>
  );
}
