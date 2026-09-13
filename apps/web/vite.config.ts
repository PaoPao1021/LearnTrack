import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rolldownOptions: {
      output: {
        // 大依赖独立分包：业务改动不影响它们的长缓存（rolldown 的 advancedChunks）
        advancedChunks: {
          groups: [
            { name: 'echarts', test: /[\\/]node_modules[\\/]echarts[\\/]/ },
            { name: 'dexie', test: /[\\/]node_modules[\\/](dexie|dexie-react-hooks)[\\/]/ },
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
