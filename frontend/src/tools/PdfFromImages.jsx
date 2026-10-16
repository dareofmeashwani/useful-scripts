import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import { formatSize } from '../utils'
import { canvasToBlob } from '../utils/imageUtils'

const MAX_FILES   = 50
const MAX_MB_EACH = 20
const ALLOWED_EXTS  = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'])

const isImage = f => ALLOWED_TYPES.has(f.type) || ALLOWED_EXTS.test(f.name)

// Embed a single image file into a PDFDocument and return the embedded image object.
// pdf-lib natively handles JPEG and PNG; everything else is converted to PNG via Canvas.
async function embedImage(pdfDoc, file) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (['jpg', 'jpeg'].includes(ext)) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    return pdfDoc.embedJpg(bytes)
  }

  // Convert to PNG via Canvas for all other formats (PNG, WebP, BMP, GIF, TIFF, …)
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  bitmap.close()

  const pngBlob = await canvasToBlob(canvas, 'image/png')
  const bytes = new Uint8Array(await pngBlob.arrayBuffer())
  return pdfDoc.embedPng(bytes)
}

export default function PdfFromImages({ meta }) {
  const [images, setImages]             = useState([])
  const [addError, setAddError]         = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
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
      const pdfDoc = await PDFDocument.create()

      for (const { file } of images) {
        const img  = await embedImage(pdfDoc, file)
        const page = pdfDoc.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      }

      const pdfBytes = await pdfDoc.save()
      const blob     = new Blob([pdfBytes], { type: 'application/pdf' })
      setDownloadUrl(URL.createObjectURL(blob))
      setDownloadSize(blob.size)
    } catch (err) {
      setError(err.message || 'Failed to create PDF')
    } finally {
      setLoading(false)
    }
  }

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

        <button className="submit-btn" type="submit" disabled={count === 0 || loading}>
          {loading && <span className="spinner" />}
          {loading ? 'Creating PDF…' : count === 0 ? 'Add images to continue' : `Create PDF from ${count} image${count !== 1 ? 's' : ''}`}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {downloadUrl && (
        <div className="result-card">
          <div className="result-card-top">
            <div className="result-card-icon">📄</div>
            <div className="result-card-body">
              <p className="result-card-title">PDF created from {count} image{count !== 1 ? 's' : ''}</p>
              <p className="result-card-name">
                images.pdf{downloadSize ? ` · ${formatSize(downloadSize)}` : ''}
              </p>
            </div>
          </div>
          <a className="download-btn" href={downloadUrl} download="images.pdf">
            ⬇ Download images.pdf
          </a>
        </div>
      )}
    </div>
  )
}
