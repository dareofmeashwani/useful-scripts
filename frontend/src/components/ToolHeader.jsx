export default function ToolHeader({ meta }) {
  if (!meta) {
    return (
      <div className="tool-ui-header">
        <div className="skeleton-box" style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton-line" style={{ width: 140, height: 18, marginBottom: 6 }} />
          <div className="skeleton-line" style={{ width: 220, height: 13 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="tool-ui-header">
      <span className="tool-ui-icon">{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 className="tool-ui-title">{meta.name}</h1>
          <div className="tool-tags">
            {meta.categories.map(c => (
              <span key={c} className="tool-tag">{c}</span>
            ))}
          </div>
        </div>
        <p className="tool-ui-desc">{meta.description}</p>
      </div>
    </div>
  )
}
