import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

const pwaCacheVersion = process.env.GITHUB_SHA
  ?? process.env.VITE_PWA_CACHE_VERSION
  ?? 'local';

// Routes are root-mounted (`/2048`, `/block-blaster`, ...), and the service
// worker's scope is `/`.
export default defineConfig({
  define: {
    __PWA_CACHE_VERSION__: JSON.stringify(pwaCacheVersion),
  },
  plugins: [
    react(),
    laravel({
      input: [
        'resources/css/app.css',
        'resources/js/games/cars/index.tsx',
        'resources/js/games/marble-sort/index.tsx',
        'resources/js/games/block-blaster/index.tsx',
        'resources/js/games/math-horde/index.tsx',
        'resources/js/games/hover/index.tsx',
        'resources/js/games/chicks-challenge/index.tsx',
        'resources/js/games/tower-throwback/index.tsx',
        'resources/js/games/2048/index.tsx',
        'resources/js/games/game-select/index.tsx',
        'resources/js/games/pwa/register.ts',
      ],
      refresh: true,
    }),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'resources/js/games/pwa',
      filename: 'sw.ts',
      rollupFormat: 'iife',
      injectRegister: false,
      manifest: false,
      scope: '/',
      buildBase: '/build/',
      outDir: 'public/build',
      injectManifest: {
        injectionPoint: undefined,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'resources/js'),
    },
  },
  // Some games may need ES-module workers.
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      external: (id) => /\.test\.[tj]sx?$/.test(id) || id.includes('/__tests__/'),
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react/') || id.includes('react-dom/')) {
              return 'vendor';
            }
            if (
              id.includes('@base-ui/react') ||
              id.includes('class-variance-authority') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge')
            ) {
              return 'ui-core';
            }
            if (
              id.includes('lucide-react') ||
              id.includes('currency.js') ||
              id.includes('zod') ||
              id.includes('dayjs')
            ) {
              return 'utils';
            }
            if (id.includes('three') || id.includes('cannon-es')) {
              return 'engine';
            }
          }
        },
      },
    },
  },
});
