import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import MutationFeedback from "./components/MutationFeedback";
import { installMutationFeedback } from "./utils/mutationFeedback";
import "./app/App.css";

installMutationFeedback();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <>
      <MutationFeedback />
      <App />
    </>
  </StrictMode>,
);
