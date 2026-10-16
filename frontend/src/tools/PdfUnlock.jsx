import { useState } from 'react'
import FileZone from '../components/FileZone'
import ToolHeader from '../components/ToolHeader'
import usePdfFile from '../hooks/usePdfFile'
import { formatSize, parseErrorDetail, humanizeNetworkError } from '../utils'
import { apiPost } from '../api'

export default function PdfUnlock({ meta }) {
  const { file, fileError, applyFile } = usePdfFile()
  const [password, setPassword]         = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [downloadUrl, setDownloadUrl]   = useState(null)
  const [downloadName, setDownloadName] = useState('')
  const [downloadSize, setDownloadSize] = useState(null)

  const handleSubmit = async e => {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)
    setDownloadUrl(null)

    const form = new FormData()
    form.append('file', file)
    form.append('password', password)

    try {
      const res = await apiPost('/tools/pdf-unlock', form)
      if (!res.ok) throw new Error(await parseErrorDetail(res))

      const blob = await res.blob()
      setDownloadUrl(URL.createObjectURL(blob))
      setDownloadName(`unlocked_${file.name}`)
      setDownloadSize(blob.size)
    } catch (err) {
      setError(humanizeNetworkError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tool-ui">
      <ToolHeader meta={meta} />

      <form className="tool-form" onSubmit={handleSubmit}>
        <FileZone
          file={file}
          error={!!fileError}
          onSelect={applyFile}
          accept=".pdf,application/pdf"
          hint="Click or drag a PDF here"
          subhint="Max 50 MB"
        />
        {fileError && <div className="alert alert--error">{fileError}</div>}

        <div className="form-field">
          <label className="form-label" htmlFor="pdf-pass">PDF Password</label>
          <input
            id="pdf-pass"
            className="form-input"
            type="password"
            placeholder="Enter the file password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="off"
          />
        </div>

        <button className="submit-btn" type="submit" disabled={!file || !!fileError || loading}>
          {loading && <span className="spinner" />}
          {loading ? 'Unlocking…' : 'Unlock PDF'}
        </button>
      </form>

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {downloadUrl && (
        <div className="result-card">
          <div className="result-card-top">
            <div className="result-card-icon">🔓</div>
            <div className="result-card-body">
              <p className="result-card-title">PDF unlocked successfully</p>
              <p className="result-card-name">
                {downloadName}{downloadSize ? ` · ${formatSize(downloadSize)}` : ''}
              </p>
            </div>
          </div>
          <a className="download-btn" href={downloadUrl} download={downloadName}>
            ⬇ Download {downloadName}
          </a>
        </div>
      )}
    </div>
  )
}
