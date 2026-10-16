import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTools } from '../api'
import { prefetchTool } from '../toolLoaders'

const SKELETON_COUNT = 8

export default function Home() {
  const [query,    setQuery]    = useState('')
  const [tools,    setTools]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [offline,  setOffline]  = useState(false)
  const [category, setCategory] = useState('All')
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'UTools — Local Browser Toolbox'
    getTools()
      .then(data => { setTools(data); setLoading(false) })
      .catch(() => { setOffline(true); setLoading(false) })
  }, [])

  const categories = useMemo(() => {
    const cats = new Set()
    tools.forEach(t => t.categories.forEach(c => cats.add(c)))
    return ['All', ...Array.from(cats).sort()]
  }, [tools])

  const q = query.trim().toLowerCase()
  const filtered = tools.filter(t => {
    const matchQ   = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.categories.some(c => c.toLowerCase().includes(q))
    const matchCat = category === 'All' || t.categories.includes(category)
    return matchQ && matchCat
  })

  return (
    <div className="home">
      <header className="home-header">
        <h1 className="home-title">UTools</h1>
        <p className="home-sub">Pick a tool and get things done</p>
      </header>

      {offline && (
        <div className="alert alert--error" style={{ maxWidth: 540 }}>
          ⚠ Cannot reach the backend. Make sure <code>uvicorn</code> is running on port 9000.
        </div>
      )}

      <div className="search-wrap">
        <input
          className="search-input"
          type="search"
          placeholder={loading ? 'Loading tools…' : `Search ${tools.length} tools…`}
          value={query}
          disabled={loading || offline}
          autoFocus
          onChange={e => { setQuery(e.target.value); setCategory('All') }}
        />
        <span className="search-icon">{loading ? '…' : '⌕'}</span>
      </div>

      {!loading && !offline && categories.length > 2 && (
        <div className="cat-filter">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              className={`cat-chip${category === cat ? ' cat-chip--active' : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <section className="tools-grid">
        {loading ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div key={i} className="tool-card-skeleton" style={{ animationDelay: `${i * 60}ms` }} />
          ))
        ) : offline ? null : filtered.length === 0 ? (
          <p className="no-results">No tools match "{query}"</p>
        ) : (
          filtered.map(tool => (
            <div
              key={tool.id}
              className="tool-card"
              onClick={() => navigate(`/tools/${tool.id}`)}
              onMouseEnter={() => prefetchTool(tool.id)}
            >
              <span className="tool-icon">{tool.icon}</span>
              <div className="tool-info">
                <h2 className="tool-name">{tool.name}</h2>
                <p className="tool-desc">{tool.description}</p>
                <div className="tool-tags">
                  {tool.categories.map(c => (
                    <span key={c} className="tool-tag">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
