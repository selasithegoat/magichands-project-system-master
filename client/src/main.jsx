import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

import { Buffer } from "buffer";
window.Buffer = Buffer;

import { BrowserRouter } from "react-router-dom";

const THEME_STORAGE_KEY = "mh-client-theme";
const resolveInitialTheme = () => {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch (error) {
    // ignore storage access errors
  }
  if (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) {
    return "dark";
  }
  return "light";
};

try {
  const initialTheme = resolveInitialTheme();
  document.documentElement.dataset.theme = initialTheme;
} catch (error) {
  // ignore theme preflight errors
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

// Register Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.log("SW registration failed: ", err);
    });
  });
}
