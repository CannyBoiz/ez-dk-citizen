import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { createNetwork } from "./shared/lib/network";

// Unset means same-origin, as on the private admin site (ADR-0007).
const bffBaseUrl = import.meta.env.VITE_BFF_BASE_URL || window.location.origin;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App network={createNetwork(bffBaseUrl)} />
  </StrictMode>,
);
