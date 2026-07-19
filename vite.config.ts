import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  resolve: {
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Release builds omit source maps so the deployed payload matches the
    // bundle budget and does not ship implementation source unnecessarily.
    sourcemap: false,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json-summary'],
    },
  },
});
