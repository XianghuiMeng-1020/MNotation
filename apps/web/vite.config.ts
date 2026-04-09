import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === "analyze" && visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true })
  ].filter(Boolean),
  build: {
    target: "es2022",
    sourcemap: mode === "staging" ? "hidden" : false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          charts: ["chart.js", "react-chartjs-2"]
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  }
}));
