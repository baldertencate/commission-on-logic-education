import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  base: "/logic-education-resources/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: path.resolve(import.meta.dirname, "index.html"),
        resources: path.resolve(import.meta.dirname, "resources", "index.html"),
        events: path.resolve(import.meta.dirname, "events", "index.html"),
      },
    },
  },
});
