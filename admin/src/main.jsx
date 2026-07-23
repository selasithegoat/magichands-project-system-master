import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import axios from "axios";
import "./index.css";
import App from "./App.jsx";
import RealtimeQuerySync from "./components/RealtimeQuerySync.jsx";
import MutationFeedback from "./components/MutationFeedback/MutationFeedback.jsx";
import { installMutationFeedback } from "./utils/mutationFeedback.js";
import { queryClient } from "./utils/queryClient.js";

import { BrowserRouter } from "react-router-dom";

installMutationFeedback({ axios });

const baseName = window.location.pathname.startsWith("/admin")
  ? "/admin"
  : "/";

try {
  window.__MH_PORTAL__ = "admin";
} catch {
  // ignore portal flag errors
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MutationFeedback />
      <RealtimeQuerySync />
      <BrowserRouter basename={baseName}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
