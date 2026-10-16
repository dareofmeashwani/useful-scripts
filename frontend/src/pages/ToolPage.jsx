import { useEffect, useState, lazy, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getTools } from '../api'
import { TOOL_COMPONENTS, TOOL_LOADERS } from '../toolLoaders'

// Wrap heavy tools in React.lazy — only their chunks load when the user opens them
const LAZY_COMPONENTS = Object.fromEntries(
  Object.entries(TOOL_LOADERS).map(([id, load]) => [id, lazy(load)]),
)

function ToolLoadingFallback() {
  return (
    <div className="tool-ui">
      <div className="tool-ui-header">
        <div className="skeleton-box" style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton-line" style={{ width: 140, height: 18 }} />
          <div className="skeleton-line" style={{ width: 220, height: 13 }} />
        </div>
      </div>
      <div className="skeleton-line" style={{ height: 100, borderRadius: 12 }} />
      <div className="skeleton-line" style={{ height: 44, borderRadius: 10 }} />
    </div>
  )
}

export default function ToolPage() {
  const { toolId } = useParams()
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    getTools()
      .then(tools => {
        const found = tools.find(t => t.id === toolId) ?? null
        setMeta(found)
        if (found) document.title = `${found.name} | UTools`
      })
      .catch(() => {})
    return () => { document.title = 'UTools — Local Browser Toolbox' }
  }, [toolId])

  const EagerComponent = TOOL_COMPONENTS[toolId]
  if (EagerComponent) {
    return (
      <div className="tool-page">
        <Link to="/" className="back-link">← All tools</Link>
        <EagerComponent meta={meta} />
      </div>
    )
  }

  const LazyComponent = LAZY_COMPONENTS[toolId]
  if (LazyComponent) {
    return (
      <div className="tool-page">
        <Link to="/" className="back-link">← All tools</Link>
        <Suspense fallback={<ToolLoadingFallback />}>
          <LazyComponent meta={meta} />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="tool-page">
      <Link to="/" className="back-link">← All tools</Link>
      <p className="no-results">Tool "{toolId}" not found.</p>
    </div>
  )
}
