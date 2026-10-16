export function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`
}

export async function parseErrorDetail(res) {
  try {
    const body = await res.json()
    return body.detail || `Server error (${res.status})`
  } catch {
    return `Server error (${res.status})`
  }
}

export function humanizeNetworkError(err) {
  return err.name === 'TypeError'
    ? 'Cannot reach the server. Make sure the backend is running.'
    : err.message
}
