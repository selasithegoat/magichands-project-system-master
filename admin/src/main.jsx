import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

import { BrowserRouter } from "react-router-dom";

const baseName = window.location.pathname.startsWith("/admin")
  ? "/admin"
  : "/";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter basename={baseName}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
