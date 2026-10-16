import { useRef } from 'react'
import { formatSize } from '../utils'

/**
 * Reusable file drop zone.
 *
 * Single mode  – pass `file` (File | null). Shows file name + size when selected.
 * Multi mode   – pass `multiple` + `count` (number). Shows count when files are added.
 *
 * `onSelect` receives a single File (single mode) or FileList (multi mode).
 */
export default function FileZone({
  file     = null,
  count    = 0,
  error    = false,
  onSelect,
  accept   = '*',
  multiple = false,
  hint     = 'Click or drag a file here',
  subhint  = '',
}) {
  const ref = useRef(null)

  const pick = list => {
    if (!list?.length) return
    onSelect(multiple ? list : list[0])
  }

  const selected = multiple ? count > 0 : !!file

  return (
    <div
      className={`file-zone${selected ? ' file-zone--selected' : ''}${error ? ' file-zone--error' : ''}`}
      onClick={() => ref.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files) }}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={e => { pick(e.target.files); e.target.value = '' }}
      />

      {multiple ? (
        <>
          <span className="file-zone-icon">{count > 0 ? '🖼️' : '⬆'}</span>
          <span className="file-zone-name">
            {count > 0 ? `${count} file${count !== 1 ? 's' : ''} selected — click to add more` : hint}
          </span>
          {subhint && <span className="file-zone-size">{subhint}</span>}
        </>
      ) : (
        <>
          <span className="file-zone-icon">{file ? '📄' : '⬆'}</span>
          <span className="file-zone-name">{file ? file.name : hint}</span>
          <span className="file-zone-size">{file ? formatSize(file.size) : subhint}</span>
        </>
      )}
    </div>
  )
}
