import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import "./index.css";
import RealtimeQuerySync from "./components/RealtimeQuerySync.jsx";
import MutationFeedback from "./components/ui/MutationFeedback.jsx";
import { installMutationFeedback } from "./utils/mutationFeedback.js";
import { queryClient } from "./utils/queryClient.js";

import { BrowserRouter } from "react-router-dom";

installMutationFeedback();

try {
  window.__MH_PORTAL__ = "client";
} catch {
  // ignore portal flag errors
}

const resolveInitialTheme = () => {
  if (typeof window === "undefined") return "light";
  const pathname = window.location?.pathname || "";
  if (pathname === "/login" || pathname === "/") {
    return "light";
  }
  if (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) {
    return "dark";
  }
  return "light";
};

try {
  const initialTheme = resolveInitialTheme();
  document.documentElement.dataset.theme = initialTheme;
} catch {
  // ignore theme preflight errors
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MutationFeedback />
      <RealtimeQuerySync />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

// Retire the old pass-through service worker. It added a worker and a fetch
// interception hop without providing offline caching.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
      .catch(() => {});
  });
}
