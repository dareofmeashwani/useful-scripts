import { useState } from 'react'
import ToolHeader from '../components/ToolHeader'

const MIN = 1
const MAX = 100

export default function UuidGenerator({ meta }) {
  const [count, setCount]         = useState(1)
  const [uuids, setUuids]         = useState([])
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const handleSubmit = e => {
    e.preventDefault()
    setUuids(Array.from({ length: count }, () => crypto.randomUUID()))
  }

  const copyOne = (id, idx) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1500)
    })
  }

  const copyAll = () => {
    navigator.clipboard.writeText(uuids.join('\n')).then(() => {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 1500)
    })
  }

  return (
    <div className="tool-ui">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={handleSubmit}>
        <div className="uuid-controls">
          <div className="uuid-count-field">
            <label className="form-label">How many UUIDs?</label>
            <div className="uuid-stepper">
              <button
                type="button"
                className="stepper-btn"
                onClick={() => setCount(c => Math.max(MIN, c - 1))}
                disabled={count <= MIN}
              >−</button>
              <input
                className="stepper-input"
                type="number"
                min={MIN}
                max={MAX}
                value={count}
                onChange={e => {
                  const v = Math.min(MAX, Math.max(MIN, parseInt(e.target.value) || MIN))
                  setCount(v)
                }}
              />
              <button
                type="button"
                className="stepper-btn"
                onClick={() => setCount(c => Math.min(MAX, c + 1))}
                disabled={count >= MAX}
              >+</button>
            </div>
          </div>

          <button className="submit-btn uuid-generate-btn" type="submit">
            Generate {count} UUID{count !== 1 ? 's' : ''}
          </button>
        </div>
      </form>

      {uuids.length > 0 && (
        <div className="uuid-result">
          <div className="uuid-result-header">
            <span className="uuid-result-count">{uuids.length} UUID{uuids.length !== 1 ? 's' : ''} generated</span>
            <button type="button" className="copy-btn" onClick={copyAll}>
              {copiedAll ? '✓ Copied all' : 'Copy all'}
            </button>
          </div>
          <ul className="uuid-list">
            {uuids.map((id, i) => (
              <li key={id} className="uuid-row">
                <span className="uuid-index">{i + 1}</span>
                <code className="uuid-value">{id}</code>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyOne(id, i)}
                >
                  {copiedIdx === i ? '✓' : 'Copy'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
