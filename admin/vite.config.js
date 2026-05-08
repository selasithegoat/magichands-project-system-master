import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";

const adminRoot = fileURLToPath(new URL(".", import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Use absolute base for production builds so deep-link refreshes load assets correctly.
  // Dev stays at root for simplicity.
  base: command === "build" ? "/admin/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@client": resolve(adminRoot, "../client/src"),
      react: resolve(adminRoot, "node_modules/react"),
      "react-dom": resolve(adminRoot, "node_modules/react-dom"),
      "react-router-dom": resolve(adminRoot, "node_modules/react-router-dom"),
      "emoji-picker-react": resolve(
        adminRoot,
        "node_modules/emoji-picker-react",
      ),
      "@twemoji/api": resolve(adminRoot, "node_modules/@twemoji/api"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react-router-dom",
      "emoji-picker-react",
      "@twemoji/api",
    ],
  },
  server: {
    port: 3000,
    fs: {
      allow: [resolve(adminRoot, "..")],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      "/uploads": {
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
