import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getTools } from '../api'
import { prefetchTool } from '../toolLoaders'
import ThemeToggle from './ThemeToggle'

export default function Sidebar({ currentPath, onNavigate, theme, onToggleTheme }) {
  const [tools,     setTools]     = useState([])
  const [query,     setQuery]     = useState('')
  const [collapsed, setCollapsed] = useState(new Set())

  useEffect(() => {
    getTools().then(setTools).catch(() => {})
  }, [])

  const activeId = currentPath?.startsWith('/tools/')
    ? currentPath.slice('/tools/'.length)
    : null

  const q = query.trim().toLowerCase()

  const groups = useMemo(() => {
    const seen = new Set()
    const g = {}
    tools.forEach(t => {
      if (seen.has(t.id)) return
      seen.add(t.id)
      if (q && !t.name.toLowerCase().includes(q) &&
          !t.categories.some(c => c.toLowerCase().includes(q))) return
      const cat = t.categories[0] || 'Other'
      if (!g[cat]) g[cat] = []
      g[cat].push(t)
    })
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b))
  }, [tools, q])

  const toggle = cat => setCollapsed(prev => {
    const s = new Set(prev)
    s.has(cat) ? s.delete(cat) : s.add(cat)
    return s
  })

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <Link to="/" className="sidebar-brand" onClick={onNavigate}>
          <span>🔧</span>
          <span className="sidebar-brand-text">UTools</span>
        </Link>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <div className="sidebar-search">
        <span className="sidebar-search-icon">⌕</span>
        <input
          className="sidebar-search-input"
          type="search"
          placeholder="Filter tools…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <nav className="sidebar-nav">
        <Link
          to="/"
          className={`sidebar-all${!activeId ? ' sidebar-all--active' : ''}`}
          onClick={onNavigate}
        >
          All tools
          <span className="sidebar-count">{tools.length}</span>
        </Link>

        {groups.map(([cat, catTools]) => {
          const open = !collapsed.has(cat)
          return (
            <div key={cat} className="sidebar-group">
              <button className="sidebar-group-hd" onClick={() => toggle(cat)}>
                <span>{cat}</span>
                <span className={`sidebar-caret${open ? ' open' : ''}`}>›</span>
              </button>
              {open && catTools.map(t => (
                <Link
                  key={t.id}
                  to={`/tools/${t.id}`}
                  className={`sidebar-item${activeId === t.id ? ' active' : ''}`}
                  onClick={onNavigate}
                  onMouseEnter={() => prefetchTool(t.id)}
                >
                  <span className="sidebar-item-icon">{t.icon}</span>
                  {t.name}
                </Link>
              ))}
            </div>
          )
        })}

        {q && groups.length === 0 && (
          <p className="sidebar-empty">No tools match</p>
        )}
      </nav>
    </aside>
  )
}
