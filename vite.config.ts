import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Modo "artifact": build num único HTML com router em hash (sem service worker).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: mode === 'artifact' ? './' : '/',
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    assetsInlineLimit: mode === 'artifact' ? 100_000_000 : 4096,
    cssCodeSplit: mode !== 'artifact',
    rollupOptions: mode === 'artifact' ? { output: { inlineDynamicImports: true } } : undefined,
  },
}))
