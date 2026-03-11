const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function getClerkPublishableKey() {
  if (!publishableKey) {
    throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
  }

  return publishableKey;
}

export function getDesktopClerkProviderProps() {
  return {
    standardBrowser: false,
    signInFallbackRedirectUrl: "/",
    signUpFallbackRedirectUrl: "/",
    afterSignOutUrl: "/",
  };
}

export function isDesktopAuthFallbackRequired() {
  return false;
}
