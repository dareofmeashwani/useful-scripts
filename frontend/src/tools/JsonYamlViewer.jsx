import { useState, useMemo, useCallback, memo } from 'react'
import { load as yamlLoad } from 'js-yaml'
import ToolHeader from '../components/ToolHeader'

const INDENT = 20   // px per depth level

// ── Parse ─────────────────────────────────────────────────────────────────────

function parseInput(text) {
  const t = text.trim()
  if (!t) return { data: null, error: null, format: null }

  try {
    return { data: JSON.parse(t), error: null, format: 'JSON' }
  } catch {}

  try {
    const data = yamlLoad(t)
    if (data !== undefined) return { data, error: null, format: 'YAML' }
    return { data: null, error: 'Empty document', format: null }
  } catch (e) {
    return { data: null, error: e.message || 'Not valid JSON or YAML', format: null }
  }
}

// ── Flatten visible tree nodes ────────────────────────────────────────────────

function flattenData(value, path, key, depth, isLast, collapsed) {
  if (value !== null && typeof value === 'object') {
    const isArr  = Array.isArray(value)
    const keys   = isArr ? null : Object.keys(value)
    const count  = isArr ? value.length : keys.length

    if (count === 0) {
      return [{ type: 'prim', key, value: isArr ? '[]' : '{}', depth, isLast, raw: true }]
    }
    if (collapsed.has(path)) {
      return [{ type: 'col', key, depth, path, count, isLast, isArr }]
    }

    const nodes = [{ type: 'open', key, depth, path, isArr }]
    if (isArr) {
      value.forEach((v, i) =>
        nodes.push(...flattenData(v, `${path}[${i}]`, null, depth + 1, i === count - 1, collapsed))
      )
    } else {
      keys.forEach((k, i) =>
        nodes.push(...flattenData(value[k], `${path}.${k}`, k, depth + 1, i === keys.length - 1, collapsed))
      )
    }
    nodes.push({ type: 'close', depth, isLast, isArr })
    return nodes
  }
  return [{ type: 'prim', key, value, depth, isLast }]
}

function getCollapsiblePaths(value, path = 'root') {
  if (value === null || typeof value !== 'object') return []
  const isArr  = Array.isArray(value)
  const count  = isArr ? value.length : Object.keys(value).length
  if (count === 0) return []
  const paths = [path]
  if (isArr) {
    value.forEach((v, i) => paths.push(...getCollapsiblePaths(v, `${path}[${i}]`)))
  } else {
    Object.keys(value).forEach(k => paths.push(...getCollapsiblePaths(value[k], `${path}.${k}`)))
  }
  return paths
}

// ── Value renderer ────────────────────────────────────────────────────────────

function Val({ value, raw }) {
  if (raw) return <span className="jv-brace">{value}</span>
  if (value instanceof Date) return <span className="jv-str">"{value.toISOString()}"</span>
  if (value === null)          return <span className="jv-null">null</span>
  if (typeof value === 'boolean') return <span className="jv-bool">{String(value)}</span>
  if (typeof value === 'number')  return <span className="jv-num">{value}</span>
  if (typeof value === 'string') {
    // Truncate very long strings in the tree; show full on hover via title
    const display = value.length > 120 ? value.slice(0, 120) + '…' : value
    return <span className="jv-str" title={value.length > 120 ? value : undefined}>"{display}"</span>
  }
  return <span className="jv-str">"{String(value)}"</span>
}

// ── Single tree row ───────────────────────────────────────────────────────────

const Row = memo(function Row({ node, lineNum, showNums, onToggle }) {
  const { type, depth, key, isLast, isArr } = node
  const hasToggle = type === 'open' || type === 'col'
  const comma = isLast || type === 'open' ? '' : ','

  const keyEl = (key !== null && key !== undefined)
    ? <><span className="jv-key">"{key}"</span><span className="jv-colon">: </span></>
    : null

  let content
  if (type === 'open') {
    content = <>{keyEl}<span className="jv-brace">{isArr ? '[' : '{'}</span></>
  } else if (type === 'close') {
    content = <><span className="jv-brace">{isArr ? ']' : '}'}</span><span className="jv-comma">{comma}</span></>
  } else if (type === 'col') {
    const label = isArr
      ? `[ … ${node.count} item${node.count !== 1 ? 's' : ''} ]`
      : `{ … ${node.count} key${node.count !== 1 ? 's' : ''} }`
    content = <>{keyEl}<span className="jv-preview">{label}</span><span className="jv-comma">{comma}</span></>
  } else {
    content = <>{keyEl}<Val value={node.value} raw={node.raw} /><span className="jv-comma">{comma}</span></>
  }

  return (
    <div
      className={`jv-row${hasToggle ? ' jv-row--toggle' : ''}`}
      onClick={hasToggle ? () => onToggle(node.path) : undefined}
    >
      {showNums && <span className="jv-lnum">{lineNum}</span>}
      <span className="jv-indent" style={{ width: depth * INDENT }} />
      <span className={hasToggle ? 'jv-toggle' : 'jv-toggle-gap'}>
        {type === 'open' ? '▾' : type === 'col' ? '▸' : ''}
      </span>
      <span className="jv-text">{content}</span>
    </div>
  )
})

// ── Main component ────────────────────────────────────────────────────────────

export default function JsonYamlViewer({ meta }) {
  const [text,     setText]     = useState('')
  const [collapsed, setCollapsed] = useState(new Set())
  const [showNums,  setShowNums]  = useState(true)
  const [copied,    setCopied]    = useState(false)

  const { data, error, format } = useMemo(() => parseInput(text), [text])

  const flatNodes = useMemo(
    () => (data !== null && data !== undefined)
      ? flattenData(data, 'root', null, 0, true, collapsed)
      : [],
    [data, collapsed]
  )

  const handleText = e => {
    setText(e.target.value)
    setCollapsed(new Set())
  }

  const handleFile = e => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => { setText(ev.target.result); setCollapsed(new Set()) }
    reader.readAsText(f)
    e.target.value = ''
  }

  const toggle = useCallback(path => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return next
  }), [])

  const expandAll   = () => setCollapsed(new Set())
  const collapseAll = () => { if (data) setCollapsed(new Set(getCollapsiblePaths(data))) }

  const copyJSON = async () => {
    if (data === null || data === undefined) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  const hasData = flatNodes.length > 0

  return (
    <div className="tool-ui jv-ui">
      <ToolHeader meta={meta} />

      <div className="form-field">
        <div className="jv-input-header">
          <span className="form-label">Input</span>
          <label className="jv-file-btn">
            Load file
            <input type="file" accept=".json,.yaml,.yml,.txt" style={{ display: 'none' }} onChange={handleFile} />
          </label>
        </div>
        <textarea
          className="text-area"
          style={{ minHeight: 120, maxHeight: 200, resize: 'vertical' }}
          placeholder="Paste JSON or YAML here…"
          value={text}
          onChange={handleText}
          spellCheck={false}
        />
      </div>

      {text.trim() && error && (
        <div className="alert alert--error">⚠ {error}</div>
      )}

      {hasData && (
        <div className="jv-viewer">
          <div className="jv-toolbar">
            <span className="jv-badge">{format}</span>
            <span className="jv-line-count">{flatNodes.length} lines</span>
            <div className="jv-toolbar-actions">
              <button className="jv-btn" type="button" onClick={expandAll}>Expand all</button>
              <button className="jv-btn" type="button" onClick={collapseAll}>Collapse all</button>
              <button
                className={`jv-btn${showNums ? ' jv-btn--on' : ''}`}
                type="button"
                onClick={() => setShowNums(v => !v)}
              >
                # Lines
              </button>
              <button className="jv-btn" type="button" onClick={copyJSON}>
                {copied ? '✓ Copied' : 'Copy JSON'}
              </button>
            </div>
          </div>

          <div className="jv-tree">
            {flatNodes.map((node, idx) => (
              <Row
                key={idx}
                node={node}
                lineNum={idx + 1}
                showNums={showNums}
                onToggle={toggle}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
