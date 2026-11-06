import { useState, useRef } from 'react'
import ToolHeader from '../components/ToolHeader'
import { apiPost } from '../api'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })
}

function validityBadge(cert) {
  if (cert.is_expired) return { cls: 'cert-badge cert-badge--expired', label: 'Expired' }
  if (cert.days_remaining <= 30) return { cls: 'cert-badge cert-badge--warn', label: `${cert.days_remaining}d left` }
  return { cls: 'cert-badge cert-badge--ok', label: `${cert.days_remaining}d left` }
}

function dnLine(dn) {
  if (!dn || !Object.keys(dn).length) return '—'
  const order = ['CN', 'O', 'OU', 'L', 'ST', 'C']
  const parts = [
    ...order.filter(k => dn[k]).map(k => `${k}=${dn[k]}`),
    ...Object.keys(dn).filter(k => !order.includes(k)).map(k => `${k}=${dn[k]}`),
  ]
  return parts.join(', ')
}

function Row({ label, value, mono }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <tr className="cert-row">
      <td className="cert-row-label">{label}</td>
      <td className={`cert-row-value${mono ? ' cert-mono' : ''}`}>{value}</td>
    </tr>
  )
}

// ── Single certificate card ───────────────────────────────────────────────────

function CertCard({ cert, index, total }) {
  const [expanded, setExpanded] = useState(true)
  const [pemCopied, setPemCopied] = useState(false)
  const [fpCopied, setFpCopied] = useState(null)

  const badge = validityBadge(cert)

  const copyPem = () =>
    navigator.clipboard.writeText(cert.pem).then(() => {
      setPemCopied(true); setTimeout(() => setPemCopied(false), 1800)
    })

  const copyFp = (which, value) =>
    navigator.clipboard.writeText(value).then(() => {
      setFpCopied(which); setTimeout(() => setFpCopied(null), 1800)
    })

  const title = cert.subject?.CN
    || cert.subject?.O
    || `Certificate ${index + 1}`

  const role = cert.is_ca
    ? (index === 0 && total > 1 ? 'Root CA' : total > 1 ? 'Intermediate CA' : 'CA Certificate')
    : 'End-entity'

  return (
    <div className={`cert-card${cert.is_expired ? ' cert-card--expired' : ''}`}>
      <div className="cert-card-header" onClick={() => setExpanded(v => !v)}>
        <div className="cert-card-title-row">
          <span className="cert-card-index">{index + 1}</span>
          <div className="cert-card-title-block">
            <span className="cert-card-cn">{title}</span>
            <span className="cert-card-role">{role}</span>
          </div>
        </div>
        <div className="cert-card-header-right">
          <span className={badge.cls}>{badge.label}</span>
          <span className="cert-expand-btn">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="cert-card-body">
          <table className="cert-table">
            <tbody>
              <Row label="Subject"    value={dnLine(cert.subject)} />
              <Row label="Issuer"     value={dnLine(cert.issuer)} />
              <Row label="Version"    value={`v${cert.version}`} />
              <Row label="Serial"     value={cert.serial} mono />
              <Row label="Not Before" value={fmtDate(cert.not_before)} />
              <Row label="Not After"  value={fmtDate(cert.not_after)} />
              <Row label="Sig. Algorithm" value={cert.signature_algorithm} />
              <Row
                label="Public Key"
                value={
                  cert.public_key.curve
                    ? `${cert.public_key.algorithm} / ${cert.public_key.curve} (${cert.public_key.size}-bit)`
                    : `${cert.public_key.algorithm}${cert.public_key.size ? ` (${cert.public_key.size}-bit)` : ''}`
                }
              />
              <Row label="Is CA"       value={cert.is_ca ? `Yes${cert.path_length != null ? ` (path length ${cert.path_length})` : ''}` : 'No'} />
              {cert.key_usage.length > 0 && (
                <Row label="Key Usage"  value={cert.key_usage.join(', ')} />
              )}
              {cert.ext_key_usage.length > 0 && (
                <Row label="Ext. Key Usage" value={cert.ext_key_usage.join(', ')} />
              )}
              {cert.san.length > 0 && (
                <Row label="SANs" value={cert.san.join('\n')} mono />
              )}
              {cert.subject_key_id && (
                <Row label="Subject Key ID" value={cert.subject_key_id} mono />
              )}
              {cert.authority_key_id && (
                <Row label="Authority Key ID" value={cert.authority_key_id} mono />
              )}
            </tbody>
          </table>

          <div className="cert-fingerprints">
            <div className="cert-fp-row">
              <span className="cert-fp-label">SHA-1</span>
              <code className="cert-fp-value">{cert.fingerprint_sha1}</code>
              <button type="button" className="copy-btn" onClick={() => copyFp('sha1', cert.fingerprint_sha1)}>
                {fpCopied === 'sha1' ? '✓' : 'Copy'}
              </button>
            </div>
            <div className="cert-fp-row">
              <span className="cert-fp-label">SHA-256</span>
              <code className="cert-fp-value cert-fp-value--256">{cert.fingerprint_sha256}</code>
              <button type="button" className="copy-btn" onClick={() => copyFp('sha256', cert.fingerprint_sha256)}>
                {fpCopied === 'sha256' ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="cert-pem-section">
            <div className="cert-pem-header">
              <span className="cert-pem-label">PEM</span>
              <button type="button" className="copy-btn" onClick={copyPem}>
                {pemCopied ? '✓ Copied' : 'Copy PEM'}
              </button>
            </div>
            <pre className="cert-pem-pre">{cert.pem}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CertViewer({ meta }) {
  const [pemText,  setPemText]  = useState('')
  const [chain,    setChain]    = useState(null)
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [fileName, setFileName] = useState(null)
  const fileRef = useRef(null)

  const reset = () => { setChain(null); setError(null) }

  const handleFile = e => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setPemText('')
    reset()
    submit(null, f)
  }

  const handleTextChange = e => {
    setPemText(e.target.value)
    setFileName(null)
    reset()
  }

  const submit = async (e, fileOverride) => {
    e?.preventDefault()
    const body = new FormData()
    if (fileOverride) {
      body.append('file', fileOverride)
    } else if (pemText.trim()) {
      body.append('pem_text', pemText.trim())
    } else {
      return
    }
    setLoading(true)
    setError(null)
    setChain(null)
    try {
      const res = await apiPost('/tools/cert-viewer', body)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      const data = await res.json()
      setChain(data.chain)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const clear = () => {
    setPemText('')
    setFileName(null)
    setChain(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="tool-ui tool-ui--wide">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={submit}>
        {/* Input area */}
        <div className="form-field">
          <label className="form-label">Certificate (PEM or DER)</label>
          <textarea
            className="text-area"
            rows={8}
            placeholder={"Paste PEM text here — supports single certs and chains\n\n-----BEGIN CERTIFICATE-----\n..."}
            value={pemText}
            onChange={handleTextChange}
            spellCheck={false}
          />
        </div>

        <div className="cert-input-row">
          <label className="file-upload-label">
            <input
              ref={fileRef}
              type="file"
              accept=".pem,.crt,.cer,.der,.p7b,.p7c"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <span className="upload-btn">Upload file</span>
          </label>
          {fileName && <span className="cert-filename">{fileName}</span>}

          <div style={{ flex: 1 }} />

          {(pemText || fileName || chain || error) && (
            <button type="button" className="copy-btn" onClick={clear}>Clear</button>
          )}
          <button
            type="submit"
            className="submit-btn cert-submit-btn"
            disabled={loading || (!pemText.trim() && !fileName)}
          >
            {loading ? 'Parsing…' : 'Inspect'}
          </button>
        </div>

        {error && <div className="alert alert--error">⚠ {error}</div>}
      </form>

      {chain && (
        <div className="cert-chain">
          <div className="cert-chain-header">
            <span className="cert-chain-title">
              {chain.length === 1 ? '1 certificate' : `${chain.length} certificates in chain`}
            </span>
          </div>
          {chain.map((cert, i) => (
            <CertCard key={i} cert={cert} index={i} total={chain.length} />
          ))}
        </div>
      )}
    </div>
  )
}
