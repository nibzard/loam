import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeToggle";

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggleTheme, themeLook, toggleThemeLook, mounted } = useTheme();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed w-full top-0 z-50 px-6 py-4 flex justify-between items-center transition-all duration-200 ${scrolled ? "bg-[var(--background)] border-b-2 border-[var(--border)] shadow-[2px_2px_0px_0px_var(--shadow-color)]" : "bg-[var(--background)] border-b-2 border-[var(--border)]"}`}
    >
      <div className="flex items-center gap-4">
        <Link to="/" className="font-brand text-xl font-bold tracking-tighter">
          loam.
        </Link>
      </div>
      <div className="flex gap-6 items-center text-sm font-bold uppercase tracking-wide">
        <Link
          to="/pricing"
          className="hover:text-[var(--accent)] underline-offset-4 hidden sm:block"
        >
          Pricing
        </Link>
        <Link
          to="/compare/loom"
          className="hover:text-[var(--accent)] underline-offset-4 hidden sm:block"
        >
          Compare
        </Link>
        <Link to="/sign-in" className="hover:text-[var(--accent)] underline-offset-4">
          Log in
        </Link>
        <Link
          to="/sign-up"
          className="px-4 py-2 border-2 border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--foreground-inverse)] transition-colors"
        >
          Start
        </Link>
        <button
          onClick={toggleTheme}
          disabled={!mounted}
          className="w-8 h-8 flex items-center justify-center text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-alt)] transition-colors"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode (⌘⇧L)`}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={toggleThemeLook}
          disabled={!mounted}
          className="w-8 h-8 flex items-center justify-center text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-alt)] transition-colors"
          title={`Switch to ${themeLook === "brutalist" ? "clean" : "brutalist"} visual style`}
          aria-label={`Switch to ${themeLook === "brutalist" ? "clean" : "brutalist"} visual style`}
        >
          <Palette className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
