import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  build: {
    // Target modern evergreen browsers — no legacy polyfill overhead.
    target: 'esnext',

    rollupOptions: {
      output: {
        // Split only the genuinely large, stable vendor libraries into named
        // chunks so the browser can cache them independently of app code:
        //
        //   vendor-react   (~256 KB) — changes on React/router upgrade only
        //   vendor-pdf-lib (~419 KB) — lazy-loaded with PdfSplit/PdfFromImages
        //   vendor-pdfjs   (~430 KB) — lazy-loaded with PdfToImages only
        //
        // Smaller libs (fflate 9 KB, js-yaml 45 KB) are bundled into app.js
        // — the extra weight is negligible and keeps the file count low.
        //
        // Note: Vite 8 uses Rolldown which requires the function form.
        manualChunks(id) {
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) {
            return 'vendor-react'
          }
          if (id.includes('/pdf-lib/'))    return 'vendor-pdf-lib'
          if (id.includes('/pdfjs-dist/')) return 'vendor-pdfjs'
        },
      },
    },
  },
})
