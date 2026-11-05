import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

const apiProxy = {
  "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
  "/healthz": { target: "http://127.0.0.1:8000", changeOrigin: true },
  "/ws": { target: "ws://127.0.0.1:8000", ws: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  // `vite preview` also needs the proxy so a production build can be exercised
  // locally against the real API.
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
