import { useState } from 'react'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import { formatSize } from '../utils'
import { canvasToBlob, imageDataToBmp } from '../utils/imageUtils'
import { zipSync } from 'fflate'

const MAX_FILES   = 50
const MAX_MB_EACH = 20
const ALLOWED_EXTS  = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i
const ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/tiff'])
const isImage = f => ALLOWED_TYPES.has(f.type) || ALLOWED_EXTS.test(f.name)

const SIZE_PRESETS = [64, 128, 256, 512]

const FORMATS = [
  { id: 'keep', label: 'Keep original' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'webp', label: 'WebP' },
  { id: 'png',  label: 'PNG'  },
]

const FMT_MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' }
const FMT_EXT  = { jpeg: 'jpg', webp: 'webp', png: 'png' }
const FMT_Q    = { jpeg: 0.88, webp: 0.85 }

const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', bmp: null, gif: 'image/png',
  tiff: 'image/png', tif: 'image/png',
}

async function makeThumbnail(file, size, fmt) {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap

  const ratio = Math.min(size / width, size / height)
  const nw = Math.max(1, Math.round(width  * ratio))
  const nh = Math.max(1, Math.round(height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = nw
  canvas.height = nh
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, nw, nh)
  bitmap.close()

  const ext  = file.name.split('.').pop().toLowerCase()
  const mime = fmt === 'keep' ? (EXT_MIME[ext] || 'image/png') : FMT_MIME[fmt]
  const outExt = fmt === 'keep' ? (mime === 'image/jpeg' ? 'jpg' : ext) : FMT_EXT[fmt]
  const quality = FMT_Q[fmt]

  let blob
  if (fmt === 'keep' && ext === 'bmp') {
    blob = imageDataToBmp(ctx.getImageData(0, 0, nw, nh))
  } else {
    blob = await canvasToBlob(canvas, mime, quality)
  }

  const stem = file.name.replace(/\.[^.]+$/, '')
  return { blob, name: `${stem}_thumb.${outExt}` }
}

export default function ImageThumbnail({ meta }) {
  const [images, setImages]       = useState([])
  const [addError, setAddError]   = useState(null)
  const [size, setSize]           = useState(256)
  const [customSize, setCustomSize] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [fmt, setFmt]             = useState('keep')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [result, setResult]       = useState(null)

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
      const next = [...prev, ...valid.map(f => ({ id: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f) }))]
      if (next.length > MAX_FILES) { errors.push(`Too many files — max ${MAX_FILES}`); return prev }
      return next
    })
    setAddError(errors.length ? errors.join('\n') : null)
    setResult(null)
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
    setResult(null)
    setError(null)
  }

  const effectiveSize = useCustom ? (parseInt(customSize, 10) || 0) : size
  const customSizeValid = !useCustom || (parseInt(customSize, 10) >= 8 && parseInt(customSize, 10) <= 4096)

  const handleSubmit = async e => {
    e.preventDefault()
    if (!images.length || !customSizeValid) return

    setLoading(true)
    setError(null)
    if (result?.url) URL.revokeObjectURL(result.url)
    setResult(null)

    try {
      const thumbs = await Promise.all(images.map(img => makeThumbnail(img.file, effectiveSize, fmt)))
      const single = images.length === 1

      let url, name, size_
      if (single) {
        url   = URL.createObjectURL(thumbs[0].blob)
        name  = thumbs[0].name
        size_ = thumbs[0].blob.size
      } else {
        const zipFiles = {}
        for (const { blob, name: n } of thumbs) zipFiles[n] = new Uint8Array(await blob.arrayBuffer())
        const zipped = zipSync(zipFiles, { level: 0 })
        const zipBlob = new Blob([zipped], { type: 'application/zip' })
        url   = URL.createObjectURL(zipBlob)
        name  = 'thumbnails.zip'
        size_ = zipBlob.size
      }

      setResult({ url, name, count: images.length, size: size_, single })
    } catch (err) {
      setError(err.message || 'Failed to generate thumbnails')
    } finally {
      setLoading(false)
    }
  }

  const count     = images.length
  const canSubmit = count > 0 && !loading && customSizeValid && effectiveSize >= 8

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
          subhint={`JPG · PNG · WEBP · BMP · GIF · TIFF · max ${MAX_MB_EACH} MB each`}
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
          <label className="form-label">Max dimension (px) — longest side fits within this</label>
          <div className="thumb-size-row">
            {SIZE_PRESETS.map(p => (
              <button
                key={p}
                type="button"
                className={`format-btn${!useCustom && size === p ? ' format-btn--active' : ''}`}
                onClick={() => { setSize(p); setUseCustom(false) }}
              >
                {p}
              </button>
            ))}
            <div className={`thumb-custom-field${useCustom ? ' thumb-custom-field--active' : ''}`}>
              <input
                type="number"
                className="dim-input"
                placeholder="Custom"
                min={8}
                max={4096}
                value={customSize}
                onFocus={() => setUseCustom(true)}
                onChange={e => { setCustomSize(e.target.value); setUseCustom(true) }}
              />
              <span className="dim-label" style={{ fontSize: '0.75rem', paddingRight: 10 }}>px</span>
            </div>
          </div>
          {useCustom && !customSizeValid && (
            <span className="range-hint range-hint--error">⚠ Enter a value between 8 and 4096</span>
          )}
        </div>

        <div className="form-field">
          <label className="form-label">Output format</label>
          <div className="format-grid">
            {FORMATS.map(f => (
              <button
                key={f.id}
                type="button"
                className={`format-btn${fmt === f.id ? ' format-btn--active' : ''}`}
                onClick={() => setFmt(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button className="submit-btn" type="submit" disabled={!canSubmit}>
          {loading && <span className="spinner" />}
          {loading
            ? 'Generating…'
            : count === 0
              ? 'Add images to continue'
              : `Generate ${count} thumbnail${count !== 1 ? 's' : ''}`}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {result && (
        <div className="result-card">
          <div className="result-card-top">
            <div className="result-card-icon">🖼</div>
            <div className="result-card-body">
              <p className="result-card-title">
                {result.count} thumbnail{result.count !== 1 ? 's' : ''} generated · {effectiveSize}px
              </p>
              <p className="result-card-name">{result.name} · {formatSize(result.size)}</p>
            </div>
          </div>
          <a
            className="download-btn"
            href={result.url}
            download={result.name}
          >
            ⬇ Download {result.single ? 'thumbnail' : 'ZIP'}
          </a>
        </div>
      )}
    </div>
  )
}
