// Dev: Vite runs on :5173, backend on :9000 → absolute URL needed.
// Prod (bundled): frontend is served by the same uvicorn process
//   → relative URLs work regardless of which port was chosen at runtime.
const BASE = import.meta.env.DEV ? 'http://localhost:9000' : ''

let _toolsCache = null
let _toolsPromise = null

export async function getTools() {
  if (_toolsCache) return _toolsCache
  // Dedupe concurrent first-load callers (Home + Sidebar mount together) so
  // they share a single /tools request instead of racing two.
  if (!_toolsPromise) {
    _toolsPromise = fetch(`${BASE}/tools`)
      .then(res => {
        if (!res.ok) throw new Error('bad response')
        return res.json()
      })
      .then(tools => {
        _toolsCache = tools
        return tools
      })
      .catch(err => {
        _toolsPromise = null // allow a later retry
        throw err
      })
  }
  return _toolsPromise
}

export const apiPost = (path, body) =>
  fetch(`${BASE}${path}`, { method: 'POST', body })
