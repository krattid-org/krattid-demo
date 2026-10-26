import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: 'safari15', cssTarget: 'safari15', outDir: 'dist', assetsInlineLimit: 0 },
});
