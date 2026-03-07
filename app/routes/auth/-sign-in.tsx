import { SignIn } from "@clerk/tanstack-react-start";
import { useRouterState } from "@tanstack/react-router";
import { sanitizeRedirectPath } from "@/lib/redirect";

export default function SignInPage() {
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const redirectUrl = sanitizeRedirectPath(
    new URLSearchParams(search).get("redirect_url"),
    "/dashboard",
  );

  return (
    <SignIn
      fallbackRedirectUrl={redirectUrl || "/dashboard"}
      appearance={{
        elements: {
          formButtonPrimary:
            "bg-[var(--surface-strong)] hover:bg-[var(--accent)] text-[var(--foreground-inverse)] border-2 border-[var(--border)] rounded-none shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] font-mono font-bold uppercase text-sm transition-all",
          card: "bg-[var(--background)] border-2 border-[var(--border)] rounded-none shadow-[8px_8px_0px_0px_var(--shadow-color)]",
          headerTitle: "text-[var(--foreground)] font-black uppercase tracking-tighter text-2xl font-mono",
          headerSubtitle: "text-[var(--foreground-muted)] font-mono",
          socialButtonsBlockButton:
            "border-2 border-[var(--border)] bg-transparent hover:bg-[var(--surface-strong)] text-[var(--foreground)] hover:text-[var(--foreground-inverse)] rounded-none transition-all hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] font-mono",
          socialButtonsBlockButtonText: "!text-current font-bold uppercase font-mono",
          socialButtonsBlockButtonArrow: "text-current",
          formFieldLabel: "text-[var(--foreground)] font-bold uppercase font-mono",
          formFieldInput:
            "bg-transparent border-2 border-[var(--border)] text-[var(--foreground)] focus:border-[var(--accent)] focus:shadow-[4px_4px_0px_0px_var(--shadow-accent)] focus:ring-0 rounded-none font-mono",
          footerActionLink: "text-[var(--accent)] hover:text-[var(--foreground)] font-bold font-mono",
          footerActionText: "text-[var(--foreground-muted)] font-mono",
          dividerLine: "bg-[var(--surface-strong)]",
          dividerText: "text-[var(--foreground-muted)] font-mono font-bold",
          identityPreviewText: "text-[var(--foreground)] font-mono",
          identityPreviewEditButton: "text-[var(--accent)] hover:text-[var(--foreground)]",
          formFieldInputShowPasswordButton: "text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
          footer: "hidden",
          internal: "text-[var(--foreground)]",
        },
        variables: {
          colorPrimary: "var(--accent)",
          colorBackground: "var(--background)",
          colorInputBackground: "transparent",
          colorInputText: "var(--foreground)",
          colorText: "var(--foreground)",
          colorTextSecondary: "var(--foreground-muted)",
          colorTextOnPrimaryBackground: "var(--foreground-inverse)",
          colorNeutral: "var(--foreground)",
          borderRadius: "0rem",
        },
      }}
    />
  );
}
