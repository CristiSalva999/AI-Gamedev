/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Proxy API calls to the backend so the browser sees a single origin in dev.
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
