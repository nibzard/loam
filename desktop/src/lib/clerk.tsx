import { ClerkProvider } from "@clerk/clerk-react";
import type { ReactNode } from "react";
import {
  getClerkPublishableKey,
  getDesktopClerkProviderProps,
} from "./desktopAuth";

export function ClerkClientProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={getClerkPublishableKey()}
      {...getDesktopClerkProviderProps()}
    >
      {children}
    </ClerkProvider>
  );
}
