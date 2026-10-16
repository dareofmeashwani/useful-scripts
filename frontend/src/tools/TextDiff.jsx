import { useState, useMemo, memo } from 'react'
import ToolHeader from '../components/ToolHeader'

const CTX = 3          // context lines around each change
const MAX_LINES = 2000 // LCS limit per side

// ── LCS-based diff algorithm ──────────────────────────────────────────────────

function computeOps(a, b) {
  const n = Math.min(a.length, MAX_LINES)
  const m = Math.min(b.length, MAX_LINES)

  // Build LCS DP table
  const dp = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1)
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])

  // Backtrack
  const ops = []
  let i = n, j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'eq',  text: a[i - 1], an: i, bn: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add', text: b[j - 1], an: null, bn: j })
      j--
    } else {
      ops.push({ type: 'del', text: a[i - 1], an: i, bn: null })
      i--
    }
  }
  return ops.reverse()
}

function computeDiff(left, right) {
  const a = left.split('\n')
  const b = right.split('\n')
  const truncated = a.length > MAX_LINES || b.length > MAX_LINES
  const ops = computeOps(a, b)

  let added = 0, removed = 0, equal = 0
  ops.forEach(o => { if (o.type === 'add') added++; else if (o.type === 'del') removed++; else equal++ })

  return { ops, stats: { added, removed, equal }, truncated }
}

// ── Build rows with context collapsing ───────────────────────────────────────

function buildRows(ops, showAll) {
  if (ops.length === 0) return []

  const changed = ops.map(o => o.type !== 'eq')

  // Mark which indices are visible (within CTX of any change)
  const vis = ops.map((_, i) => {
    if (changed[i]) return true
    for (let d = 1; d <= CTX; d++) {
      if (changed[i - d] || changed[i + d]) return true
    }
    return false
  })

  if (showAll) return ops

  const rows = []
  let skipCount = 0

  for (let i = 0; i < ops.length; i++) {
    if (vis[i]) {
      if (skipCount > 0) { rows.push({ type: 'sep', count: skipCount }); skipCount = 0 }
      rows.push(ops[i])
    } else {
      skipCount++
    }
  }
  if (skipCount > 0) rows.push({ type: 'sep', count: skipCount })
  return rows
}

// ── Row component ─────────────────────────────────────────────────────────────

const DiffRow = memo(function DiffRow({ row }) {
  if (row.type === 'sep') {
    return (
      <tr className="df-sep">
        <td className="df-lnum" />
        <td className="df-lnum" />
        <td className="df-sign" />
        <td className="df-content df-sep-label">
          @@ {row.count} unchanged line{row.count !== 1 ? 's' : ''} @@
        </td>
      </tr>
    )
  }

  const cls  = row.type === 'add' ? 'df-row df-add' : row.type === 'del' ? 'df-row df-del' : 'df-row'
  const sign = row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '

  return (
    <tr className={cls}>
      <td className="df-lnum">{row.an ?? ''}</td>
      <td className="df-lnum">{row.bn ?? ''}</td>
      <td className="df-sign">{sign}</td>
      <td className="df-content"><span>{row.text}</span></td>
    </tr>
  )
})

// ── File loader helper ────────────────────────────────────────────────────────

function FileLoadBtn({ onLoad }) {
  return (
    <label className="jv-file-btn">
      Load file
      <input
        type="file"
        accept=".txt,.md,.js,.ts,.jsx,.tsx,.py,.java,.go,.rs,.css,.html,.xml,.json,.yaml,.yml,.csv,.sh,.env,.conf,.log"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (!f) return
          const reader = new FileReader()
          reader.onload = ev => onLoad(ev.target.result)
          reader.readAsText(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TextDiff({ meta }) {
  const [left, setLeft]       = useState('')
  const [right, setRight]     = useState('')
  const [showAll, setShowAll] = useState(false)

  const { ops, stats, truncated } = useMemo(
    () => (left || right) ? computeDiff(left, right) : { ops: [], stats: null, truncated: false },
    [left, right]
  )

  const rows     = useMemo(() => buildRows(ops, showAll), [ops, showAll])
  const hasChanges = stats && (stats.added > 0 || stats.removed > 0)
  const identical  = stats && stats.added === 0 && stats.removed === 0 && stats.equal > 0

  const clearAll = () => { setLeft(''); setRight('') }

  return (
    <div className="tool-ui tool-ui--wide">
      <ToolHeader meta={meta} />

      {/* Input panes */}
      <div className="df-inputs">
        <div className="df-input-pane">
          <div className="jv-input-header">
            <span className="lr-pane-label">Original</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {left && <button type="button" className="jv-file-btn" onClick={() => setLeft('')}>Clear</button>}
              <FileLoadBtn onLoad={setLeft} />
            </div>
          </div>
          <textarea
            className="text-area df-textarea"
            placeholder="Paste original text here…"
            value={left}
            onChange={e => setLeft(e.target.value)}
            spellCheck={false}
          />
          {left && (
            <div className="textarea-footer">
              {left.split('\n').length} lines · {left.length} chars
            </div>
          )}
        </div>

        <div className="df-input-pane">
          <div className="jv-input-header">
            <span className="lr-pane-label">Modified</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {right && <button type="button" className="jv-file-btn" onClick={() => setRight('')}>Clear</button>}
              <FileLoadBtn onLoad={setRight} />
            </div>
          </div>
          <textarea
            className="text-area df-textarea"
            placeholder="Paste modified text here…"
            value={right}
            onChange={e => setRight(e.target.value)}
            spellCheck={false}
          />
          {right && (
            <div className="textarea-footer">
              {right.split('\n').length} lines · {right.length} chars
            </div>
          )}
        </div>
      </div>

      {/* Notices */}
      {truncated && (
        <div className="alert alert--error">
          ⚠ Inputs exceed {MAX_LINES} lines — diff was computed on the first {MAX_LINES} lines of each side.
        </div>
      )}

      {/* Diff result */}
      {stats && (
        <div className="df-viewer">
          {/* Toolbar */}
          <div className="jv-toolbar">
            {identical ? (
              <span className="df-badge df-badge--equal">✓ Identical</span>
            ) : (
              <>
                <span className="df-badge df-badge--add">+{stats.added}</span>
                <span className="df-badge df-badge--del">−{stats.removed}</span>
                <span className="df-stat-eq">{stats.equal} unchanged</span>
              </>
            )}
            <div className="jv-toolbar-actions">
              {hasChanges && (
                <button
                  className={`jv-btn${showAll ? ' jv-btn--on' : ''}`}
                  type="button"
                  onClick={() => setShowAll(v => !v)}
                >Show all lines</button>
              )}
              <button className="jv-btn" type="button" onClick={clearAll}>Clear both</button>
            </div>
          </div>

          {/* Diff table */}
          {identical ? (
            <div className="df-equal-msg">Both texts are identical.</div>
          ) : (
            <div className="df-table-wrap">
              <table className="df-table">
                <tbody>
                  {rows.map((row, i) => <DiffRow key={i} row={row} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
