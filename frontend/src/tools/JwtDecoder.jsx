import { useState, useMemo } from 'react'
import ToolHeader from '../components/ToolHeader'

// ── Client-side JWT decode (no backend needed) ────────────────────────────

function b64urlDecode(str) {
  // Convert base64url → base64, pad to multiple of 4
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return JSON.parse(atob(s + pad))
}

function decodeJwt(raw) {
  const token = raw.trim()
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return { error: 'Invalid JWT — expected 3 dot-separated parts' }
  try {
    const header    = b64urlDecode(parts[0])
    const payload   = b64urlDecode(parts[1])
    return { header, payload, signature: parts[2] }
  } catch {
    return { error: 'Could not decode — invalid base64 or JSON' }
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────

function fmtTime(unix) {
  return new Date(unix * 1000).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })
}

function CopyPre({ label, badge, data, mono }) {
  const [copied, setCopied] = useState(false)
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)

  const copy = () => navigator.clipboard.writeText(text).then(() => {
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  })

  return (
    <div className="jwt-panel">
      <div className="jwt-panel-header">
        <span className="jwt-panel-label">{label}</span>
        {badge && <span className="jwt-badge">{badge}</span>}
        <button type="button" className="copy-btn" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className={`jwt-pre${mono ? ' jwt-sig' : ''}`}>{text}</pre>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function JwtDecoder({ meta }) {
  const [token,   setToken]   = useState('')
  const [copied,  setCopied]  = useState(false)

  const result = useMemo(() => decodeJwt(token), [token])

  const expStatus = useMemo(() => {
    if (!result?.payload?.exp) return null
    const now = Date.now()
    const exp = result.payload.exp * 1000
    if (exp < now) return { status: 'expired', label: 'Expired', time: fmtTime(result.payload.exp) }
    // warn if expiring in <5 min
    if (exp - now < 5 * 60 * 1000) return { status: 'expiring', label: 'Expiring soon', time: fmtTime(result.payload.exp) }
    return { status: 'valid', label: 'Valid', time: fmtTime(result.payload.exp) }
  }, [result])

  const nbf = result?.payload?.nbf
    ? fmtTime(result.payload.nbf)
    : null
  const iat = result?.payload?.iat
    ? fmtTime(result.payload.iat)
    : null

  const copyToken = () => navigator.clipboard.writeText(token).then(() => {
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  })

  return (
    <div className="tool-ui tool-ui--wide">
      <ToolHeader meta={meta} />

      <div className="lr-layout lr-layout--jwt">
        {/* ── Left: input ───────────────────────────────────────────────── */}
        <div className="lr-pane">
          <div className="lr-pane-label">JWT Token</div>
          <textarea
            className="text-area lr-textarea"
            placeholder="Paste your JWT here — decoded instantly"
            value={token}
            onChange={e => setToken(e.target.value)}
            spellCheck={false}
          />
          {token && (
            <div className="jwt-token-footer">
              <span className="jwt-part-count">
                {token.split('.').length === 3 ? '3 parts' : `${token.split('.').length} parts (need 3)`}
              </span>
              <button type="button" className="copy-btn" onClick={copyToken}>
                {copied ? '✓ Copied' : 'Copy token'}
              </button>
            </div>
          )}
        </div>

        <div className="lr-divider lr-divider--plain" />

        {/* ── Right: decoded output ─────────────────────────────────────── */}
        <div className="lr-pane">
          {!token && (
            <div className="lr-empty">Decoded output appears here as you type</div>
          )}

          {result?.error && (
            <div className="alert alert--error">⚠ {result.error}</div>
          )}

          {result && !result.error && (
            <div className="jwt-panels">
              {/* Timing badges */}
              {expStatus && (
                <div className={`jwt-exp jwt-exp--${expStatus.status}`}>
                  <span className="jwt-exp-dot">●</span>
                  {expStatus.label}
                  <span className="jwt-exp-time">exp: {expStatus.time}</span>
                </div>
              )}
              {nbf && (
                <div className="jwt-exp jwt-exp--meta">
                  Not before: {nbf}
                </div>
              )}
              {iat && (
                <div className="jwt-exp jwt-exp--meta">
                  Issued at: {iat}
                </div>
              )}

              <CopyPre label="Header"    badge={result.header.alg} data={result.header} />
              <CopyPre label="Payload"                             data={result.payload} />
              <CopyPre label="Signature" badge="base64url"         data={result.signature} mono />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
