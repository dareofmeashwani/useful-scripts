import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import ToolHeader from '../components/ToolHeader'
import { buildGraph, FORMAT_LABELS } from './depGraphParse'
import { layout } from './depGraphLayout'

// kind → human label (order defines legend/filter order). Colors live in CSS.
const KINDS = [
  ['root', 'Root'], ['prod', 'Prod'], ['dev', 'Dev'], ['peer', 'Peer'],
  ['optional', 'Optional'], ['build', 'Build'], ['test', 'Test'], ['transitive', 'Transitive'],
]
const KIND_LABEL = Object.fromEntries(KINDS)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// All nodes reachable from `start` by following `adj` (directed). Excludes start;
// the `seen` guard makes it cycle-safe.
function reach(start, adj) {
  const seen = new Set()
  const stack = [...(adj.get(start) || [])]
  while (stack.length) {
    const u = stack.pop()
    if (seen.has(u)) continue
    seen.add(u)
    for (const v of (adj.get(u) || [])) if (!seen.has(v)) stack.push(v)
  }
  seen.delete(start)
  return seen
}

const REL_MODES = [
  ['descendants', 'Descendants ↓'],
  ['ancestors', 'Ancestors ↑'],
  ['both', 'Both'],
]

const SAMPLE = `{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": { "react": "^19.0.0", "react-dom": "^19.0.0", "js-yaml": "^4.1.0" },
  "devDependencies": { "vite": "^8.0.0", "oxlint": "^1.0.0" }
}`

export default function DependencyGraph({ meta }) {
  const [text, setText]         = useState('')
  const [fileName, setFileName] = useState('')
  const [hidden, setHidden]     = useState(() => new Set())   // hidden kinds
  const [query, setQuery]       = useState('')
  const [hoveredId, setHovered]   = useState(null)
  const [selectedId, setSelected] = useState(null)
  const [relMode, setRelMode]     = useState('descendants')  // descendants | ancestors | both
  const [view, setView]           = useState({ tx: 0, ty: 0, s: 1 })

  const canvasRef = useRef(null)
  const dragRef   = useRef(null)
  const movedRef  = useRef(false)

  // Parse → graph (memoized on input).
  const graph = useMemo(() => buildGraph(fileName, text), [fileName, text])
  const error = graph.error
  const empty = graph.empty || !graph.nodes

  // Which kinds are actually present (for legend + filter chips).
  const presentKinds = useMemo(() => {
    if (!graph.nodes) return []
    const set = new Set(graph.nodes.map(n => n.kind))
    return KINDS.filter(([id]) => set.has(id)).map(([id, label]) => ({ id, label }))
  }, [graph])

  // Apply kind filter, then lay out the visible sub-graph.
  const { positioned, width, height, byId } = useMemo(() => {
    if (!graph.nodes) return { positioned: [], width: 0, height: 0, byId: new Map() }
    const nodes = graph.nodes.filter(n => !hidden.has(n.kind))
    const keep = new Set(nodes.map(n => n.id))
    const edges = graph.edges.filter(e => keep.has(e.from) && keep.has(e.to))
    const laid = layout(nodes, edges, graph.rootId)
    return { ...laid, edges, byId: new Map(laid.positioned.map(n => [n.id, n])) }
  }, [graph, hidden])

  // Visible edges that connect two laid-out nodes.
  const edges = useMemo(() => {
    if (!graph.edges) return []
    return graph.edges.filter(e => byId.has(e.from) && byId.has(e.to))
  }, [graph, byId])

  // Adjacency for hover highlighting.
  const neighbors = useMemo(() => {
    const m = new Map()
    const add = (a, b) => { if (!m.has(a)) m.set(a, new Set()); m.get(a).add(b) }
    for (const e of edges) { add(e.from, e.to); add(e.to, e.from) }
    return m
  }, [edges])

  // Directed adjacency for ancestor / descendant tracing.
  const { outAdj, inAdj } = useMemo(() => {
    const out = new Map(), inn = new Map()
    const push = (m, a, b) => { if (!m.has(a)) m.set(a, []); m.get(a).push(b) }
    for (const e of edges) { push(out, e.from, e.to); push(inn, e.to, e.from) }
    return { outAdj: out, inAdj: inn }
  }, [edges])

  // Descendant / ancestor sets of the selected node (each excludes the node).
  // Returns null when nothing is selected or the selection was filtered out,
  // so stale selections simply show no highlight (no effect/setState needed).
  const rel = useMemo(() => {
    if (!selectedId || !byId.has(selectedId)) return null
    return { desc: reach(selectedId, outAdj), anc: reach(selectedId, inAdj) }
  }, [selectedId, outAdj, inAdj, byId])

  const q = query.trim().toLowerCase()

  // Fit the graph to the canvas.
  const fit = useCallback(() => {
    const el = canvasRef.current
    if (!el || !width || !height) return
    const cw = el.clientWidth, ch = el.clientHeight
    const s = clamp(Math.min(cw / width, ch / height, 1), 0.1, 1)
    setView({ s, tx: (cw - width * s) / 2, ty: (ch - height * s) / 2 })
  }, [width, height])

  // Auto-fit whenever the laid-out graph changes.
  useEffect(() => { fit() }, [fit])

  // Non-passive wheel zoom (React's onWheel can't preventDefault reliably).
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = e => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setView(v => {
        const s = clamp(v.s * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.1, 3)
        const k = s / v.s
        return { s, tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onMouseDown = e => {
    if (e.button !== 0) return
    movedRef.current = false
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
    const onMove = ev => {
      const d = dragRef.current
      if (!d) return
      if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 3) movedRef.current = true
      setView(v => ({ ...v, tx: d.tx + (ev.clientX - d.x), ty: d.ty + (ev.clientY - d.y) }))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Click on empty canvas (not a drag, not a node) clears the selection.
  const onCanvasClick = () => { if (!movedRef.current) setSelected(null) }

  const zoomBtn = factor => setView(v => {
    const el = canvasRef.current
    const cw = el ? el.clientWidth / 2 : 0, ch = el ? el.clientHeight / 2 : 0
    const s = clamp(v.s * factor, 0.1, 3)
    const k = s / v.s
    return { s, tx: cw - k * (cw - v.tx), ty: ch - k * (ch - v.ty) }
  })

  const loadFile = file => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setText(ev.target.result); setFileName(file.name) }
    reader.readAsText(file)
  }

  const toggleKind = id => setHidden(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const showAnc  = relMode === 'ancestors'  || relMode === 'both'
  const showDesc = relMode === 'descendants' || relMode === 'both'

  // Node relation to the selected node: 'selected' | 'desc' | 'anc' | ''.
  const nodeRel = id => {
    if (!rel) return ''
    if (id === selectedId) return 'selected'
    if (showDesc && rel.desc.has(id)) return 'desc'
    if (showAnc && rel.anc.has(id)) return 'anc'
    return ''
  }
  const nodeDim = id => {
    if (rel) return nodeRel(id) === ''
    return hoveredId && id !== hoveredId && !(neighbors.get(hoveredId)?.has(id))
  }
  // Edge relation: 'desc' | 'anc' | '' (shown) | 'dim'.
  const edgeRel = e => {
    if (!rel) return (!hoveredId || e.from === hoveredId || e.to === hoveredId) ? '' : 'dim'
    if (showDesc && rel.desc.has(e.to) && (e.from === selectedId || rel.desc.has(e.from))) return 'desc'
    if (showAnc && rel.anc.has(e.from) && (e.to === selectedId || rel.anc.has(e.to))) return 'anc'
    return 'dim'
  }

  return (
    <div className="tool-ui tool-ui--wide dg-ui">
      <ToolHeader meta={meta} />

      <div className="form-field">
        <div className="jv-input-header">
          <span className="form-label">Dependency file</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="jv-file-btn" type="button" onClick={() => { setText(SAMPLE); setFileName('package.json') }}>
              Try sample
            </button>
            <label className="jv-file-btn">
              Load file
              <input
                type="file"
                style={{ display: 'none' }}
                accept=".json,.lock,.txt,.toml,.xml,.yaml,.yml,.mod,.gradle,.kts,Gemfile,Pipfile"
                onChange={e => { loadFile(e.target.files?.[0]); e.target.value = '' }}
              />
            </label>
          </div>
        </div>
        <textarea
          className="text-area"
          style={{ minHeight: 110, maxHeight: 200, resize: 'vertical' }}
          placeholder="Paste a package.json, package-lock.json, requirements.txt, pom.xml, go.mod, Cargo.toml/lock, pyproject.toml, poetry.lock, Gemfile, build.gradle, composer.json/lock, pnpm-lock.yaml, Pipfile.lock…"
          value={text}
          spellCheck={false}
          onChange={e => { setText(e.target.value); setFileName('') }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files?.[0]) }}
        />
      </div>

      {text.trim() && error && <div className="alert alert--error">⚠ {error}</div>}

      {!empty && !error && positioned.length > 0 && (
        <div className="dg-viewer">
          <div className="dg-toolbar">
            <span className="jv-badge">{FORMAT_LABELS[graph.format] || graph.format}</span>
            <span className="dg-stat">{graph.nodes.length} packages · {graph.edges.length} links</span>

            <input
              className="dg-search"
              type="search"
              placeholder="Highlight by name or version…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />

            <div className="dg-zoom">
              <button className="jv-btn" type="button" onClick={() => zoomBtn(1 / 1.2)} aria-label="Zoom out">−</button>
              <span className="dg-zoom-level">{Math.round(view.s * 100)}%</span>
              <button className="jv-btn" type="button" onClick={() => zoomBtn(1.2)} aria-label="Zoom in">+</button>
              <button className="jv-btn" type="button" onClick={fit}>Fit</button>
            </div>
          </div>

          {presentKinds.length > 1 && (
            <div className="dg-legend">
              {presentKinds.map(k => (
                <button
                  key={k.id}
                  type="button"
                  className={`dg-chip dg-kind-${k.id}${hidden.has(k.id) ? ' dg-chip--off' : ''}`}
                  onClick={() => toggleKind(k.id)}
                  title={`Toggle ${k.label}`}
                >
                  <span className="dg-swatch" />{k.label}
                </button>
              ))}
            </div>
          )}

          <div className="dg-trace-bar">
            <span className="dg-trace-label">Trace</span>
            <div className="split-mode-tabs dg-seg">
              {REL_MODES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`split-mode-tab${relMode === id ? ' split-mode-tab--active' : ''}`}
                  onClick={() => setRelMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {selectedId && byId.has(selectedId) ? (
              <span className="dg-trace-active">
                <span className="dg-swatch dg-kind-root" />
                Tracing <strong>{byId.get(selectedId).label}</strong>
                <button className="dg-trace-clear" type="button" onClick={() => setSelected(null)}>clear</button>
              </span>
            ) : (
              <span className="dg-trace-hint">click a node to highlight its {relMode === 'both' ? 'ancestors & descendants' : relMode}</span>
            )}
          </div>

          <div className="dg-canvas" ref={canvasRef} onMouseDown={onMouseDown} onClick={onCanvasClick}>
            <svg className="dg-svg" width="100%" height="100%">
              <defs>
                <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
                </marker>
              </defs>
              <g transform={`translate(${view.tx},${view.ty}) scale(${view.s})`}>
                {edges.map((e, i) => {
                  const s = byId.get(e.from), t = byId.get(e.to)
                  if (!s || !t) return null
                  const sx = s.x + s.w, sy = s.y + s.h / 2
                  const tx = t.x, ty = t.y + t.h / 2
                  const mx = (sx + tx) / 2
                  const er = edgeRel(e)
                  return (
                    <path
                      key={i}
                      className={`dg-edge dg-kind-${e.kind}${er === 'dim' ? ' dg-edge--dim' : ''}${er === 'desc' ? ' dg-edge--desc' : ''}${er === 'anc' ? ' dg-edge--anc' : ''}`}
                      d={`M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`}
                      markerEnd="url(#dg-arrow)"
                    />
                  )
                })}
                {positioned.map(n => {
                  const match = q && (n.label.toLowerCase().includes(q) || (n.version && n.version.toLowerCase().includes(q)))
                  const relCls = nodeRel(n.id)
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x},${n.y})`}
                      className={`dg-node dg-kind-${n.kind}${nodeDim(n.id) ? ' dg-node--dim' : ''}${relCls ? ' dg-node--' + relCls : ''}${match ? ' dg-node--match' : ''}`}
                      onMouseEnter={() => setHovered(n.id)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={ev => { ev.stopPropagation(); setSelected(prev => prev === n.id ? null : n.id) }}
                    >
                      <title>{n.label}{n.version ? ` (${n.version})` : ''} — {KIND_LABEL[n.kind] || n.kind}</title>
                      <rect className="dg-node-box" width={n.w} height={n.h} rx="9" />
                      <text className="dg-node-name" x="12" y={n.version ? 19 : 27}>{truncate(n.label, 24)}</text>
                      {n.version && <text className="dg-node-ver" x="12" y="33">{truncate(n.version, 26)}</text>}
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>

          {graph.truncated && (
            <div className="dg-note">Graph truncated to the first 400 packages for performance.</div>
          )}
        </div>
      )}
    </div>
  )
}
