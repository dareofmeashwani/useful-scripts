import { useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { zipSync } from 'fflate'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import usePdfFile from '../hooks/usePdfFile'
import { canvasToBlob } from '../utils/imageUtils'

// Bundle the PDF.js worker using Vite's import.meta.url pattern so it is
// included in the build output and accessible offline (no CDN needed).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

const MAX_PAGES = 100

export default function PdfToImages({ meta }) {
  const { file, fileError, applyFile } = usePdfFile()
  const [loading, setLoading]         = useState(false)
  const [progress, setProgress]       = useState(null)  // { current, total }
  const [error, setError]             = useState(null)
  const [result, setResult]           = useState(null)

  const handleSubmit = async e => {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)
    setResult(null)
    setProgress(null)

    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const pdf   = await pdfjsLib.getDocument({ data: bytes }).promise

      const pageCount = pdf.numPages
      if (pageCount === 0) throw new Error('PDF has no pages')
      if (pageCount > MAX_PAGES) throw new Error(`Too many pages (${pageCount}). Max ${MAX_PAGES}.`)

      const zipFiles = {}
      const stem = file.name.replace(/\.pdf$/i, '')

      for (let i = 1; i <= pageCount; i++) {
        setProgress({ current: i, total: pageCount })

        const page     = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 2 })  // 2× ≈ 144 DPI

        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)

        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        page.cleanup()

        const blob  = await canvasToBlob(canvas, 'image/png')
        const label = String(i).padStart(3, '0')
        // Store PNG without re-compressing (level:0 = STORE) — PNG is already compressed
        zipFiles[`page_${label}.png`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
      }

      const zipped  = zipSync(zipFiles)
      const zipBlob = new Blob([zipped], { type: 'application/zip' })
      const url     = URL.createObjectURL(zipBlob)
      setResult({ url, name: `${stem}_pages.zip`, pageCount })
    } catch (err) {
      setError(err.message || 'Failed to extract pages')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  return (
    <div className="tool-ui">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={handleSubmit}>
        <FileZone
          file={file}
          error={!!fileError}
          onSelect={applyFile}
          accept=".pdf,application/pdf"
          hint="Click or drag a PDF here"
          subhint="Max 50 MB · up to 100 pages"
        />
        {fileError && <div className="alert alert--error">{fileError}</div>}

        <button className="submit-btn" type="submit" disabled={!file || !!fileError || loading}>
          {loading && <span className="spinner" />}
          {loading
            ? progress
              ? `Rendering page ${progress.current} of ${progress.total}…`
              : 'Loading PDF…'
            : 'Extract pages as images'}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {result && (
        <div className="result-card">
          <div className="result-card-top">
            <div className="result-card-icon">🖼️</div>
            <div className="result-card-body">
              <p className="result-card-title">
                {result.pageCount} page{result.pageCount !== 1 ? 's' : ''} extracted
              </p>
              <p className="result-card-name">{result.name}</p>
            </div>
          </div>
          <a className="download-btn" href={result.url} download={result.name}>
            ⬇ Download ZIP
          </a>
        </div>
      )}
    </div>
  )
}
