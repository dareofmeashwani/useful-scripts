import { useState } from 'react'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import { formatSize } from '../utils'
import { buildIco } from '../utils/imageUtils'

const MAX_MB = 20
const ALLOWED_EXTS  = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i
const ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/tiff'])
const isImage = f => ALLOWED_TYPES.has(f.type) || ALLOWED_EXTS.test(f.name)

const ALL_SIZES = [16, 32, 48, 64, 128, 256]

export default function ImageToIco({ meta }) {
  const [file, setFile]           = useState(null)
  const [preview, setPreview]     = useState(null)
  const [fileError, setFileError] = useState(null)
  const [sizes, setSizes]         = useState(new Set([16, 32, 48, 64, 128, 256]))
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [result, setResult]       = useState(null)

  const handleFile = f => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null); setPreview(null); setFileError(null); setError(null); setResult(null)

    if (!f) return
    if (!isImage(f))                         { setFileError('Unsupported format'); return }
    if (f.size === 0)                        { setFileError('File is empty'); return }
    if (f.size > MAX_MB * 1024 * 1024)       { setFileError(`File too large (max ${MAX_MB} MB)`); return }

    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const toggleSize = s => setSizes(prev => {
    const next = new Set(prev)
    if (next.has(s)) {
      if (next.size === 1) return prev
      next.delete(s)
    } else {
      next.add(s)
    }
    return next
  })

  const handleSubmit = async e => {
    e.preventDefault()
    if (!file) return

    setLoading(true); setError(null); setResult(null)

    try {
      const blob = await buildIco(file, [...sizes])
      const url  = URL.createObjectURL(blob)
      const stem = file.name.replace(/\.[^.]+$/, '')
      setResult({ url, name: `${stem}.ico`, size: blob.size })
    } catch (err) {
      setError(err.message || 'Failed to generate ICO file')
    } finally {
      setLoading(false)
    }
  }

  const selectedSizes = [...sizes].sort((a, b) => a - b)

  return (
    <div className="tool-ui">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={handleSubmit}>
        <FileZone
          file={file}
          error={!!fileError}
          onSelect={handleFile}
          accept="image/*"
          hint="Click or drag an image here"
          subhint="JPG · PNG · WEBP · BMP · GIF · TIFF · max 20 MB"
        />
        {fileError && <div className="alert alert--error">{fileError}</div>}

        {preview && (
          <div className="ico-preview-row">
            <img className="ico-source-preview" src={preview} alt="source" />
            <div className="ico-preview-info">
              <span className="ico-preview-name">{file.name}</span>
              <span className="ico-preview-size">{formatSize(file.size)}</span>
            </div>
          </div>
        )}

        <div className="form-field">
          <label className="form-label">Sizes to embed in the .ico file</label>
          <div className="ico-sizes-grid">
            {ALL_SIZES.map(s => (
              <button
                key={s}
                type="button"
                className={`ico-size-btn${sizes.has(s) ? ' ico-size-btn--active' : ''}`}
                onClick={() => toggleSize(s)}
              >
                <span className="ico-size-num">{s}</span>
                <span className="ico-size-dim">{s}×{s}</span>
              </button>
            ))}
          </div>
          <span className="range-hint">
            {sizes.size} size{sizes.size !== 1 ? 's' : ''} selected — all embedded in one .ico file
          </span>
        </div>

        <button
          className="submit-btn"
          type="submit"
          disabled={!file || !!fileError || loading}
        >
          {loading && <span className="spinner" />}
          {loading ? 'Generating…' : 'Generate .ico'}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {result && (
        <div className="result-card">
          <div className="result-card-top">
            <div className="result-card-icon">🎨</div>
            <div className="result-card-body">
              <p className="result-card-title">
                ICO generated · {selectedSizes.join(', ')} px
              </p>
              <p className="result-card-name">{result.name} · {formatSize(result.size)}</p>
            </div>
          </div>
          <a className="download-btn" href={result.url} download={result.name}>
            ⬇ Download {result.name}
          </a>
        </div>
      )}
    </div>
  )
}
