import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Library build: one self-contained ES module that registers the custom element.
// React / ReactDOM / motion are bundled in (not externalized) so the single file
// can be served straight from a CDN and loaded as a Lovelace `module` resource.
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    lib: {
      entry: 'src/main.jsx',
      formats: ['es'],
      fileName: () => 'kokonut-light-card.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    cssCodeSplit: false,
    minify: 'esbuild',
    target: 'es2020',
    emptyOutDir: true,
  },
})
