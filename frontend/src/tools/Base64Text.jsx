import { useState } from 'react'
import ToolHeader from '../components/ToolHeader'

const MODES = ['Encode', 'Decode']

// Encode to Base64, handling multi-byte Unicode by going through UTF-8 bytes first
function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binStr = ''
  for (const b of bytes) binStr += String.fromCharCode(b)
  return btoa(binStr)
}

// Decode Base64 back to UTF-8 text; throws on invalid input
function decodeBase64(b64) {
  let binStr
  try {
    binStr = atob(b64.trim())
  } catch {
    throw new Error('Invalid Base64 input')
  }
  const bytes = Uint8Array.from(binStr, c => c.charCodeAt(0))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Decoded bytes are not valid UTF-8')
  }
}

export default function Base64Text({ meta }) {
  const [mode, setMode]     = useState('Encode')
  const [input, setInput]   = useState('')
  const [error, setError]   = useState(null)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = e => {
    e.preventDefault()
    if (!input.trim()) return
    setError(null)
    setResult(null)
    setCopied(false)
    try {
      setResult(mode === 'Encode' ? encodeBase64(input) : decodeBase64(input))
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="tool-ui tool-ui--wide">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label className="form-label">Mode</label>
          <div className="format-grid">
            {MODES.map(m => (
              <button
                key={m}
                type="button"
                className={`format-btn${mode === m ? ' format-btn--active' : ''}`}
                onClick={() => { setMode(m); setResult(null); setError(null) }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="lr-layout">
          <div className="lr-pane">
            <div className="lr-pane-label">
              {mode === 'Encode' ? 'Input' : 'Base64 input'}
            </div>
            <textarea
              className="text-area lr-textarea"
              placeholder={mode === 'Encode' ? 'Enter plain text…' : 'Enter Base64 string…'}
              value={input}
              onChange={e => { setInput(e.target.value); setResult(null); setError(null) }}
            />
            {input && <div className="textarea-footer">{input.length} chars</div>}
          </div>

          <div className="lr-divider">
            <button
              className="lr-arrow-btn"
              type="submit"
              disabled={!input.trim()}
            >
              →
            </button>
          </div>

          <div className="lr-pane">
            <div className="result-label-row">
              <span className="lr-pane-label">
                {mode === 'Encode' ? 'Encoded output' : 'Decoded output'}
              </span>
              {result !== null && (
                <button type="button" className="copy-btn" onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              )}
            </div>
            <textarea
              className="text-area lr-textarea text-area--readonly"
              readOnly
              placeholder="Output will appear here…"
              value={result ?? ''}
            />
            {result !== null && <div className="textarea-footer">{result.length} chars</div>}
          </div>
        </div>

        {error && <div className="alert alert--error">⚠ {error}</div>}
      </form>
    </div>
  )
}
