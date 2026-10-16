import { useState } from 'react'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import { formatSize } from '../utils'
import { canvasToBlob, imageDataToBmp } from '../utils/imageUtils'

const MAX_MB = 20
const FORMATS = ['PNG', 'JPG', 'WEBP', 'BMP']
const ALLOWED_EXTS  = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'image/gif',  'image/bmp', 'image/tiff',
])

const isImage = f => ALLOWED_TYPES.has(f.type) || ALLOWED_EXTS.test(f.name)

// Formats where the source alpha channel must be composited onto white
const OPAQUE_FORMATS = new Set(['JPG', 'BMP'])

const FORMAT_MIME = { PNG: 'image/png', JPG: 'image/jpeg', WEBP: 'image/webp' }
const FORMAT_EXT  = { PNG: 'png', JPG: 'jpg', WEBP: 'webp', BMP: 'bmp' }
const FORMAT_Q    = { JPG: 0.92, WEBP: 0.9 }

async function convertImage(file, fmt) {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (OPAQUE_FORMATS.has(fmt)) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  if (fmt === 'BMP') {
    return imageDataToBmp(ctx.getImageData(0, 0, width, height))
  }
  return canvasToBlob(canvas, FORMAT_MIME[fmt], FORMAT_Q[fmt])
}

export default function ImageConvert({ meta }) {
  const [file, setFile]               = useState(null)
  const [fileError, setFileError]     = useState(null)
  const [targetFormat, setTargetFormat] = useState('PNG')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [result, setResult]           = useState(null)

  const applyFile = f => {
    if (!isImage(f))                    { setFileError('Only image files are supported'); return }
    if (f.size === 0)                   { setFileError('File is empty'); return }
    if (f.size > MAX_MB * 1024 * 1024) { setFileError(`File too large (max ${MAX_MB} MB)`); return }
    setFile(f)
    setFileError(null)
    setResult(null)
    setError(null)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const blob = await convertImage(file, targetFormat)
      const url  = URL.createObjectURL(blob)
      const stem = file.name.replace(/\.[^/.]+$/, '')
      const ext  = FORMAT_EXT[targetFormat]
      setResult({ url, name: `${stem}.${ext}`, size: blob.size })
    } catch (err) {
      setError(err.message || 'Failed to convert image')
    } finally {
      setLoading(false)
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
          accept="image/*"
          hint="Click or drag an image here"
          subhint={`PNG · JPG · WEBP · BMP · GIF · TIFF · max ${MAX_MB} MB`}
        />
        {fileError && <div className="alert alert--error">{fileError}</div>}

        <div className="form-field">
          <label className="form-label">Convert to</label>
          <div className="format-grid">
            {FORMATS.map(fmt => (
              <button
                key={fmt}
                type="button"
                className={`format-btn${targetFormat === fmt ? ' format-btn--active' : ''}`}
                onClick={() => setTargetFormat(fmt)}
              >
                {fmt}
              </button>
            ))}
          </div>
          {OPAQUE_FORMATS.has(targetFormat) && (
            <p className="format-hint">⚠ {targetFormat} does not support transparency — alpha channel will be removed</p>
          )}
        </div>

        <button className="submit-btn" type="submit" disabled={!file || !!fileError || loading}>
          {loading && <span className="spinner" />}
          {loading ? 'Converting…' : `Convert to ${targetFormat}`}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {result && (
        <div className="result-card">
          <img className="result-card-preview" src={result.url} alt="Converted preview" />
          <div className="result-card-top">
            <div className="result-card-icon">🖼️</div>
            <div className="result-card-body">
              <p className="result-card-title">Converted to {targetFormat}</p>
              <p className="result-card-name">
                {result.name}{result.size ? ` · ${formatSize(result.size)}` : ''}
              </p>
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
