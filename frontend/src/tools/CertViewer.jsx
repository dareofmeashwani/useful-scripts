import { useState, useRef } from 'react'
import * as x509 from '@peculiar/x509'
import ToolHeader from '../components/ToolHeader'

// ── parsing helpers ───────────────────────────────────────────────────────────

function dnToObj(name) {
  const fields = ['CN', 'O', 'OU', 'L', 'ST', 'C', 'E']
  const result = {}
  for (const f of fields) {
    try {
      const vals = name.getField(f)
      if (vals.length) result[f] = vals[0]
    } catch { /* skip unknown fields */ }
  }
  return result
}

function bufToColons(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':')
}

function formatSigAlg(alg) {
  if (!alg) return 'unknown'
  const base = (alg.name || '').replace('RSASSA-PKCS1-v1_5', 'RSA')
  const hash = alg.hash?.name
  return hash ? `${hash} with ${base}` : (base || 'unknown')
}

const KEY_USAGE_FLAGS = {
  1:   'Digital Signature',
  2:   'Non Repudiation',
  4:   'Key Encipherment',
  8:   'Data Encipherment',
  16:  'Key Agreement',
  32:  'Key Cert Sign',
  64:  'CRL Sign',
  128: 'Encipher Only',
  256: 'Decipher Only',
}

const EKU_LABELS = {
  '1.3.6.1.5.5.7.3.1': 'Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'Email Protection',
  '1.3.6.1.5.5.7.3.8': 'Timestamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
}

async function parseSingleCert(certInput) {
  const cert = new x509.X509Certificate(certInput)
  const der  = cert.rawData

  const [sha1Buf, sha256Buf] = await Promise.all([
    crypto.subtle.digest('SHA-1',   der),
    crypto.subtle.digest('SHA-256', der),
  ])

  // Key usage
  const ku       = cert.getExtension(x509.KeyUsagesExtension)
  const keyUsage = ku
    ? Object.entries(KEY_USAGE_FLAGS)
        .filter(([f]) => ku.usages & Number(f))
        .map(([, label]) => label)
    : []

  // Extended key usage
  const eku        = cert.getExtension(x509.ExtendedKeyUsageExtension)
  const extKeyUsage = eku ? eku.usages.map(oid => EKU_LABELS[oid] || oid) : []

  // SANs
  const sanExt = cert.getExtension(x509.SubjectAlternativeNameExtension)
  const san = sanExt
    ? sanExt.names.items.map(n => `${String(n.type || '').toUpperCase()}:${n.value}`)
    : []

  // Basic constraints
  const bc = cert.getExtension(x509.BasicConstraintsExtension)

  // SKI / AKI
  const skiExt = cert.getExtension(x509.SubjectKeyIdentifierExtension)
  const akiExt = cert.getExtension(x509.AuthorityKeyIdentifierExtension)

  // Public key info
  const pkAlg  = cert.publicKey.algorithm
  const pkName = (pkAlg.name || '').toLowerCase()
  let publicKey = { algorithm: pkAlg.name || 'Unknown', size: null, curve: undefined }

  if (pkName === 'ec' || pkName === 'ecdsa') {
    const curveSizes = { 'P-256': 256, 'P-384': 384, 'P-521': 521 }
    publicKey = { algorithm: 'EC', curve: pkAlg.namedCurve, size: curveSizes[pkAlg.namedCurve] ?? null }
  } else if (pkName === 'ed25519') {
    publicKey = { algorithm: 'Ed25519', size: 256 }
  } else if (pkName === 'ed448') {
    publicKey = { algorithm: 'Ed448', size: 448 }
  } else if (pkName.includes('rsa')) {
    try {
      const spki   = cert.publicKey.rawData
      const key    = await crypto.subtle.importKey(
        'spki', spki,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true, ['verify'],
      )
      const jwk    = await crypto.subtle.exportKey('jwk', key)
      const nBytes = Uint8Array.from(atob(jwk.n.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      const size   = nBytes[0] === 0 ? (nBytes.length - 1) * 8 : nBytes.length * 8
      publicKey = { algorithm: 'RSA', size }
    } catch {
      publicKey = { algorithm: 'RSA', size: null }
    }
  }

  const now = new Date()
  return {
    subject:             dnToObj(cert.subjectName),
    issuer:              dnToObj(cert.issuerName),
    serial:              cert.serialNumber,
    version:             cert.version + 1,
    not_before:          cert.notBefore.toISOString(),
    not_after:           cert.notAfter.toISOString(),
    is_expired:          cert.notAfter < now,
    days_remaining:      Math.floor((cert.notAfter - now) / 86_400_000),
    signature_algorithm: formatSigAlg(cert.signatureAlgorithm),
    public_key:          publicKey,
    is_ca:               bc?.ca ?? false,
    path_length:         bc?.pathLength ?? null,
    key_usage:           keyUsage,
    ext_key_usage:       extKeyUsage,
    san,
    subject_key_id:   skiExt ? bufToColons(skiExt.keyId)  : null,
    authority_key_id: akiExt?.keyId ? bufToColons(akiExt.keyId) : null,
    fingerprint_sha1:   bufToColons(sha1Buf),
    fingerprint_sha256: bufToColons(sha256Buf),
    pem: cert.toString('pem'),
  }
}

async function parseInput(input) {
  if (typeof input === 'string') {
    const blocks = input.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
    if (!blocks?.length) throw new Error('No certificate blocks found — expected PEM format')
    return Promise.all(blocks.map(b => parseSingleCert(b)))
  }
  // ArrayBuffer → DER
  if (new Uint8Array(input)[0] !== 0x30)
    throw new Error('File does not appear to be a DER certificate')
  return [await parseSingleCert(input)]
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function validityBadge(cert) {
  if (cert.is_expired)           return { cls: 'cert-badge cert-badge--expired', label: 'Expired' }
  if (cert.days_remaining <= 30) return { cls: 'cert-badge cert-badge--warn',    label: `${cert.days_remaining}d left` }
  return                                { cls: 'cert-badge cert-badge--ok',      label: `${cert.days_remaining}d left` }
}

function dnLine(dn) {
  if (!dn || !Object.keys(dn).length) return '—'
  const order = ['CN', 'O', 'OU', 'L', 'ST', 'C']
  return [
    ...order.filter(k => dn[k]).map(k => `${k}=${dn[k]}`),
    ...Object.keys(dn).filter(k => !order.includes(k)).map(k => `${k}=${dn[k]}`),
  ].join(', ')
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

// ── certificate card ──────────────────────────────────────────────────────────

function CertCard({ cert, index, total }) {
  const [expanded, setExpanded] = useState(true)
  const [pemCopied, setPemCopied] = useState(false)
  const [fpCopied,  setFpCopied]  = useState(null)

  const badge = validityBadge(cert)
  const title = cert.subject?.CN || cert.subject?.O || `Certificate ${index + 1}`
  const role  = cert.is_ca
    ? (index === 0 && total > 1 ? 'Root CA' : total > 1 ? 'Intermediate CA' : 'CA Certificate')
    : 'End-entity'

  const copyPem = () =>
    navigator.clipboard.writeText(cert.pem).then(() => {
      setPemCopied(true); setTimeout(() => setPemCopied(false), 1800)
    })

  const copyFp = (which, value) =>
    navigator.clipboard.writeText(value).then(() => {
      setFpCopied(which); setTimeout(() => setFpCopied(null), 1800)
    })

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
              <Row label="Subject"         value={dnLine(cert.subject)} />
              <Row label="Issuer"          value={dnLine(cert.issuer)} />
              <Row label="Version"         value={`v${cert.version}`} />
              <Row label="Serial"          value={cert.serial} mono />
              <Row label="Not Before"      value={fmtDate(cert.not_before)} />
              <Row label="Not After"       value={fmtDate(cert.not_after)} />
              <Row label="Sig. Algorithm"  value={cert.signature_algorithm} />
              <Row label="Public Key"      value={
                cert.public_key.curve
                  ? `${cert.public_key.algorithm} / ${cert.public_key.curve}${cert.public_key.size ? ` (${cert.public_key.size}-bit)` : ''}`
                  : `${cert.public_key.algorithm}${cert.public_key.size ? ` (${cert.public_key.size}-bit)` : ''}`
              } />
              <Row label="Is CA" value={
                cert.is_ca
                  ? `Yes${cert.path_length != null ? ` (path length ${cert.path_length})` : ''}`
                  : 'No'
              } />
              {cert.key_usage.length > 0 && (
                <Row label="Key Usage"      value={cert.key_usage.join(', ')} />
              )}
              {cert.ext_key_usage.length > 0 && (
                <Row label="Ext. Key Usage" value={cert.ext_key_usage.join(', ')} />
              )}
              {cert.san.length > 0 && (
                <Row label="SANs" value={cert.san.join('\n')} mono />
              )}
              {cert.subject_key_id && (
                <Row label="Subject Key ID"   value={cert.subject_key_id} mono />
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

// ── main component ────────────────────────────────────────────────────────────

export default function CertViewer({ meta }) {
  const [pemText, setPemText] = useState('')
  const [chain,   setChain]   = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState(null)
  const fileRef = useRef(null)

  const reset = () => { setChain(null); setError(null) }

  const runParse = async input => {
    setLoading(true)
    setError(null)
    setChain(null)
    try {
      setChain(await parseInput(input))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFile = e => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setPemText('')
    reset()
    f.text().then(text => {
      // If the file looks like PEM use text, otherwise read as DER
      if (text.includes('-----BEGIN')) {
        runParse(text)
      } else {
        f.arrayBuffer().then(buf => runParse(buf))
      }
    })
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (pemText.trim()) runParse(pemText)
  }

  const handleTextChange = e => {
    setPemText(e.target.value)
    setFileName(null)
    reset()
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

      <form className="tool-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label className="form-label">Certificate (PEM or DER)</label>
          <textarea
            className="text-area"
            rows={8}
            placeholder={"Paste PEM text here — supports single certs and full chains\n\n-----BEGIN CERTIFICATE-----\n..."}
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
              accept=".pem,.crt,.cer,.der,.p7b"
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
