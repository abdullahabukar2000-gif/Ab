import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run preview:build` bundles everything but the fonts into one HTML file
// (for sharing a link); the fonts are copied next to it from public/.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));
