/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Cursor Cloud / other reverse proxies rewrite Host; allow any hostname so
    // preview URLs like *.cursorvm.com are not blocked by Vite's host check.
    allowedHosts: true,
    // Proxy API calls to the backend so the browser sees a single origin in dev.
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        // Long-running SSE chat builds must not be cut by proxy idle timeouts.
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
