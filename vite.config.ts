import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  base: "/commission-on-logic-education/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: path.resolve(import.meta.dirname, "index.html"),
        resources: path.resolve(import.meta.dirname, "resources", "index.html"),
        events: path.resolve(import.meta.dirname, "events", "index.html"),
        about: path.resolve(import.meta.dirname, "about", "index.html"),
      },
    },
  },
});
