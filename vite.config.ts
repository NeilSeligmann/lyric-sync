import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
  build: {
    rollupOptions: {
      external: ['worker_threads']
    }
  },
  optimizeDeps: {
    exclude: ['worker_threads']
  }
});
