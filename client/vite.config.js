import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(clientRoot, "..");

const loadReleaseInfo = () => {
  try {
    const version = readFileSync(resolve(repoRoot, "VERSION"), "utf8").trim();
    const nicknames = JSON.parse(
      readFileSync(resolve(repoRoot, "VERSION_NICKNAMES.json"), "utf8"),
    );
    const [major, minor, patch] = version.split(".");
    const nickname =
      nicknames[`${major}.${minor}.${patch}`] ||
      nicknames[`${major}.${minor}`] ||
      nicknames[major] ||
      "";
    return { version, nickname };
  } catch {
    return { version: "", nickname: "" };
  }
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeModuleId = (id) => id.replace(/\\/g, "/");

const isNodeModule = (id, packageName) => {
  const normalized = normalizeModuleId(id);
  return normalized.includes(`/node_modules/${packageName}/`);
};

export default defineConfig(({ mode }) => {
  const sharedEnv = loadEnv(mode, resolve(clientRoot, "../server"), "");
  const uploadMaxMb = toPositiveInt(sharedEnv.UPLOAD_MAX_MB, 200);
  const releaseInfo = loadReleaseInfo();

  return {
    plugins: [react()],
    define: {
      __UPLOAD_MAX_MB__: JSON.stringify(uploadMaxMb),
      __APP_RELEASE_INFO__: JSON.stringify(releaseInfo),
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
          manualChunks(id) {
            if (
              isNodeModule(id, "react") ||
              isNodeModule(id, "react-dom") ||
              isNodeModule(id, "react-router") ||
              isNodeModule(id, "react-router-dom") ||
              isNodeModule(id, "scheduler")
            ) {
              return "vendor";
            }

            if (
              normalizeModuleId(id).includes("/node_modules/@fontsource/") ||
              isNodeModule(id, "date-fns")
            ) {
              return "ui";
            }

            if (normalizeModuleId(id).includes("/node_modules/@react-pdf/")) {
              return "pdf";
            }

            if (isNodeModule(id, "docx") || isNodeModule(id, "file-saver")) {
              return "docx";
            }

            return undefined;
          },
        },
      },
    },
  };
});
