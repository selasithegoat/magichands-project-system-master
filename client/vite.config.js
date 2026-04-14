import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default defineConfig(({ mode }) => {
  const sharedEnv = loadEnv(mode, resolve(__dirname, "../server"), "");
  const uploadMaxMb = toPositiveInt(sharedEnv.UPLOAD_MAX_MB, 200);

  return {
    plugins: [react()],
    define: {
      __UPLOAD_MAX_MB__: JSON.stringify(uploadMaxMb),
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: true,
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
            ui: ["@fontsource/inter", "date-fns"],
            pdf: ["@react-pdf/renderer"],
            docx: ["docx", "file-saver"],
          },
        },
      },
    },
  };
});
