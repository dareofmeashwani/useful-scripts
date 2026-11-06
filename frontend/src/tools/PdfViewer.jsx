import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
const { TextLayer } = pdfjsLib
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import usePdfFile from '../hooks/usePdfFile'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

// ── constants ─────────────────────────────────────────────────────────────────
const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]
const THUMB_SCALE  = 0.12

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function scalePct(s) {
  if (s === 'fitwidth') return 'Fit W'
  if (s === 'fitpage')  return 'Fit P'
  return Math.round(s * 100) + '%'
}

// ── Outline item (recursive) ──────────────────────────────────────────────────
function OutlineItem({ item, depth, onGo }) {
  const [open, setOpen] = useState(depth === 0)
  const hasKids = item.items?.length > 0
  return (
    <div>
      <div className="pv-ol-row" style={{ paddingLeft: depth * 14 + 8 }}>
        {hasKids
          ? <button className="pv-ol-toggle" onClick={() => setOpen(v => !v)}>{open ? '▾' : '▸'}</button>
          : <span className="pv-ol-gap" />
        }
        <button className="pv-ol-label" onClick={() => onGo(item.dest)}>
          {item.title || '(untitled)'}
        </button>
      </div>
      {open && hasKids && item.items.map((c, i) => (
        <OutlineItem key={i} item={c} depth={depth + 1} onGo={onGo} />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PdfViewer({ meta }) {
  const { file, fileError, applyFile, reset: resetFile } = usePdfFile()

  // document
  const [pdfDoc,    setPdfDoc]    = useState(null)
  const [numPages,  setNumPages]  = useState(0)
  const [pageNum,   setPageNum]   = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [scale,     setScale]     = useState(1.0)
  const [rotation,  setRotation]  = useState(0)
  const [outline,   setOutline]   = useState(null)
  const [docTitle,  setDocTitle]  = useState('')

  // loading / error
  const [loading,     setLoading]     = useState(false)
  const [pageLoading, setPageLoading] = useState(false)
  const [error,       setError]       = useState(null)

  // UI
  const [sidePanel, setSidePanel] = useState('thumbs')
  const [thumbs,    setThumbs]    = useState({})      // { [n]: dataURL }

  // search
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState([])  // [{page,count}]
  const [searchIdx,     setSearchIdx]     = useState(0)
  const [searching,     setSearching]     = useState(false)

  // refs
  const canvasRef   = useRef(null)
  const textRef     = useRef(null)
  const containerRef= useRef(null)
  const renderRef   = useRef(null)
  const searchRef   = useRef(null)
  const pdfRef      = useRef(null)
  const textCache   = useRef({})  // { [pageNum]: string }

  // ── Load PDF ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) return
    let live = true

    setLoading(true); setError(null)
    setPdfDoc(null); pdfRef.current = null
    setNumPages(0); setPageNum(1); setPageInput('1')
    setScale(1.0); setRotation(0)
    setOutline(null); setDocTitle('')
    setThumbs({}); setSearchResults([]); setSearchQuery('')
    textCache.current = {}

    file.arrayBuffer()
      .then(buf => pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise)
      .then(async doc => {
        if (!live) return
        pdfRef.current = doc
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setLoading(false)

        const [olR, metaR] = await Promise.allSettled([doc.getOutline(), doc.getMetadata()])
        if (!live) return
        if (olR.status === 'fulfilled')   setOutline(olR.value ?? [])
        if (metaR.status === 'fulfilled') setDocTitle(metaR.value?.info?.Title ?? '')
      })
      .catch(err => {
        if (live) { setError(err.message || 'Failed to load PDF'); setLoading(false) }
      })

    return () => { live = false }
  }, [file])

  // ── Render page ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc) return
    const doc = pdfDoc
    let live = true

    renderRef.current?.cancel()
    renderRef.current = null
    setPageLoading(true)

    doc.getPage(pageNum).then(page => {
      if (!live) { page.cleanup(); return }

      // Resolve auto-scale modes
      let s = scale
      const box = containerRef.current
      if (s === 'fitwidth' && box) {
        const base = page.getViewport({ scale: 1, rotation })
        s = Math.max(0.25, (box.clientWidth - 40) / base.width)
      } else if (s === 'fitpage' && box) {
        const base = page.getViewport({ scale: 1, rotation })
        const sw = (box.clientWidth - 40)  / base.width
        const sh = (box.clientHeight - 40) / base.height
        s = Math.max(0.25, Math.min(sw, sh))
      }

      const viewport = page.getViewport({ scale: s, rotation })
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      if (!canvas) { page.cleanup(); return }

      canvas.width  = Math.round(viewport.width  * dpr)
      canvas.height = Math.round(viewport.height * dpr)
      canvas.style.width  = Math.round(viewport.width)  + 'px'
      canvas.style.height = Math.round(viewport.height) + 'px'

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      // Prepare text layer container
      const tl = textRef.current
      if (tl) {
        tl.innerHTML = ''
        tl.style.width  = Math.round(viewport.width)  + 'px'
        tl.style.height = Math.round(viewport.height) + 'px'
        tl.style.setProperty('--scale-factor', String(s))
      }

      const task = page.render({ canvasContext: ctx, viewport })
      renderRef.current = task

      task.promise.then(async () => {
        if (!live) { page.cleanup(); return }
        // Text layer (for selection)
        if (tl && TextLayer) {
          try {
            const tc = await page.getTextContent()
            if (!live) { page.cleanup(); return }
            const tlTask = new TextLayer({ textContentSource: tc, container: tl, viewport })
            await tlTask.render().catch(() => {})
            textCache.current[pageNum] = tc.items.map(it => it.str ?? '').join(' ')
          } catch { /* text layer optional */ }
        }
        page.cleanup()
        if (live) setPageLoading(false)
      }).catch(err => {
        page.cleanup()
        if (live && err?.name !== 'RenderingCancelledException') {
          setError(err.message || 'Render error')
          setPageLoading(false)
        }
      })
    }).catch(err => {
      if (live) { setError(err.message || 'Page error'); setPageLoading(false) }
    })

    return () => {
      live = false
      renderRef.current?.cancel()
      renderRef.current = null
    }
  }, [pdfDoc, pageNum, scale, rotation])

  // Sync page input when page changes from outside
  useEffect(() => { setPageInput(String(pageNum)) }, [pageNum])

  // ── Thumbnails ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || sidePanel !== 'thumbs') return
    const doc = pdfDoc
    let live = true

    const gen = async n => {
      if (!live || thumbs[n]) return
      try {
        const page = await doc.getPage(n)
        if (!live) { page.cleanup(); return }
        const vp = page.getViewport({ scale: THUMB_SCALE, rotation: 0 })
        const c  = document.createElement('canvas')
        c.width  = Math.round(vp.width)
        c.height = Math.round(vp.height)
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
        page.cleanup()
        if (live) setThumbs(prev => ({ ...prev, [n]: c.toDataURL('image/jpeg', 0.65) }))
      } catch { /* skip */ }
    }

    // Priority: current page outward
    const order = []
    for (let i = pageNum; i <= doc.numPages; i++) order.push(i)
    for (let i = pageNum - 1; i >= 1; i--) order.push(i)

    ;(async () => {
      for (const n of order) {
        if (!live) break
        await gen(n)
        await new Promise(r => setTimeout(r, 0))
      }
    })()

    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, sidePanel])

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goTo = useCallback(n => {
    const doc = pdfRef.current
    if (!doc) return
    setPageNum(clamp(n, 1, doc.numPages))
  }, [])

  // ── Zoom ────────────────────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setScale(s => {
      const cur = typeof s === 'number' ? s : 1
      return ZOOM_PRESETS.find(z => z > cur + 0.001) ?? Math.min(cur * 1.25, 4)
    })
  }, [])
  const zoomOut = useCallback(() => {
    setScale(s => {
      const cur = typeof s === 'number' ? s : 1
      return [...ZOOM_PRESETS].reverse().find(z => z < cur - 0.001) ?? Math.max(cur * 0.8, 0.25)
    })
  }, [])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if (!pdfRef.current) return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault(); goTo(pageNum + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault(); goTo(pageNum - 1)
      } else if (e.key === 'Home') {
        e.preventDefault(); goTo(1)
      } else if (e.key === 'End') {
        e.preventDefault(); goTo(numPages)
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault(); zoomIn()
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault(); zoomOut()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchRef.current?.focus(), 60)
      } else if (e.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pageNum, numPages, goTo, zoomIn, zoomOut])

  // ── Search ──────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async q => {
    if (!pdfRef.current || !q.trim()) { setSearchResults([]); return }
    setSearching(true)
    const doc   = pdfRef.current
    const query = q.toLowerCase()
    const hits  = []

    for (let n = 1; n <= doc.numPages; n++) {
      try {
        let text = textCache.current[n]
        if (text === undefined) {
          const page = await doc.getPage(n)
          const tc   = await page.getTextContent()
          page.cleanup()
          text = tc.items.map(it => it.str ?? '').join(' ')
          textCache.current[n] = text
        }
        const t = text.toLowerCase()
        let idx = 0, count = 0
        while ((idx = t.indexOf(query, idx)) !== -1) { count++; idx += query.length }
        if (count) hits.push({ page: n, count })
      } catch { /* skip */ }
    }

    setSearchResults(hits)
    setSearchIdx(0)
    setSearching(false)
    if (hits.length) goTo(hits[0].page)
  }, [goTo])

  const searchNav = useCallback(dir => {
    if (!searchResults.length) return
    const next = (searchIdx + dir + searchResults.length) % searchResults.length
    setSearchIdx(next)
    goTo(searchResults[next].page)
  }, [searchIdx, searchResults, goTo])

  // ── Outline navigation ──────────────────────────────────────────────────────
  const goToOutline = useCallback(async dest => {
    const doc = pdfRef.current
    if (!doc || !dest) return
    try {
      const arr = typeof dest === 'string' ? await doc.getDestination(dest) : dest
      if (!arr) return
      const idx = await doc.getPageIndex(arr[0])
      goTo(idx + 1)
    } catch { /* skip */ }
  }, [goTo])

  // ── Misc ────────────────────────────────────────────────────────────────────
  const rotate   = useCallback(() => setRotation(r => (r + 90) % 360), [])
  const downloadUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  const closeViewer = () => {
    renderRef.current?.cancel()
    resetFile()
    setPdfDoc(null); pdfRef.current = null
    setNumPages(0); setPageNum(1); setPageInput('1')
    setScale(1.0); setRotation(0); setError(null)
    setOutline(null); setDocTitle(''); setThumbs({})
    setSearchResults([]); setSearchQuery(''); setSearchOpen(false)
    textCache.current = {}
  }

  // ── Drop-zone (no file loaded) ───────────────────────────────────────────────
  if (!file && !loading) {
    return (
      <div className="tool-ui">
        <ToolHeader meta={meta} />
        <FileZone
          file={file}
          error={!!fileError}
          onSelect={applyFile}
          accept=".pdf,application/pdf"
          hint="Click or drag a PDF here"
          subhint="Max 50 MB"
        />
        {fileError && <div className="alert alert--error">{fileError}</div>}
        {error     && <div className="alert alert--error">⚠ {error}</div>}
      </div>
    )
  }

  const matchPages      = new Set(searchResults.map(r => r.page))
  const curMatchPage    = searchResults[searchIdx]?.page

  return (
    <div className="tool-ui tool-ui--viewer">
      <ToolHeader meta={meta} />

      {loading ? (
        <div className="pv-loading">
          <span className="spinner" style={{ width:24, height:24, borderColor:'var(--border)', borderTopColor:'var(--accent)' }} />
          Loading PDF…
        </div>
      ) : (
        <>
          {/* ── Toolbar ─────────────────────────────────────────────────── */}
          <div className="pv-toolbar">
            {/* Navigation */}
            <div className="pv-tg">
              <button className="pv-btn" onClick={() => goTo(pageNum - 1)} disabled={pageNum <= 1} title="Previous page (← ↑ PgUp)">‹</button>
              <input
                className="pv-pg-input"
                type="text"
                inputMode="numeric"
                value={pageInput}
                onChange={e => setPageInput(e.target.value)}
                onBlur={() => {
                  const n = parseInt(pageInput, 10)
                  isNaN(n) ? setPageInput(String(pageNum)) : goTo(n)
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
              />
              <span className="pv-pg-of">/ {numPages}</span>
              <button className="pv-btn" onClick={() => goTo(pageNum + 1)} disabled={pageNum >= numPages} title="Next page (→ ↓ PgDn)">›</button>
            </div>

            <span className="pv-sep" />

            {/* Zoom */}
            <div className="pv-tg">
              <button className="pv-btn" onClick={zoomOut} title="Zoom out (Ctrl+−)">−</button>
              <span className="pv-zoom-lbl">{scalePct(scale)}</span>
              <button className="pv-btn" onClick={zoomIn} title="Zoom in (Ctrl+=)">+</button>
              <button
                className={`pv-btn pv-btn--sm${scale === 'fitwidth' ? ' pv-btn--on' : ''}`}
                onClick={() => setScale(s => s === 'fitwidth' ? 1.0 : 'fitwidth')}
                title="Fit width"
              >W</button>
              <button
                className={`pv-btn pv-btn--sm${scale === 'fitpage' ? ' pv-btn--on' : ''}`}
                onClick={() => setScale(s => s === 'fitpage' ? 1.0 : 'fitpage')}
                title="Fit page"
              >P</button>
            </div>

            <span className="pv-sep" />

            {/* Actions */}
            <div className="pv-tg">
              <button
                className={`pv-btn pv-btn--sm${searchOpen ? ' pv-btn--on' : ''}`}
                onClick={() => {
                  setSearchOpen(v => !v)
                  if (!searchOpen) setTimeout(() => searchRef.current?.focus(), 60)
                }}
                title="Search text (Ctrl+F)"
              >🔍</button>
              <button className="pv-btn pv-btn--sm" onClick={rotate} title="Rotate 90°">↻</button>
              {downloadUrl && (
                <a className="pv-btn pv-btn--sm" href={downloadUrl} download={file?.name} title="Download PDF">⬇</a>
              )}
            </div>

            <span className="pv-sep" />

            {/* Side panel toggles */}
            <div className="pv-tg">
              <button
                className={`pv-btn pv-btn--sm${sidePanel === 'thumbs' ? ' pv-btn--on' : ''}`}
                onClick={() => setSidePanel(s => s === 'thumbs' ? null : 'thumbs')}
                title="Thumbnails"
              >▤</button>
              {outline?.length > 0 && (
                <button
                  className={`pv-btn pv-btn--sm${sidePanel === 'outline' ? ' pv-btn--on' : ''}`}
                  onClick={() => setSidePanel(s => s === 'outline' ? null : 'outline')}
                  title="Outline / Bookmarks"
                >☰</button>
              )}
            </div>

            <div className="pv-tg-flex" />
            {docTitle && <span className="pv-doc-title">{docTitle}</span>}
            <button className="pv-btn pv-close-btn" onClick={closeViewer} title="Close PDF">✕</button>
          </div>

          {/* ── Search bar ──────────────────────────────────────────────── */}
          {searchOpen && (
            <div className="pv-search-bar">
              <input
                ref={searchRef}
                className="pv-search-input"
                placeholder="Search in document…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { if (e.shiftKey) searchNav(-1); else runSearch(searchQuery) }
                  if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }
                }}
              />
              <button className="pv-find-btn" onClick={() => runSearch(searchQuery)} disabled={searching || !searchQuery.trim()}>
                {searching ? '…' : 'Find'}
              </button>
              {searchResults.length > 0 && (
                <>
                  <span className="pv-find-info">
                    {searchIdx + 1} / {searchResults.length} page{searchResults.length !== 1 ? 's' : ''}
                  </span>
                  <button className="pv-btn" onClick={() => searchNav(-1)} title="Previous match">‹</button>
                  <button className="pv-btn" onClick={() => searchNav(1)} title="Next match">›</button>
                </>
              )}
              {!searching && searchQuery.trim() && !searchResults.length && (
                <span className="pv-find-none">No results</span>
              )}
              <button className="pv-btn" onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }}>✕</button>
            </div>
          )}

          {error && <div className="alert alert--error">⚠ {error}</div>}

          {/* ── Layout ──────────────────────────────────────────────────── */}
          <div className="pv-layout">

            {/* Sidebar */}
            {sidePanel && (
              <div className="pv-sidebar">
                {sidePanel === 'thumbs' && (
                  <div className="pv-thumbs">
                    {Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
                      <div
                        key={n}
                        className={[
                          'pv-thumb',
                          n === pageNum       ? 'pv-thumb--cur'   : '',
                          n === curMatchPage  ? 'pv-thumb--hit'   : '',
                          matchPages.has(n)   ? 'pv-thumb--match' : '',
                        ].join(' ')}
                        onClick={() => goTo(n)}
                      >
                        {matchPages.has(n) && <span className="pv-thumb-dot">●</span>}
                        {thumbs[n]
                          ? <img src={thumbs[n]} alt="" className="pv-thumb-img" />
                          : <div className="pv-thumb-blank" />
                        }
                        <span className="pv-thumb-n">{n}</span>
                      </div>
                    ))}
                  </div>
                )}

                {sidePanel === 'outline' && outline?.length > 0 && (
                  <div className="pv-outline">
                    {outline.map((item, i) => (
                      <OutlineItem key={i} item={item} depth={0} onGo={goToOutline} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Canvas area */}
            <div ref={containerRef} className="pv-canvas-area">
              <div className={`pv-page-wrap${pageLoading ? ' pv-page-wrap--fading' : ''}`}>
                <canvas ref={canvasRef} className="pv-canvas" />
                <div ref={textRef} className="pv-text-layer" />
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  )
}
