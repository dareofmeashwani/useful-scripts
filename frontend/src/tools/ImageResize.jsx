import { useState } from 'react'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import { formatSize } from '../utils'
import { canvasToBlob, imageDataToBmp } from '../utils/imageUtils'
import { zipSync } from 'fflate'

const MAX_FILES   = 50
const MAX_MB_EACH = 20
const ALLOWED_EXTS  = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'])
const isImage = f => ALLOWED_TYPES.has(f.type) || ALLOWED_EXTS.test(f.name)

const MODES = ['Percentage', 'Fixed']

// Map file extension to MIME type for canvas.toBlob
const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', bmp: null, gif: 'image/png',
  tiff: 'image/png', tif: 'image/png',
}
const EXT_Q = { jpg: 0.92, jpeg: 0.92, webp: 0.9 }

async function resizeOne(file, newW, newH) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = newW
  canvas.height = newH
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, newW, newH)
  bitmap.close()

  const ext  = file.name.split('.').pop().toLowerCase()
  const mime = EXT_MIME[ext] || 'image/png'

  if (ext === 'bmp') return imageDataToBmp(ctx.getImageData(0, 0, newW, newH))
  return canvasToBlob(canvas, mime, EXT_Q[ext])
}

function computeSize(ow, oh, mode, percent, width, height, keepAspect) {
  if (mode === 'Percentage') {
    return { nw: Math.max(1, Math.round(ow * percent / 100)), nh: Math.max(1, Math.round(oh * percent / 100)) }
  }
  if (keepAspect) {
    if (width > 0 && height > 0) {
      const ratio = Math.min(width / ow, height / oh)
      return { nw: Math.max(1, Math.round(ow * ratio)), nh: Math.max(1, Math.round(oh * ratio)) }
    }
    if (width > 0) return { nw: width, nh: Math.max(1, Math.round(oh * width / ow)) }
    return { nw: Math.max(1, Math.round(ow * height / oh)), nh: height }
  }
  return { nw: width > 0 ? width : ow, nh: height > 0 ? height : oh }
}

export default function ImageResize({ meta }) {
  const [images, setImages]         = useState([])
  const [addError, setAddError]     = useState(null)
  const [mode, setMode]             = useState('Percentage')
  const [percent, setPercent]       = useState(50)
  const [width, setWidth]           = useState('')
  const [height, setHeight]         = useState('')
  const [keepAspect, setKeepAspect] = useState(true)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [downloadUrl, setDownloadUrl]   = useState(null)
  const [downloadSize, setDownloadSize] = useState(null)

  const addFiles = fileList => {
    const errors = []
    const valid  = []
    for (const f of Array.from(fileList)) {
      if (!isImage(f))                         { errors.push(`${f.name}: unsupported format`); continue }
      if (f.size === 0)                        { errors.push(`${f.name}: file is empty`); continue }
      if (f.size > MAX_MB_EACH * 1024 * 1024) { errors.push(`${f.name}: too large (max ${MAX_MB_EACH} MB)`); continue }
      valid.push(f)
    }
    setImages(prev => {
      const next = [
        ...prev,
        ...valid.map(f => ({ id: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f) })),
      ]
      if (next.length > MAX_FILES) { errors.push(`Too many files — max ${MAX_FILES}`); return prev }
      return next
    })
    setAddError(errors.length ? errors.join('\n') : null)
    setDownloadUrl(null)
    setError(null)
  }

  const removeImage = id => {
    setImages(prev => {
      const img = prev.find(i => i.id === id)
      if (img) URL.revokeObjectURL(img.preview)
      return prev.filter(i => i.id !== id)
    })
  }

  const clearAll = () => {
    images.forEach(i => URL.revokeObjectURL(i.preview))
    setImages([])
    setAddError(null)
    setDownloadUrl(null)
    setError(null)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!images.length) return

    setLoading(true)
    setError(null)
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null) }

    try {
      const zipFiles = {}
      for (const { file } of images) {
        const bitmap = await createImageBitmap(file)
        const ow = bitmap.width
        const oh = bitmap.height
        bitmap.close()

        const { nw, nh } = computeSize(ow, oh, mode, percent, Number(width), Number(height), keepAspect)
        const blob = await resizeOne(file, nw, nh)
        zipFiles[file.name] = new Uint8Array(await blob.arrayBuffer())
      }

      const zipped = zipSync(zipFiles, { level: 0 })
      const zipBlob = new Blob([zipped], { type: 'application/zip' })
      setDownloadUrl(URL.createObjectURL(zipBlob))
      setDownloadSize(zipBlob.size)
    } catch (err) {
      setError(err.message || 'Failed to resize images')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = images.length > 0 && !loading && (
    mode === 'Percentage' || (width || height)
  )

  const count = images.length

  return (
    <div className="tool-ui">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={handleSubmit}>
        <FileZone
          multiple
          count={count}
          error={!!addError}
          onSelect={addFiles}
          accept="image/*"
          hint="Click or drag images here"
          subhint={`JPG · PNG · WEBP · BMP · GIF · max ${MAX_MB_EACH} MB each · up to ${MAX_FILES} files`}
        />

        {addError && (
          <div className="alert alert--error" style={{ whiteSpace: 'pre-line' }}>{addError}</div>
        )}

        {count > 0 && (
          <div className="img-list">
            <div className="img-list-header">
              <span>{count} image{count !== 1 ? 's' : ''} selected</span>
              <button type="button" className="clear-btn" onClick={clearAll}>Clear all</button>
            </div>
            {images.map((img, i) => (
              <div key={img.id} className="img-row">
                <span className="img-num">{i + 1}</span>
                <img className="img-thumb" src={img.preview} alt={img.file.name} />
                <div className="img-info">
                  <span className="img-name">{img.file.name}</span>
                  <span className="img-size">{formatSize(img.file.size)}</span>
                </div>
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => removeImage(img.id)}
                  aria-label={`Remove ${img.file.name}`}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="form-field">
          <label className="form-label">Resize mode</label>
          <div className="format-grid">
            {MODES.map(m => (
              <button
                key={m}
                type="button"
                className={`format-btn${mode === m ? ' format-btn--active' : ''}`}
                onClick={() => { setMode(m); setDownloadUrl(null) }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {mode === 'Percentage' && (
          <div className="form-field">
            <label className="form-label">
              Scale — <strong>{percent}%</strong>
              {percent < 100 ? '  (shrink)' : percent > 100 ? '  (enlarge)' : '  (original size)'}
            </label>
            <div className="slider-wrap">
              <span className="slider-tick">1%</span>
              <input
                type="range"
                className="range-slider"
                min={1}
                max={500}
                value={percent}
                onChange={e => setPercent(Number(e.target.value))}
              />
              <span className="slider-tick">500%</span>
            </div>
            <div className="slider-presets">
              {[25, 50, 75, 100, 150, 200].map(p => (
                <button
                  key={p}
                  type="button"
                  className={`format-btn${percent === p ? ' format-btn--active' : ''}`}
                  onClick={() => setPercent(p)}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'Fixed' && (
          <div className="form-field">
            <label className="form-label">Dimensions (px)</label>
            <div className="resize-dims">
              <div className="dim-field">
                <span className="dim-label">W</span>
                <input
                  type="number"
                  className="dim-input"
                  placeholder="Width"
                  min={1} max={8000}
                  value={width}
                  onChange={e => setWidth(e.target.value)}
                />
              </div>
              <span className="dim-sep">×</span>
              <div className="dim-field">
                <span className="dim-label">H</span>
                <input
                  type="number"
                  className="dim-input"
                  placeholder="Height"
                  min={1} max={8000}
                  value={height}
                  onChange={e => setHeight(e.target.value)}
                />
              </div>
              <label className="aspect-lock">
                <input
                  type="checkbox"
                  checked={keepAspect}
                  onChange={e => setKeepAspect(e.target.checked)}
                />
                <span>Lock aspect ratio</span>
              </label>
            </div>
            {keepAspect && (
              <p className="format-hint" style={{ color: 'var(--muted)' }}>
                Each image will scale to fit within the given dimension(s) while preserving its ratio.
              </p>
            )}
          </div>
        )}

        <button className="submit-btn" type="submit" disabled={!canSubmit}>
          {loading && <span className="spinner" />}
          {loading
            ? 'Resizing…'
            : count === 0
              ? 'Add images to continue'
              : `Resize ${count} image${count !== 1 ? 's' : ''}`}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {downloadUrl && (
        <div className="result-card">
          <div className="result-card-top">
            <div className="result-card-icon">📐</div>
            <div className="result-card-body">
              <p className="result-card-title">{count} image{count !== 1 ? 's' : ''} resized</p>
              <p className="result-card-name">
                resized_images.zip{downloadSize ? ` · ${formatSize(downloadSize)}` : ''}
              </p>
            </div>
          </div>
          <a className="download-btn" href={downloadUrl} download="resized_images.zip">
            ⬇ Download resized_images.zip
          </a>
        </div>
      )}
    </div>
  )
}
