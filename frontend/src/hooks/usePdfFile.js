import { useState, useCallback } from 'react'

const MAX_MB = 50

/**
 * Manages a single PDF file's state + client-side validation.
 * Returns { file, fileError, applyFile, reset }.
 */
export default function usePdfFile() {
  const [file, setFile]           = useState(null)
  const [fileError, setFileError] = useState(null)

  const applyFile = useCallback(f => {
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Only PDF files are supported'); return
    }
    if (f.size === 0)                   { setFileError('File is empty'); return }
    if (f.size > MAX_MB * 1024 * 1024) { setFileError(`File too large (max ${MAX_MB} MB)`); return }
    setFile(f)
    setFileError(null)
  }, [])

  const reset = useCallback(() => { setFile(null); setFileError(null) }, [])

  return { file, fileError, applyFile, reset }
}
