import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ClerkClientProvider } from "./lib/clerk";
import { ConvexClientProvider } from "./lib/convex";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <ClerkClientProvider>
      <ConvexClientProvider>
        <App />
      </ConvexClientProvider>
    </ClerkClientProvider>
  </StrictMode>,
);
