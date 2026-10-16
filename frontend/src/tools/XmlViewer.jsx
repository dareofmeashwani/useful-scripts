import { useState, useMemo, useCallback, memo } from 'react'
import ToolHeader from '../components/ToolHeader'

const INDENT = 20  // px per depth level

// ── Parse ─────────────────────────────────────────────────────────────────────

function parseXml(text) {
  if (!text.trim()) return { doc: null, error: null }
  const parser = new DOMParser()
  const doc = parser.parseFromString(text.trim(), 'text/xml')
  const err = doc.querySelector('parsererror')
  if (err) {
    const msg = err.textContent.split('\n').find(l => l.trim()) || 'Invalid XML'
    return { doc: null, error: msg.trim() }
  }
  return { doc, error: null }
}

// ── Flatten XML → flat node list ──────────────────────────────────────────────

function meaningfulChildren(node) {
  return Array.from(node.childNodes).filter(n =>
    n.nodeType === Node.ELEMENT_NODE ||
    n.nodeType === Node.COMMENT_NODE ||
    n.nodeType === Node.CDATA_SECTION_NODE ||
    (n.nodeType === Node.TEXT_NODE && n.textContent.trim())
  )
}

function flattenNode(node, path, depth, isLast, collapsed, out) {
  const t = node.nodeType

  if (t === Node.ELEMENT_NODE) {
    const attrs    = Array.from(node.attributes || []).map(a => ({ name: a.name, value: a.value }))
    const children = meaningfulChildren(node)

    if (children.length === 0) {
      out.push({ type: 'self-close', tag: node.tagName, attrs, depth, isLast })
      return
    }
    // Single short text child → render inline
    if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
      const txt = children[0].textContent.trim()
      if (txt.length <= 100) {
        out.push({ type: 'inline', tag: node.tagName, attrs, text: txt, depth, isLast })
        return
      }
    }

    if (collapsed.has(path)) {
      out.push({ type: 'collapsed', tag: node.tagName, attrs, depth, isLast, path, childCount: children.length })
      return
    }

    out.push({ type: 'open', tag: node.tagName, attrs, depth, path })
    children.forEach((child, i) =>
      flattenNode(child, `${path}/${i}`, depth + 1, i === children.length - 1, collapsed, out)
    )
    out.push({ type: 'close', tag: node.tagName, depth, isLast })

  } else if (t === Node.TEXT_NODE) {
    const text = node.textContent.trim()
    if (text) out.push({ type: 'text', text, depth, isLast })

  } else if (t === Node.COMMENT_NODE) {
    out.push({ type: 'comment', text: node.textContent.trim(), depth, isLast })

  } else if (t === Node.CDATA_SECTION_NODE) {
    out.push({ type: 'cdata', text: node.textContent, depth, isLast })

  } else if (t === Node.PROCESSING_INSTRUCTION_NODE) {
    out.push({ type: 'pi', target: node.target, text: node.data, depth, isLast })
  }
}

function flattenDoc(doc, collapsed) {
  if (!doc) return []
  const children = Array.from(doc.childNodes)
  const out = []
  children.forEach((n, i) =>
    flattenNode(n, `r${i}`, 0, i === children.length - 1, collapsed, out)
  )
  return out
}

// ── Row sub-components ────────────────────────────────────────────────────────

function Attrs({ attrs }) {
  if (!attrs.length) return null
  return attrs.map(a => (
    <span key={a.name}>
      {' '}<span className="xv-aname">{a.name}</span>
      <span className="xv-punct">="</span>
      <span className="xv-aval">{a.value}</span>
      <span className="xv-punct">"</span>
    </span>
  ))
}

function TagName({ tag }) {
  if (!tag.includes(':')) return <span className="xv-tag">{tag}</span>
  const [ns, local] = tag.split(':', 2)
  return <><span className="xv-ns">{ns}</span><span className="xv-punct">:</span><span className="xv-tag">{local}</span></>
}

// ── Single tree row ───────────────────────────────────────────────────────────

const XmlRow = memo(function XmlRow({ node, lineNum, showNums, onToggle }) {
  const { type, depth } = node
  const hasToggle = type === 'open' || type === 'collapsed'

  let content
  if (type === 'open') {
    content = <><span className="xv-punct">{'<'}</span><TagName tag={node.tag} /><Attrs attrs={node.attrs} /><span className="xv-punct">{'>'}</span></>
  } else if (type === 'close') {
    content = <><span className="xv-punct">{'</'}</span><TagName tag={node.tag} /><span className="xv-punct">{'>'}</span></>
  } else if (type === 'collapsed') {
    content = (
      <>
        <span className="xv-punct">{'<'}</span><TagName tag={node.tag} /><Attrs attrs={node.attrs} /><span className="xv-punct">{'>'}</span>
        <span className="jv-preview"> …{node.childCount} child{node.childCount !== 1 ? 'ren' : ''} </span>
        <span className="xv-punct">{'</'}</span><TagName tag={node.tag} /><span className="xv-punct">{'>'}</span>
      </>
    )
  } else if (type === 'self-close') {
    content = <><span className="xv-punct">{'<'}</span><TagName tag={node.tag} /><Attrs attrs={node.attrs} /><span className="xv-punct">{' />'}</span></>
  } else if (type === 'inline') {
    content = (
      <>
        <span className="xv-punct">{'<'}</span><TagName tag={node.tag} /><Attrs attrs={node.attrs} /><span className="xv-punct">{'>'}</span>
        <span className="xv-text">{node.text}</span>
        <span className="xv-punct">{'</'}</span><TagName tag={node.tag} /><span className="xv-punct">{'>'}</span>
      </>
    )
  } else if (type === 'text') {
    content = <span className="xv-text">{node.text}</span>
  } else if (type === 'comment') {
    content = <span className="xv-comment">{'<!-- '}{node.text}{' -->'}</span>
  } else if (type === 'cdata') {
    content = <><span className="xv-punct">{'<![CDATA['}</span><span className="xv-text">{node.text}</span><span className="xv-punct">{']]>'}</span></>
  } else if (type === 'pi') {
    content = <>
      <span className="xv-punct">{'<?'}</span>
      <span className="xv-pi">{node.target}{node.text ? ' ' + node.text : ''}</span>
      <span className="xv-punct">{'?>'}</span>
    </>
  }

  return (
    <div
      className={`jv-row${hasToggle ? ' jv-row--toggle' : ''}`}
      onClick={hasToggle ? () => onToggle(node.path) : undefined}
    >
      {showNums && <span className="jv-lnum">{lineNum}</span>}
      <span className="jv-indent" style={{ width: depth * INDENT }} />
      <span className={hasToggle ? 'jv-toggle' : 'jv-toggle-gap'}>
        {type === 'open' ? '▾' : type === 'collapsed' ? '▸' : ''}
      </span>
      <span className="jv-text">{content}</span>
    </div>
  )
})

// ── Main component ────────────────────────────────────────────────────────────

export default function XmlViewer({ meta }) {
  const [text, setText]           = useState('')
  const [collapsed, setCollapsed] = useState(new Set())
  const [showNums, setShowNums]   = useState(true)
  const [copied, setCopied]       = useState(false)

  const { doc, error } = useMemo(() => parseXml(text), [text])

  const flatNodes = useMemo(() => flattenDoc(doc, collapsed), [doc, collapsed])

  const handleText = e => { setText(e.target.value); setCollapsed(new Set()) }

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
    if (next.has(path)) next.delete(path); else next.add(path)
    return next
  }), [])

  const expandAll   = () => setCollapsed(new Set())
  const collapseAll = () => setCollapsed(new Set(flatNodes.filter(n => n.type === 'open').map(n => n.path)))

  const copyText = async () => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  const rootTag  = doc?.documentElement?.tagName ?? null
  const hasData  = flatNodes.length > 0

  return (
    <div className="tool-ui jv-ui">
      <ToolHeader meta={meta} />

      <div className="form-field">
        <div className="jv-input-header">
          <span className="form-label">XML input</span>
          <label className="jv-file-btn">
            Load file
            <input
              type="file"
              accept=".xml,.xsl,.xslt,.svg,.html,.xhtml,.txt"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
          </label>
        </div>
        <textarea
          className="text-area"
          style={{ minHeight: 120, maxHeight: 200, resize: 'vertical' }}
          placeholder="Paste XML here…"
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
            <span className="jv-badge">XML</span>
            {rootTag && <span className="xv-root-badge">&lt;{rootTag}&gt;</span>}
            <span className="jv-line-count">{flatNodes.length} lines</span>
            <div className="jv-toolbar-actions">
              <button className="jv-btn" type="button" onClick={expandAll}>Expand all</button>
              <button className="jv-btn" type="button" onClick={collapseAll}>Collapse all</button>
              <button
                className={`jv-btn${showNums ? ' jv-btn--on' : ''}`}
                type="button"
                onClick={() => setShowNums(v => !v)}
              ># Lines</button>
              <button className="jv-btn" type="button" onClick={copyText}>
                {copied ? '✓ Copied' : 'Copy XML'}
              </button>
            </div>
          </div>
          <div className="jv-tree">
            {flatNodes.map((node, idx) => (
              <XmlRow
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
