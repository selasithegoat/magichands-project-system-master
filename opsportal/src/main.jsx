import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./app/App";
import RealtimeQuerySync from "./components/RealtimeQuerySync";
import MutationFeedback from "./components/MutationFeedback";
import { installMutationFeedback } from "./utils/mutationFeedback";
import { queryClient } from "./utils/queryClient";
import "./app/App.css";

installMutationFeedback();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MutationFeedback />
      <RealtimeQuerySync />
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
