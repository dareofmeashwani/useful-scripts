import { useState, useCallback } from 'react'
import { PDFDocument } from 'pdf-lib'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import { formatSize } from '../utils'

const MAX_MB    = 50
const MAX_FILES = 20

function validateFile(f) {
  if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return 'Not a PDF'
  if (f.size === 0) return 'File is empty'
  if (f.size > MAX_MB * 1024 * 1024) return `Exceeds ${MAX_MB} MB limit`
  return null
}

let _seq = 0
const mkEntry = f => ({ id: String(++_seq), file: f, error: validateFile(f) })

export default function PdfMerge({ meta }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)

  const clearResult = () => {
    if (result?.url) URL.revokeObjectURL(result.url)
    setResult(null)
  }

  const addFiles = useCallback(list => {
    const incoming = Array.from(list).slice(0, MAX_FILES)
    setEntries(prev => {
      const combined = [...prev, ...incoming.map(mkEntry)]
      return combined.slice(0, MAX_FILES)
    })
    setError(null)
    clearResult()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = id => {
    setEntries(prev => prev.filter(e => e.id !== id))
    setError(null)
    clearResult()
  }

  const move = (id, dir) => setEntries(prev => {
    const i = prev.findIndex(e => e.id === id)
    const j = i + dir
    if (j < 0 || j >= prev.length) return prev
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const handleSubmit = async e => {
    e.preventDefault()
    const valid = entries.filter(e => !e.error)
    if (valid.length < 2) return

    setLoading(true)
    setError(null)
    clearResult()

    try {
      const merged = await PDFDocument.create()
      let totalPages = 0

      for (const { file } of valid) {
        let doc
        try {
          doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
        } catch {
          throw new Error(`Cannot read "${file.name}" — it may be password-protected or corrupted.`)
        }
        const pages = await merged.copyPages(doc, doc.getPageIndices())
        pages.forEach(p => merged.addPage(p))
        totalPages += doc.getPageCount()
      }

      const bytes = await merged.save()
      const url   = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      setResult({ url, name: 'merged.pdf', pageCount: totalPages, fileCount: valid.length })
    } catch (err) {
      setError(err.message || 'Failed to merge PDFs')
    } finally {
      setLoading(false)
    }
  }

  const validCount = entries.filter(e => !e.error).length
  const canSubmit  = validCount >= 2 && !loading

  return (
    <div className="tool-ui">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={handleSubmit}>
        <FileZone
          count={entries.length}
          multiple
          onSelect={addFiles}
          accept=".pdf,application/pdf"
          hint="Click or drag PDFs here"
          subhint={`Max ${MAX_MB} MB per file · up to ${MAX_FILES} files`}
        />

        {entries.length > 0 && (
          <ul className="merge-list">
            {entries.map((e, i) => (
              <li key={e.id} className={`merge-item${e.error ? ' merge-item--invalid' : ''}`}>
                <span className="merge-item-num">{i + 1}</span>
                <span className="merge-item-name" title={e.file.name}>{e.file.name}</span>
                <span className="merge-item-size">{formatSize(e.file.size)}</span>
                {e.error && <span className="merge-item-err">{e.error}</span>}
                <div className="merge-item-btns">
                  <button
                    type="button"
                    className="merge-btn"
                    onClick={() => move(e.id, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >↑</button>
                  <button
                    type="button"
                    className="merge-btn"
                    onClick={() => move(e.id, 1)}
                    disabled={i === entries.length - 1}
                    aria-label="Move down"
                  >↓</button>
                  <button
                    type="button"
                    className="merge-btn merge-btn--remove"
                    onClick={() => remove(e.id)}
                    aria-label="Remove"
                  >×</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {entries.length > 0 && validCount < entries.length && (
          <div className="alert alert--error">
            {entries.length - validCount} file{entries.length - validCount !== 1 ? 's' : ''} will be skipped — remove them or replace with valid PDFs.
          </div>
        )}

        <button className="submit-btn" type="submit" disabled={!canSubmit}>
          {loading && <span className="spinner" />}
          {loading
            ? 'Merging…'
            : validCount >= 2
              ? `Merge ${validCount} PDFs`
              : 'Add at least 2 PDFs'}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {result && (
        <div className="result-card">
          <div className="result-card-top">
            <div className="result-card-icon">📎</div>
            <div className="result-card-body">
              <p className="result-card-title">
                {result.fileCount} PDFs merged · {result.pageCount} page{result.pageCount !== 1 ? 's' : ''}
              </p>
              <p className="result-card-name">{result.name}</p>
            </div>
          </div>
          <a className="download-btn" href={result.url} download={result.name}>
            ⬇ Download PDF
          </a>
        </div>
      )}
    </div>
  )
}
