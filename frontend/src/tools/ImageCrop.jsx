import { useState, useRef } from 'react'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import { formatSize } from '../utils'
import { canvasToBlob, imageDataToBmp } from '../utils/imageUtils'

const MAX_MB        = 20
const ALLOWED_EXTS  = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i
const ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/tiff'])
const isImage = f => ALLOWED_TYPES.has(f.type) || ALLOWED_EXTS.test(f.name)

const EXT_TO_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/png', bmp: null,
  tiff: 'image/png', tif: 'image/png',
}
const JPEG_QUALITY = { jpeg: 0.92, jpg: 0.92 }
const WEBP_QUALITY = { webp: 0.9 }

export default function ImageCrop({ meta }) {
  const [file,        setFile]        = useState(null)
  const [preview,     setPreview]     = useState(null)
  const [fileError,   setFileError]   = useState(null)
  const [naturalSize, setNaturalSize] = useState(null)

  const [overlayRect, setOverlayRect] = useState(null)
  const [cropBox, setCropBox] = useState(null)

  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [downloadUrl,  setDownloadUrl]  = useState(null)
  const [downloadName, setDownloadName] = useState('')
  const [downloadSize, setDownloadSize] = useState(null)

  const imgRef      = useRef(null)
  const draggingRef = useRef(false)
  const startPosRef = useRef(null)

  const handleSelect = f => {
    if (!f) return
    if (!isImage(f))                   { setFileError('Unsupported format'); return }
    if (f.size === 0)                  { setFileError('File is empty'); return }
    if (f.size > MAX_MB * 1024 * 1024) { setFileError(`Too large (max ${MAX_MB} MB)`); return }

    if (preview) URL.revokeObjectURL(preview)
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setFileError(null)
    setNaturalSize(null)
    setCropBox(null)
    setOverlayRect(null)
    setError(null)
    setDownloadUrl(null)
  }

  const getImgRelPos = (clientX, clientY) => {
    const img = imgRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    return {
      x:     Math.max(0, Math.min(clientX - rect.left, rect.width)),
      y:     Math.max(0, Math.min(clientY - rect.top,  rect.height)),
      rendW: rect.width,
      rendH: rect.height,
    }
  }

  const startDrag = (clientX, clientY) => {
    if (!naturalSize) return
    const pos = getImgRelPos(clientX, clientY)
    if (!pos) return
    draggingRef.current = true
    startPosRef.current = pos
    setCropBox(null)
    setOverlayRect({ x: pos.x, y: pos.y, w: 0, h: 0 })
    setError(null)
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null) }
  }

  const moveDrag = (clientX, clientY) => {
    if (!draggingRef.current || !startPosRef.current) return
    const pos   = getImgRelPos(clientX, clientY)
    const start = startPosRef.current
    if (!pos) return
    setOverlayRect({
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x),
      h: Math.abs(pos.y - start.y),
    })
  }

  const endDrag = (clientX, clientY) => {
    if (!draggingRef.current || !startPosRef.current) return
    draggingRef.current = false

    const pos   = getImgRelPos(clientX, clientY)
    const start = startPosRef.current
    if (!pos || !naturalSize) { setOverlayRect(null); return }

    const dispX = Math.min(start.x, pos.x)
    const dispY = Math.min(start.y, pos.y)
    const dispW = Math.abs(pos.x - start.x)
    const dispH = Math.abs(pos.y - start.y)

    if (dispW < 4 || dispH < 4) { setOverlayRect(null); return }

    const scaleX = naturalSize.w / pos.rendW
    const scaleY = naturalSize.h / pos.rendH

    setCropBox({
      x: Math.round(dispX * scaleX),
      y: Math.round(dispY * scaleY),
      w: Math.round(dispW * scaleX),
      h: Math.round(dispH * scaleY),
      dispX, dispY, dispW, dispH,
    })
    setOverlayRect({ x: dispX, y: dispY, w: dispW, h: dispH })
  }

  const onMouseDown  = e => { e.preventDefault(); startDrag(e.clientX, e.clientY) }
  const onMouseMove  = e => moveDrag(e.clientX, e.clientY)
  const onMouseUp    = e => endDrag(e.clientX, e.clientY)
  const onMouseLeave = e => endDrag(e.clientX, e.clientY)

  const onTouchStart = e => { e.preventDefault(); const t = e.touches[0]; startDrag(t.clientX, t.clientY) }
  const onTouchMove  = e => { e.preventDefault(); const t = e.touches[0]; moveDrag(t.clientX, t.clientY) }
  const onTouchEnd   = e => { const t = e.changedTouches[0]; endDrag(t.clientX, t.clientY) }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!file || !cropBox) return

    setLoading(true)
    setError(null)
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null) }

    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width  = cropBox.w
      canvas.height = cropBox.h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, cropBox.x, cropBox.y, cropBox.w, cropBox.h, 0, 0, cropBox.w, cropBox.h)
      bitmap.close()

      const ext  = file.name.split('.').pop().toLowerCase()
      const mime = EXT_TO_MIME[ext] || 'image/png'

      let blob
      if (ext === 'bmp') {
        blob = imageDataToBmp(ctx.getImageData(0, 0, cropBox.w, cropBox.h))
      } else {
        const q = JPEG_QUALITY[ext] ?? WEBP_QUALITY[ext]
        blob = await canvasToBlob(canvas, mime, q)
      }

      const outExt  = mime === 'image/jpeg' ? 'jpg' : (ext === 'bmp' ? 'bmp' : ext)
      const stem    = file.name.replace(/\.[^.]+$/, '')
      const name    = `${stem}_cropped.${outExt}`
      setDownloadName(name)
      setDownloadSize(blob.size)
      setDownloadUrl(URL.createObjectURL(blob))
    } catch (err) {
      setError(err.message || 'Failed to crop image')
    } finally {
      setLoading(false)
    }
  }

  const onImageLoad = e =>
    setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })

  const clearSelection = () => {
    setCropBox(null)
    setOverlayRect(null)
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null) }
  }

  const showOverlay = overlayRect && overlayRect.w > 2 && overlayRect.h > 2

  return (
    <div className="tool-ui">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={handleSubmit}>
        <FileZone
          file={file}
          error={!!fileError}
          onSelect={handleSelect}
          accept="image/*"
          hint="Click or drag an image here"
          subhint={`JPG · PNG · WEBP · BMP · GIF · max ${MAX_MB} MB`}
        />

        {fileError && <div className="alert alert--error">⚠ {fileError}</div>}

        {preview && (
          <div className="crop-section">
            <p className="crop-hint">
              {cropBox
                ? `Selection: ${cropBox.w} × ${cropBox.h} px  (at ${cropBox.x}, ${cropBox.y})`
                : 'Click and drag on the image to select a crop region'}
            </p>

            <div
              className="crop-container"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <img
                ref={imgRef}
                src={preview}
                alt="Preview"
                className="crop-image"
                onLoad={onImageLoad}
                draggable={false}
              />

              {showOverlay && (
                <>
                  <div className="crop-shade" style={{ top: 0, left: 0, right: 0, height: overlayRect.y }} />
                  <div className="crop-shade" style={{ top: overlayRect.y + overlayRect.h, left: 0, right: 0, bottom: 0 }} />
                  <div className="crop-shade" style={{ top: overlayRect.y, left: 0, width: overlayRect.x, height: overlayRect.h }} />
                  <div className="crop-shade" style={{ top: overlayRect.y, left: overlayRect.x + overlayRect.w, right: 0, height: overlayRect.h }} />
                  <div
                    className="crop-selection"
                    style={{
                      left:   overlayRect.x,
                      top:    overlayRect.y,
                      width:  overlayRect.w,
                      height: overlayRect.h,
                    }}
                  />
                </>
              )}
            </div>

            {cropBox && (
              <div className="crop-actions">
                <button type="button" className="clear-btn" onClick={clearSelection}>
                  Clear selection
                </button>
              </div>
            )}
          </div>
        )}

        <button className="submit-btn" type="submit" disabled={!file || !cropBox || loading}>
          {loading && <span className="spinner" />}
          {loading    ? 'Cropping…'
           : !file    ? 'Add an image to continue'
           : !cropBox ? 'Select a crop area first'
           :            'Crop image'}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {downloadUrl && (
        <div className="result-card">
          <img className="result-card-preview" src={downloadUrl} alt="Cropped preview" />
          <div className="result-card-top">
            <div className="result-card-icon">🔲</div>
            <div className="result-card-body">
              <p className="result-card-title">
                Cropped to {cropBox?.w} × {cropBox?.h} px
              </p>
              <p className="result-card-name">
                {downloadName}{downloadSize ? ` · ${formatSize(downloadSize)}` : ''}
              </p>
            </div>
          </div>
          <a className="download-btn" href={downloadUrl} download={downloadName}>
            ⬇ Download {downloadName}
          </a>
        </div>
      )}
    </div>
  )
}
