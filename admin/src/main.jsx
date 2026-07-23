import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import "./index.css";
import App from "./App.jsx";
import MutationFeedback from "./components/MutationFeedback/MutationFeedback.jsx";
import { installMutationFeedback } from "./utils/mutationFeedback.js";

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
    <>
      <MutationFeedback />
      <BrowserRouter basename={baseName}>
        <App />
      </BrowserRouter>
    </>
  </StrictMode>,
);
