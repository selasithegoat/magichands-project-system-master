import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "");
  const sharedEnv = loadEnv(mode, resolve(__dirname, "../server"), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:5000";
  const uploadMaxMb = toPositiveInt(sharedEnv.UPLOAD_MAX_MB, 200);

  return {
    base: command === "build" ? "/inventory/" : "/",
    plugins: [react()],
    define: {
      __UPLOAD_MAX_MB__: JSON.stringify(uploadMaxMb),
    },
    server: {
      host: "0.0.0.0",
      port: 3003,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
