import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],

  define: {
    global: "globalThis",
    "process.env": {}
  },

  resolve: {
    alias: {
      canvas: path.resolve(__dirname, "src/shims/canvas.js"),
      buffer: path.resolve(__dirname, "node_modules/buffer/index.js"),
      events: path.resolve(__dirname, "node_modules/events/events.js")
    }
  },

  optimizeDeps: {
    include: ["buffer", "events"],
    exclude: ["canvas"]
  }
});