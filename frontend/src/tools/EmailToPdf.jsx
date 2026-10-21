import { useState } from 'react'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import { formatSize, humanizeNetworkError } from '../utils'

// ── MIME parsing ──────────────────────────────────────────────────────────────

function decodeRfc2047(val) {
  if (!val || !val.includes('=?')) return val || ''
  return val.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, charset, enc, text) => {
    try {
      let bytes
      if (enc.toUpperCase() === 'B') {
        bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0))
      } else {
        const s = text.replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        bytes = Uint8Array.from(s, c => c.charCodeAt(0))
      }
      return new TextDecoder(charset).decode(bytes)
    } catch { return text }
  })
}

function parseHeaders(raw) {
  const map = {}
  const unfolded = raw.replace(/\r\n/g, '\n').replace(/\n(?=[ \t])/g, ' ')
  for (const line of unfolded.split('\n')) {
    const i = line.indexOf(':')
    if (i < 1) continue
    const key = line.slice(0, i).toLowerCase().trim()
    const val = line.slice(i + 1).trim()
    if (!map[key]) map[key] = val
  }
  return map
}

function decodeBodyText(raw, encoding, charset = 'utf-8') {
  const enc = (encoding || '').toLowerCase().trim()
  if (enc === 'base64') {
    try {
      const bytes = Uint8Array.from(atob(raw.replace(/\s/g, '')), c => c.charCodeAt(0))
      return new TextDecoder(charset).decode(bytes)
    } catch { return raw }
  }
  if (enc === 'quoted-printable') {
    try {
      const s = raw.replace(/=\r?\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      return new TextDecoder(charset).decode(Uint8Array.from(s, c => c.charCodeAt(0)))
    } catch { return raw }
  }
  return raw
}

function decodeBodyBytes(raw, encoding) {
  const enc = (encoding || '').toLowerCase().trim()
  if (enc === 'base64') {
    try {
      return Uint8Array.from(atob(raw.replace(/\s/g, '')), c => c.charCodeAt(0))
    } catch { return new Uint8Array(0) }
  }
  if (enc === 'quoted-printable') {
    const s = raw.replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    return Uint8Array.from(s, c => c.charCodeAt(0))
  }
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

// Returns { plain, html, images }
function parseMultipart(rawBody, boundary, depth = 0) {
  if (depth > 6) return { plain: '', html: '', images: [] }

  const esc   = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = rawBody.split(new RegExp(`--${esc}(?:--)?[ \t]*\r?\n`))
  let plain = '', html = ''
  const images = []

  for (const part of parts) {
    if (!part.trim()) continue
    const norm = part.replace(/\r\n/g, '\n')
    const sep  = norm.indexOf('\n\n')
    if (sep < 0) continue

    const ph   = parseHeaders(norm.slice(0, sep))
    const pb   = norm.slice(sep + 2)
    const pct  = ph['content-type'] || ''
    const disp = ph['content-disposition'] || ''
    const enc  = ph['content-transfer-encoding'] || ''

    if (pct.includes('multipart')) {
      const nb = (pct.match(/boundary=["']?([^"';\s]+)["']?/i) || [])[1]
      if (nb) {
        const nested = parseMultipart(pb, nb, depth + 1)
        if (!plain && nested.plain) plain = nested.plain
        if (!html  && nested.html)  html  = nested.html
        images.push(...nested.images)
      }
    } else if (pct.startsWith('image/')) {
      const bytes = decodeBodyBytes(pb, enc)
      if (bytes.length > 0) {
        const rawName = (disp.match(/filename\*?=["']?(?:.*'')?([^"';\r\n]+)/i) ||
                         pct.match(/name\*?=["']?(?:.*'')?([^"';\r\n]+)/i) || [])[1]
        let name = 'image'
        if (rawName) {
          try { name = decodeRfc2047(decodeURIComponent(rawName.trim())) }
          catch { name = decodeRfc2047(rawName.trim()) }
        }
        const cid = (ph['content-id'] || '').replace(/[<>\s]/g, '')
        images.push({ cid, name, mimeType: pct.split(';')[0].trim(), bytes })
      }
    } else if (pct.includes('text/plain') && !disp.includes('attachment') && !plain) {
      const cs = (pct.match(/charset=["']?([^"';\s]+)/i) || [])[1] || 'utf-8'
      plain = decodeBodyText(pb, enc, cs)
    } else if (pct.includes('text/html') && !disp.includes('attachment') && !html) {
      const cs = (pct.match(/charset=["']?([^"';\s]+)/i) || [])[1] || 'utf-8'
      html = decodeBodyText(pb, enc, cs)
    }
  }

  return { plain, html, images }
}

// Returns { subject, from, to, cc, date, replyTo, rawHtml, rawPlain, images }
function parseEml(text) {
  const norm = text.replace(/\r\n/g, '\n')
  const sep  = norm.indexOf('\n\n')
  const rawHeaders = sep >= 0 ? norm.slice(0, sep) : norm
  const rawBody    = sep >= 0 ? norm.slice(sep + 2) : ''

  const headers = parseHeaders(rawHeaders)
  const ct  = headers['content-type'] || 'text/plain'
  const enc = headers['content-transfer-encoding'] || ''

  let rawHtml = '', rawPlain = '', images = []

  if (ct.includes('multipart')) {
    const boundary = (ct.match(/boundary=["']?([^"';\s]+)["']?/i) || [])[1]
    if (boundary) {
      const result = parseMultipart(rawBody, boundary)
      rawHtml  = result.html
      rawPlain = result.plain
      images   = result.images
    } else {
      rawPlain = rawBody
    }
  } else {
    const cs = (ct.match(/charset=["']?([^"';\s]+)/i) || [])[1] || 'utf-8'
    const decoded = decodeBodyText(rawBody, enc, cs)
    if (ct.includes('text/html')) rawHtml = decoded
    else rawPlain = decoded
  }

  return {
    subject: decodeRfc2047(headers['subject']) || '(no subject)',
    from:    decodeRfc2047(headers['from'])    || '',
    to:      decodeRfc2047(headers['to'])      || '',
    cc:      decodeRfc2047(headers['cc'])      || '',
    date:    headers['date']                   || '',
    replyTo: decodeRfc2047(headers['reply-to'])|| '',
    rawHtml,
    rawPlain,
    images,
  }
}

// ── HTML rendering helpers ────────────────────────────────────────────────────

function escRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Convert raw bytes to a data: URI for embedding in HTML
function toDataUri(bytes, mimeType) {
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return `data:${mimeType};base64,${btoa(binary)}`
}

// Build a self-contained HTML fragment that visually replicates the email.
// Images: cid: refs replaced with data URIs.
// Returns HTML string ready for injection into a container div.
function buildEmailViewHtml(parsed) {
  let bodyHtml = parsed.rawHtml || ''

  // Swap cid: references for inline data URIs
  for (const img of parsed.images) {
    if (!img.cid) continue
    bodyHtml = bodyHtml.replace(
      new RegExp(`cid:${escRegex(img.cid)}`, 'gi'),
      toDataUri(img.bytes, img.mimeType)
    )
  }

  // Extract <style> blocks (from <head> or anywhere) before stripping structure
  const extractedStyles = []
  bodyHtml = bodyHtml.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    extractedStyles.push(css)
    return ''
  })

  // Extract <body> content; fall back to full string minus structural tags
  const bodyMatch = bodyHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/is)
  let emailContent = bodyMatch
    ? bodyMatch[1]
    : bodyHtml.replace(/<\/?(?:html|head|body|meta|link|title|base)[^>]*>/gi, '')

  // Plain-text fallback
  if (!emailContent.trim() && parsed.rawPlain) {
    emailContent = `<pre style="margin:0;font-size:14px;white-space:pre-wrap;word-break:break-word;font-family:inherit;">${escHtml(parsed.rawPlain)}</pre>`
  }

  // Metadata rows HTML
  const rows = [
    ['FROM', parsed.from],
    ['TO',   parsed.to],
    ['DATE', parsed.date],
    ['CC',   parsed.cc],
  ].filter(([, v]) => v?.trim()).map(([k, v]) => `
    <tr>
      <td style="color:#888;font-size:11px;font-weight:700;letter-spacing:.5px;white-space:nowrap;padding:3px 12px 3px 0;vertical-align:top;">${k}</td>
      <td style="color:#333;font-size:13px;word-break:break-word;">${escHtml(v)}</td>
    </tr>`).join('')

  const styles = extractedStyles.join('\n')

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;width:100%;box-sizing:border-box;">

  <!-- Header -->
  <div style="padding:22px 28px 18px;border-bottom:2px solid #e8e8e8;background:#fff;">
    <div style="font-size:21px;font-weight:700;color:#111;line-height:1.35;margin:0 0 12px;word-break:break-word;">${escHtml(parsed.subject || '(no subject)')}</div>
    ${rows ? `<table style="border-collapse:collapse;font-family:inherit;">${rows}</table>` : ''}
  </div>

  <!-- Email body — original styles + content -->
  <style>
    .eml-body img  { max-width:100%!important; height:auto!important; }
    .eml-body table{ max-width:100%!important; }
    ${styles}
  </style>
  <div class="eml-body" style="padding:20px 28px 28px;">
    ${emailContent}
  </div>
</div>`
}

// ── html2canvas rendering ─────────────────────────────────────────────────────

// Render an HTML fragment into a canvas at A4 width (794px = 72pt/in × 8.27in at 96dpi)
async function renderToCanvas(html, widthPx) {
  const h2c = (await import('html2canvas')).default

  const wrap = document.createElement('div')
  Object.assign(wrap.style, {
    position: 'fixed',
    top: '0',
    left: '-99999px',
    width: `${widthPx}px`,
    background: '#fff',
    overflow: 'visible',
  })
  wrap.innerHTML = html
  document.body.appendChild(wrap)

  try {
    // Wait for any images to decode
    await Promise.all(
      [...wrap.querySelectorAll('img')].map(el =>
        el.complete
          ? el.decode?.().catch(() => {}) ?? Promise.resolve()
          : new Promise(r => { el.onload = r; el.onerror = r })
      )
    )
    // Two animation frames to let the browser finish layout
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

    return await h2c(wrap, {
      scale: 2,             // 2× pixel density → ~192 dpi at A4 width
      useCORS: false,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      width: widthPx,
      height: wrap.scrollHeight,
      windowWidth: widthPx,
    })
  } finally {
    document.body.removeChild(wrap)
  }
}

// ── Canvas → PDF (A4 pages) ───────────────────────────────────────────────────

async function canvasToPdf(canvas) {
  const { PDFDocument } = await import('pdf-lib')

  const A4_W = 595.28    // points
  const A4_H = 841.89    // points

  // pixels-per-point: canvas was rendered at 2× a 794px-wide container
  // 794px × 2 = 1588px canvas width = 595.28pt  →  pxPerPt = 1588 / 595.28
  const pxPerPt = canvas.width / A4_W
  const pageHPx = Math.round(A4_H * pxPerPt)   // how many canvas pixels = one A4 page

  const doc  = await PDFDocument.create()
  const pages = Math.ceil(canvas.height / pageHPx)

  for (let i = 0; i < pages; i++) {
    const srcY = i * pageHPx
    const srcH = Math.min(pageHPx, canvas.height - srcY)

    // Slice the canvas into a page strip
    const slice = Object.assign(document.createElement('canvas'), {
      width: canvas.width, height: srcH,
    })
    slice.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)

    // Convert to JPEG (smaller than PNG for photo content)
    const dataUrl  = slice.toDataURL('image/jpeg', 0.93)
    const imgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0))

    const page   = doc.addPage([A4_W, A4_H])
    const pdfImg = await doc.embedJpg(imgBytes)
    const imgPtH = srcH / pxPerPt

    // Draw from top of page (PDF y=0 is bottom, so anchor at pageHeight - imgHeight)
    page.drawImage(pdfImg, { x: 0, y: A4_H - imgPtH, width: A4_W, height: imgPtH })
  }

  return await doc.save()
}

// ── Plain-text fallback (pdf-lib, for emails with no HTML body) ───────────────

function sanitize(s) {
  return [...(s || '')].map(c => {
    const n = c.charCodeAt(0)
    if (n === 160) return ' '
    if ((n >= 32 && n <= 126) || (n >= 161 && n <= 255)) return c
    if (n === 9) return '  '
    return '?'
  }).join('')
}

function wrapToLines(text, font, sz, maxW) {
  const lines = []
  for (const para of text.split('\n')) {
    if (!para.trim()) { lines.push(''); continue }
    const safe  = sanitize(para)
    const words = safe.split(' ').filter(Boolean)
    let cur = ''
    for (let w of words) {
      while (w && font.widthOfTextAtSize(w, sz) > maxW) {
        let k = w.length - 1
        while (k > 0 && font.widthOfTextAtSize(w.slice(0, k), sz) > maxW) k--
        k = Math.max(1, k)
        if (cur) { lines.push(cur); cur = '' }
        lines.push(w.slice(0, k))
        w = w.slice(k)
      }
      if (!w) continue
      const cand = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(cand, sz) > maxW && cur) { lines.push(cur); cur = w }
      else cur = cand
    }
    if (cur) lines.push(cur)
  }
  return lines
}

async function plainTextToPdf(parsed) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')

  const doc  = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const PW = 595.28, PH = 841.89, M = 56, CW = PW - 2 * M
  let pg = doc.addPage([PW, PH])
  let cy = PH - M

  const bp   = () => { pg = doc.addPage([PW, PH]); cy = PH - M }
  const gd   = h => { if (cy - h < M) bp() }

  const drawLines = (lines, f, sz, clr, xOff = 0) => {
    const lh = sz * 1.5
    for (const ln of lines) {
      if (!ln) { cy -= lh * 0.45; if (cy < M) bp(); continue }
      gd(lh)
      pg.drawText(ln, { x: M + xOff, y: cy, size: sz, font: f, color: clr })
      cy -= lh
    }
  }

  const drawText = (t, f, sz, clr, xOff = 0) =>
    drawLines(wrapToLines(t, f, sz, CW - xOff), f, sz, clr, xOff)

  const drawHeaderRow = (label, value) => {
    if (!value?.trim()) return
    const sz = 9, lh = sz * 1.5
    const lText  = label + ':'
    const lW     = bold.widthOfTextAtSize(lText, sz) + 6
    const vLines = wrapToLines(value, font, sz, CW - lW)
    if (!vLines.length) return
    if (cy - vLines.filter(Boolean).length * lh < M) bp()
    const startY = cy
    gd(lh)
    pg.drawText(lText, { x: M, y: startY, size: sz, font: bold, color: rgb(0.42, 0.42, 0.42) })
    let vy = startY
    for (const ln of vLines) {
      if (!ln) { vy -= lh * 0.35; continue }
      if (vy < M) { bp(); vy = cy }
      pg.drawText(ln, { x: M + lW, y: vy, size: sz, font, color: rgb(0.08, 0.08, 0.08) })
      vy -= lh
    }
    cy = vy - 1
  }

  const hline = () => {
    gd(14)
    pg.drawLine({ start: { x: M, y: cy - 3 }, end: { x: PW - M, y: cy - 3 }, thickness: 0.5, color: rgb(0.72, 0.72, 0.72) })
    cy -= 14
  }

  drawText(parsed.subject || '(no subject)', bold, 15, rgb(0.07, 0.07, 0.07))
  cy -= 10
  drawHeaderRow('From',     parsed.from)
  drawHeaderRow('To',       parsed.to)
  drawHeaderRow('Date',     parsed.date)
  drawHeaderRow('CC',       parsed.cc)
  drawHeaderRow('Reply-To', parsed.replyTo)
  cy -= 6
  hline()
  cy -= 8
  drawText((parsed.rawPlain || '(empty)').replace(/\n{3,}/g, '\n\n').trim(), font, 10, rgb(0.18, 0.18, 0.18))

  return await doc.save()
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function generatePdf(parsed) {
  if (parsed.rawHtml) {
    // HTML email: render via browser engine → capture → paginate
    const viewHtml = buildEmailViewHtml(parsed)
    const canvas   = await renderToCanvas(viewHtml, 794)
    return await canvasToPdf(canvas)
  }
  // Plain-text email: use pdf-lib text renderer (searchable, compact)
  return await plainTextToPdf(parsed)
}

// ── React component ────────────────────────────────────────────────────────────

export default function EmailToPdf({ meta }) {
  const [file, setFile]                 = useState(null)
  const [fileError, setFileError]       = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [downloadUrl, setDownloadUrl]   = useState(null)
  const [downloadName, setDownloadName] = useState('')
  const [downloadSize, setDownloadSize] = useState(null)

  const applyFile = f => {
    if (!f.name.match(/\.eml$/i)) { setFileError('Only .eml files are supported'); return }
    if (f.size === 0)               { setFileError('File is empty'); return }
    if (f.size > 50 * 1024 * 1024) { setFileError('File too large (max 50 MB)'); return }
    setFile(f); setFileError(null); setDownloadUrl(null); setError(null)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!file) return
    setLoading(true); setError(null); setDownloadUrl(null)

    try {
      const text   = await file.text()
      const parsed = parseEml(text)
      const bytes  = await generatePdf(parsed)
      const blob   = new Blob([bytes], { type: 'application/pdf' })
      setDownloadUrl(URL.createObjectURL(blob))
      setDownloadName(file.name.replace(/\.eml$/i, '') + '.pdf')
      setDownloadSize(blob.size)
    } catch (err) {
      setError(humanizeNetworkError(err) || 'Failed to convert email to PDF')
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
          accept=".eml"
          hint="Click or drag an .eml email file here"
          subhint=".eml · Max 50 MB"
        />
        {fileError && <div className="alert alert--error">{fileError}</div>}

        <button className="submit-btn" type="submit" disabled={!file || !!fileError || loading}>
          {loading && <span className="spinner" />}
          {loading ? 'Converting…' : 'Convert to PDF'}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {downloadUrl && (
        <div className="result-card">
          <div className="result-card-top">
            <div className="result-card-icon">📧</div>
            <div className="result-card-body">
              <p className="result-card-title">Email converted to PDF</p>
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
