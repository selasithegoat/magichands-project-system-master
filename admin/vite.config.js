import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Use absolute base for production builds so deep-link refreshes load assets correctly.
  // Dev stays at root for simplicity.
  base: command === "build" ? "/admin/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@client": resolve(__dirname, "../client/src"),
      react: resolve(__dirname, "node_modules/react"),
      "react-dom": resolve(__dirname, "node_modules/react-dom"),
      "react-router-dom": resolve(__dirname, "node_modules/react-router-dom"),
    },
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  server: {
    port: 3000,
    fs: {
      allow: [resolve(__dirname, "..")],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          admin_libs: ["axios", "react-hot-toast"],
        },
      },
    },
  },
}));
