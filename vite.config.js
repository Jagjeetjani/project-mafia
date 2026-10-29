import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('firebase')) {
            return 'vendor-firebase';
          }
          if (id.includes('chart.js') || id.includes('@kurkle')) {
            return 'vendor-chart';
          }
          if (id.includes('idb')) {
            return 'vendor-idb';
          }
          if (id.includes('seedData')) {
            return 'seed-data';
          }
        },
      },
    },
  },
});
