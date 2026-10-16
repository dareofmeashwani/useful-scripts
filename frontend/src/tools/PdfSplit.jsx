import { useState, useRef } from 'react'
import { PDFDocument } from 'pdf-lib'
import { zipSync } from 'fflate'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import usePdfFile from '../hooks/usePdfFile'

const MAX_MB = 50

function clientValidate(f) {
  if (!f) return null
  if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return 'not-pdf'
  if (f.size === 0) return 'empty'
  if (f.size > MAX_MB * 1024 * 1024) return 'too-large'
  return null
}

function validateRanges(val, total) {
  if (!val.trim()) return null
  for (const part of val.split(',')) {
    const t = part.trim()
    if (!t) continue
    if (t.includes('-')) {
      const halves = t.split('-')
      if (halves.length !== 2) return `Invalid range: "${t}"`
      const a = parseInt(halves[0].trim(), 10)
      const b = parseInt(halves[1].trim(), 10)
      if (isNaN(a) || isNaN(b)) return `Invalid range: "${t}"`
      if (a < 1 || b < a) return `Range "${t}" is invalid (start must be ≤ end)`
      if (total && b > total) return `Page ${b} exceeds total (${total} pages)`
    } else {
      const n = parseInt(t, 10)
      if (isNaN(n) || n < 1) return `Invalid page: "${t}"`
      if (total && n > total) return `Page ${n} exceeds total (${total} pages)`
    }
  }
  return null
}

// Parse a ranges string into 0-indexed [start, end] pairs.
function parseRanges(val, total) {
  if (!val.trim()) return Array.from({ length: total }, (_, i) => [i, i])
  const segments = []
  for (const part of val.split(',')) {
    const t = part.trim()
    if (!t) continue
    if (t.includes('-')) {
      const [a, b] = t.split('-').map(s => parseInt(s.trim(), 10))
      segments.push([a - 1, b - 1])
    } else {
      const n = parseInt(t, 10)
      segments.push([n - 1, n - 1])
    }
  }
  return segments.length ? segments : Array.from({ length: total }, (_, i) => [i, i])
}

export default function PdfSplit({ meta }) {
  const { file, fileError, applyFile } = usePdfFile()
  const [pageCount, setPageCount]     = useState(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [mode, setMode]               = useState('all')
  const [ranges, setRanges]           = useState('')
  const [rangeError, setRangeError]   = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [result, setResult]           = useState(null)

  // Cache the loaded PDFDocument so we don't re-parse the file on submit
  const pdfDocRef = useRef(null)

  const handleFile = async f => {
    applyFile(f)
    pdfDocRef.current = null
    setPageCount(null)
    setError(null)
    setResult(null)
    setRanges('')
    setRangeError(null)

    if (clientValidate(f) !== null) return

    setInfoLoading(true)
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const doc   = await PDFDocument.load(bytes)
      pdfDocRef.current = doc
      setPageCount(doc.getPageCount())
    } catch (err) {
      setError('Failed to read PDF: ' + (err.message || 'unknown error'))
    } finally {
      setInfoLoading(false)
    }
  }

  const handleRangeChange = val => {
    setRanges(val)
    setRangeError(validateRanges(val, pageCount))
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!file || !pdfDocRef.current) return

    if (mode === 'ranges') {
      const err = validateRanges(ranges, pageCount)
      if (err) { setRangeError(err); return }
    }

    setLoading(true)
    setError(null)
    if (result?.url) { URL.revokeObjectURL(result.url); setResult(null) }

    try {
      const srcDoc   = pdfDocRef.current
      const segments = parseRanges(mode === 'all' ? '' : ranges, pageCount)
      const stem     = file.name.replace(/\.pdf$/i, '')
      const zipFiles = {}

      for (const [start, end] of segments) {
        const newDoc = await PDFDocument.create()
        const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i)
        const pages  = await newDoc.copyPages(srcDoc, indices)
        pages.forEach(p => newDoc.addPage(p))
        const bytes = await newDoc.save()
        const label = start === end
          ? `page_${String(start + 1).padStart(3, '0')}`
          : `pages_${start + 1}-${end + 1}`
        zipFiles[`${stem}_${label}.pdf`] = new Uint8Array(bytes)
      }

      const zipped  = zipSync(zipFiles, { level: 6 })
      const zipBlob = new Blob([zipped], { type: 'application/zip' })
      const url     = URL.createObjectURL(zipBlob)
      setResult({ url, name: `${stem}_split.zip`, segCount: segments.length })
    } catch (err) {
      setError(err.message || 'Failed to split PDF')
    } finally {
      setLoading(false)
    }
  }

  const infoReady = file && !fileError && !infoLoading && pageCount != null
  const canSubmit = infoReady && (mode === 'all' || (ranges.trim() && !rangeError))

  return (
    <div className="tool-ui">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={handleSubmit}>
        <FileZone
          file={file}
          error={!!fileError}
          onSelect={handleFile}
          accept=".pdf,application/pdf"
          hint="Click or drag a PDF here"
          subhint="Max 50 MB · up to 100 pages"
        />
        {fileError && <div className="alert alert--error">{fileError}</div>}

        {file && !fileError && (
          <div className="pdf-info-row">
            {infoLoading ? (
              <span className="pdf-info-badge pdf-info-badge--loading">
                <span className="spinner spinner--sm" />
                Analyzing…
              </span>
            ) : pageCount != null ? (
              <span className="pdf-info-badge">
                📄 {pageCount} page{pageCount !== 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
        )}

        {infoReady && (
          <>
            <div className="split-mode-tabs">
              <button
                type="button"
                className={`split-mode-tab${mode === 'all' ? ' split-mode-tab--active' : ''}`}
                onClick={() => setMode('all')}
              >
                All pages
              </button>
              <button
                type="button"
                className={`split-mode-tab${mode === 'ranges' ? ' split-mode-tab--active' : ''}`}
                onClick={() => setMode('ranges')}
              >
                Custom ranges
              </button>
            </div>

            {mode === 'all' && (
              <p className="split-hint">
                Each of the {pageCount} pages will become its own PDF inside a ZIP archive.
              </p>
            )}

            {mode === 'ranges' && (
              <div className="form-field">
                <label className="form-label">Page ranges</label>
                <input
                  className={`form-input${rangeError ? ' form-input--error' : ''}`}
                  type="text"
                  placeholder={`e.g. 1-3, 5, 7-${Math.min(10, pageCount)}`}
                  value={ranges}
                  onChange={e => handleRangeChange(e.target.value)}
                  autoFocus
                />
                {rangeError
                  ? <span className="range-hint range-hint--error">⚠ {rangeError}</span>
                  : <span className="range-hint">Each comma-separated entry becomes a separate PDF in the ZIP.</span>
                }
              </div>
            )}
          </>
        )}

        <button
          className="submit-btn"
          type="submit"
          disabled={!canSubmit || loading}
        >
          {loading && <span className="spinner" />}
          {loading ? 'Splitting…' : 'Split PDF'}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {result && (
        <div className="result-card">
          <div className="result-card-top">
            <div className="result-card-icon">✂️</div>
            <div className="result-card-body">
              <p className="result-card-title">
                {result.segCount} PDF{result.segCount !== 1 ? 's' : ''} created
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
