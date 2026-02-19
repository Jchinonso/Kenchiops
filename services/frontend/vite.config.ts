import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const localReact = path.resolve(__dirname, "./node_modules/react");
const localReactDom = path.resolve(__dirname, "./node_modules/react-dom");

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Pin React to the frontend's own copy to prevent dual-React issues
      // in tests (monorepo root has React 18, frontend has React 19).
      // Using regex to also capture subpath imports like react/jsx-runtime.
      { find: /^react-dom($|\/)/, replacement: `${localReactDom}$1` },
      { find: /^react($|\/)/, replacement: `${localReact}$1` },
    ],
  },
  server: {
    proxy: {
      "/auth": "http://localhost:3000",
      "/integrations": "http://localhost:3000",
      "/api/v1/incidents": "http://localhost:3004",
      "/api/v1/triage": "http://localhost:3004",
      "/api": "http://localhost:3000",
      "/webhooks": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    deps: {
      optimizer: {
        web: {
          include: [
            "@testing-library/react",
            "@testing-library/jest-dom",
            "@testing-library/user-event",
            "react-dom",
            "react-dom/client",
            "react-dom/test-utils",
          ],
        },
      },
    },
  },
});
