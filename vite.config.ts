import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run preview:build` bundles everything but the fonts into one HTML file
// (for sharing a link); the fonts are copied next to it from public/.
export default defineConfig(({ mode }) => ({
  base: './',
  // Shown at the foot of Settings, so you can tell which version is running.
  define: { __BUILT__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));
