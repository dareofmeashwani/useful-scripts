import { load as yamlLoad } from 'js-yaml'

// Unified dependency-graph model produced by every parser:
//   { format, nodes: [{id,label,version,kind}], edges: [{from,to,kind}], rootId, truncated }
// kind ∈ root | prod | dev | peer | optional | build | test | transitive

export const MAX_NODES = 400

// ── Graph builder helpers ───────────────────────────────────────────────────

function makeGraph() {
  return { nodes: new Map(), edges: [], edgeSet: new Set(), rootId: null, truncated: false }
}

const nid = name => String(name).trim().toLowerCase()

function addNode(g, name, { version, kind } = {}) {
  if (!name) return null
  const id = nid(name)
  if (!g.nodes.has(id)) {
    if (g.nodes.size >= MAX_NODES) { g.truncated = true; return null }
    g.nodes.set(id, { id, label: String(name).trim(), version: version || '', kind: kind || 'prod' })
  } else {
    const n = g.nodes.get(id)
    if (version && !n.version) n.version = version
    if (kind === 'root') n.kind = 'root'      // root always wins
  }
  return id
}

function addEdge(g, fromName, toName, kind = 'prod') {
  const from = nid(fromName), to = nid(toName)
  if (from === to) return
  if (!g.nodes.has(from) || !g.nodes.has(to)) return
  const key = from + '→' + to
  if (g.edgeSet.has(key)) return
  g.edgeSet.add(key)
  g.edges.push({ from, to, kind })
}

function finalize(g, format) {
  return {
    format,
    nodes: [...g.nodes.values()],
    edges: g.edges,
    rootId: g.rootId,
    truncated: g.truncated,
  }
}

// Flat manifest: a project root with an edge to each listed dependency.
function flatManifest(format, rootName, sections, rootVersion) {
  const g = makeGraph()
  g.rootId = addNode(g, rootName, { version: rootVersion, kind: 'root' })
  for (const { deps, kind } of sections) {
    if (!deps) continue
    const entries = Array.isArray(deps) ? deps : Object.entries(deps)
    for (const entry of entries) {
      const [name, version] = Array.isArray(entry) ? entry : [entry.name, entry.version]
      if (addNode(g, name, { version: typeof version === 'string' ? version : '', kind })) {
        addEdge(g, rootName, name, kind)
      }
    }
  }
  return finalize(g, format)
}

// ── Small shared string parsers ─────────────────────────────────────────────

// PEP 508 requirement → { name, version }
function pep508(spec) {
  const s = spec.split(/[;#]/)[0].trim()
  const m = s.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(.*)$/)
  if (!m) return null
  return { name: m[1], version: m[2].trim() }
}

// ── TOML (subset) ────────────────────────────────────────────────────────────
// Supports: [table], [[array of table]], key = value, dotted keys, basic/literal
// strings, ints/floats, booleans, inline arrays (incl. multi-line) and inline
// tables. Enough for Cargo.toml, Cargo.lock, pyproject.toml and poetry.lock.

function stripTomlComment(line) {
  let out = '', q = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      out += c
      if (c === q) q = null
    } else if (c === '"' || c === "'") {
      q = c; out += c
    } else if (c === '#') {
      break
    } else {
      out += c
    }
  }
  return out
}

function parseTomlValue(raw) {
  const s = raw.trim()
  if (s === '') return ''
  if (s[0] === '"' || s[0] === "'") {
    const q = s[0]
    let out = '', i = 1
    for (; i < s.length; i++) {
      const c = s[i]
      if (c === '\\' && q === '"' && i + 1 < s.length) { out += s[++i]; continue }
      if (c === q) break
      out += c
    }
    return out
  }
  if (s === 'true') return true
  if (s === 'false') return false
  if (s[0] === '[') {
    const inner = s.slice(1, s.lastIndexOf(']'))
    return splitTopLevel(inner).map(parseTomlValue)
  }
  if (s[0] === '{') {
    const inner = s.slice(1, s.lastIndexOf('}'))
    const obj = {}
    for (const part of splitTopLevel(inner)) {
      const eq = part.indexOf('=')
      if (eq === -1) continue
      obj[unquoteKey(part.slice(0, eq).trim())] = parseTomlValue(part.slice(eq + 1))
    }
    return obj
  }
  const num = Number(s)
  return Number.isNaN(num) ? s : num
}

// Split on top-level commas, ignoring those inside quotes/brackets/braces.
function splitTopLevel(str) {
  const parts = []
  let depth = 0, q = null, cur = ''
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (q) {
      cur += c
      if (c === q) q = null
    } else if (c === '"' || c === "'") { q = c; cur += c }
    else if (c === '[' || c === '{') { depth++; cur += c }
    else if (c === ']' || c === '}') { depth--; cur += c }
    else if (c === ',' && depth === 0) { if (cur.trim()) parts.push(cur.trim()); cur = '' }
    else cur += c
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

const unquoteKey = k =>
  (k[0] === '"' || k[0] === "'") ? k.slice(1, -1) : k

function setPath(obj, pathParts, value) {
  let cur = obj
  for (let i = 0; i < pathParts.length - 1; i++) {
    const p = pathParts[i]
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}
    cur = Array.isArray(cur[p]) ? cur[p][cur[p].length - 1] : cur[p]
  }
  cur[pathParts[pathParts.length - 1]] = value
}

function dottedKey(key) {
  return splitTopLevel(key).length > 1 ? [key] : key.split('.').map(unquoteKey)
}

export function parseToml(text) {
  const root = {}
  const rawLines = text.split('\n')
  // Join multi-line values (unbalanced [ or { ) into their opening line.
  const lines = []
  for (let i = 0; i < rawLines.length; i++) {
    let line = stripTomlComment(rawLines[i])
    const eq = line.indexOf('=')
    if (eq !== -1) {
      let bal = balance(line)
      while ((bal.square > 0 || bal.curly > 0) && i + 1 < rawLines.length) {
        line += ' ' + stripTomlComment(rawLines[++i])
        bal = balance(line)
      }
    }
    lines.push(line)
  }

  let current = root            // table that key=val lines write into
  for (let line of lines) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('[[') && t.endsWith(']]')) {
      const path = t.slice(2, -2).trim().split('.').map(unquoteKey)
      const arr = ensureArray(root, path)
      const el = {}
      arr.push(el)
      current = el
    } else if (t.startsWith('[') && t.endsWith(']')) {
      const path = t.slice(1, -1).trim().split('.').map(unquoteKey)
      current = ensureTable(root, path)
    } else {
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const key = t.slice(0, eq).trim()
      const value = parseTomlValue(t.slice(eq + 1))
      const parts = dottedKey(key)
      if (parts.length === 1) current[unquoteKey(parts[0])] = value
      else setPath(current, parts, value)
    }
  }
  return root
}

function balance(s) {
  let square = 0, curly = 0, q = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === q) q = null; continue }
    if (c === '"' || c === "'") q = c
    else if (c === '[') square++
    else if (c === ']') square--
    else if (c === '{') curly++
    else if (c === '}') curly--
  }
  return { square, curly }
}

function ensureTable(root, path) {
  let cur = root
  for (const p of path) {
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}
    cur = Array.isArray(cur[p]) ? cur[p][cur[p].length - 1] : cur[p]
  }
  return cur
}

function ensureArray(root, path) {
  let cur = root
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i]
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}
    cur = Array.isArray(cur[p]) ? cur[p][cur[p].length - 1] : cur[p]
  }
  const last = path[path.length - 1]
  if (!Array.isArray(cur[last])) cur[last] = []
  return cur[last]
}

// ── Per-format parsers ───────────────────────────────────────────────────────

function parsePackageJson(obj) {
  return flatManifest('package.json', obj.name || 'package.json', [
    { deps: obj.dependencies, kind: 'prod' },
    { deps: obj.devDependencies, kind: 'dev' },
    { deps: obj.peerDependencies, kind: 'peer' },
    { deps: obj.optionalDependencies, kind: 'optional' },
  ], obj.version)
}

function parsePackageLock(obj) {
  const g = makeGraph()
  const rootName = (obj.packages && obj.packages[''] && obj.packages[''].name) || obj.name || 'root'
  g.rootId = addNode(g, rootName, { version: obj.version, kind: 'root' })

  const pathName = p => (p === '' ? rootName : p.split('node_modules/').pop())

  if (obj.packages && typeof obj.packages === 'object') {       // lockfile v2 / v3
    for (const [p, info] of Object.entries(obj.packages)) {
      const name = pathName(p)
      addNode(g, name, { version: info.version, kind: name === rootName ? 'root' : 'transitive' })
    }
    for (const [p, info] of Object.entries(obj.packages)) {
      const owner = pathName(p)
      const isRoot = owner === rootName
      const sects = [
        ['dependencies', isRoot ? 'prod' : 'transitive'],
        ['devDependencies', 'dev'],
        ['optionalDependencies', 'optional'],
        ['peerDependencies', 'peer'],
      ]
      for (const [sect, kind] of sects) {
        if (!info[sect]) continue
        for (const dep of Object.keys(info[sect])) {
          if (addNode(g, dep, { kind: isRoot ? kind : 'transitive' })) addEdge(g, owner, dep, isRoot ? kind : 'transitive')
        }
      }
    }
  } else if (obj.dependencies) {                                // lockfile v1
    const walk = (deps, owner, isRoot) => {
      for (const [name, info] of Object.entries(deps)) {
        if (!addNode(g, name, { version: info.version, kind: isRoot ? 'prod' : 'transitive' })) continue
        addEdge(g, owner, name, isRoot ? (info.dev ? 'dev' : 'prod') : 'transitive')
        if (info.requires) {
          for (const r of Object.keys(info.requires)) {
            if (addNode(g, r, { kind: 'transitive' })) addEdge(g, name, r, 'transitive')
          }
        }
        if (info.dependencies) walk(info.dependencies, name, false)
      }
    }
    walk(obj.dependencies, rootName, true)
  }
  return finalize(g, 'package-lock.json')
}

function parseComposerJson(obj) {
  return flatManifest('composer.json', obj.name || 'composer.json', [
    { deps: obj.require, kind: 'prod' },
    { deps: obj['require-dev'], kind: 'dev' },
  ], obj.version)
}

function parseComposerLock(obj) {
  const g = makeGraph()
  const pkgs = [
    ...(obj.packages || []).map(p => [p, 'prod']),
    ...(obj['packages-dev'] || []).map(p => [p, 'dev']),
  ]
  for (const [p] of pkgs) addNode(g, p.name, { version: p.version, kind: 'prod' })
  for (const [p] of pkgs) {
    if (!p.require) continue
    for (const dep of Object.keys(p.require)) {
      if (addNode(g, dep, { kind: 'transitive' })) addEdge(g, p.name, dep, 'transitive')
    }
  }
  return finalize(g, 'composer.lock')
}

function parsePipfileLock(obj) {
  const toSection = (o, kind) => ({
    deps: o ? Object.entries(o).map(([name, v]) => [name, (v && v.version) || '']) : null,
    kind,
  })
  return flatManifest('Pipfile.lock', 'Pipfile', [
    toSection(obj.default, 'prod'),
    toSection(obj.develop, 'dev'),
  ])
}

function parsePnpmLock(obj) {
  const g = makeGraph()
  const rootName = 'project'
  g.rootId = addNode(g, rootName, { kind: 'root' })

  const pnpmName = key => {
    let k = String(key).replace(/^\//, '').replace(/\(.*\)$/, '')
    const at = k.lastIndexOf('@')
    return at > 0 ? k.slice(0, at) : k
  }

  const direct = obj.importers ? (obj.importers['.'] || {}) : obj
  for (const [sect, kind] of [['dependencies', 'prod'], ['devDependencies', 'dev']]) {
    const d = direct[sect]
    if (!d) continue
    for (const [name, v] of Object.entries(d)) {
      const ver = typeof v === 'string' ? v : (v && (v.version || v.specifier)) || ''
      if (addNode(g, name, { version: ver, kind })) addEdge(g, rootName, name, kind)
    }
  }

  if (obj.packages && typeof obj.packages === 'object') {
    for (const key of Object.keys(obj.packages)) addNode(g, pnpmName(key), { kind: 'transitive' })
    for (const [key, info] of Object.entries(obj.packages)) {
      if (!info || !info.dependencies) continue
      const owner = pnpmName(key)
      for (const dep of Object.keys(info.dependencies)) {
        if (addNode(g, dep, { kind: 'transitive' })) addEdge(g, owner, dep, 'transitive')
      }
    }
  }
  return finalize(g, 'pnpm-lock.yaml')
}

function parsePom(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML')
  const txt = (el, tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || ''
  const project = doc.querySelector('project')
  const rootName = project ? (txt(project, 'artifactId') || 'pom.xml') : 'pom.xml'

  const g = makeGraph()
  g.rootId = addNode(g, rootName, { version: project ? txt(project, 'version') : '', kind: 'root' })

  for (const dep of doc.getElementsByTagName('dependency')) {
    if (dep.closest && dep.closest('dependencyManagement')) continue
    const gid = txt(dep, 'groupId'), aid = txt(dep, 'artifactId')
    if (!aid) continue
    const name = gid ? `${gid}:${aid}` : aid
    const scope = txt(dep, 'scope')
    const kind = scope === 'test' ? 'test' : scope === 'provided' ? 'build' : 'prod'
    if (addNode(g, name, { version: txt(dep, 'version'), kind })) addEdge(g, rootName, name, kind)
  }
  return finalize(g, 'pom.xml')
}

function parseRequirements(text) {
  const deps = []
  for (const line of text.split('\n')) {
    const l = line.trim()
    if (!l || l[0] === '#' || l[0] === '-') continue
    const p = pep508(l)
    if (p) deps.push([p.name, p.version])
  }
  return flatManifest('requirements.txt', 'requirements', [{ deps, kind: 'prod' }])
}

function parseGoMod(text) {
  const g = makeGraph()
  let rootName = 'go.mod'
  const mod = text.match(/^\s*module\s+(\S+)/m)
  if (mod) rootName = mod[1]
  g.rootId = addNode(g, rootName, { kind: 'root' })

  const add = (path, ver, indirect) => {
    const kind = indirect ? 'transitive' : 'prod'
    if (addNode(g, path, { version: ver, kind })) addEdge(g, rootName, path, kind)
  }
  let inBlock = false
  for (const line of text.split('\n')) {
    const l = line.trim()
    if (l.startsWith('require (')) { inBlock = true; continue }
    if (inBlock && l === ')') { inBlock = false; continue }
    if (inBlock) {
      const mm = l.match(/^(\S+)\s+(\S+)(\s+\/\/\s*indirect)?/)
      if (mm) add(mm[1], mm[2], !!mm[3])
    } else {
      const mm = l.match(/^require\s+(\S+)\s+(\S+)(\s+\/\/\s*indirect)?/)
      if (mm) add(mm[1], mm[2], !!mm[3])
    }
  }
  return finalize(g, 'go.mod')
}

function parseGemfile(text) {
  const deps = []
  const re = /^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/
  for (const line of text.split('\n')) {
    const m = line.match(re)
    if (m) deps.push([m[1], m[2] || ''])
  }
  return flatManifest('Gemfile', 'Gemfile', [{ deps, kind: 'prod' }])
}

function parseGradle(text) {
  const deps = []
  const re = /\b(implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|androidTestImplementation|annotationProcessor|kapt|classpath)\s*[\s(]\s*['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(text))) {
    const conf = m[1], coord = m[2]
    const parts = coord.split(':')
    const name = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : coord
    const version = parts.length >= 3 ? parts[2] : ''
    const kind = conf.startsWith('test') || conf.startsWith('androidTest') ? 'test' : 'prod'
    deps.push({ name, version, kind })
  }
  const g = makeGraph()
  g.rootId = addNode(g, 'build.gradle', { kind: 'root' })
  for (const d of deps) if (addNode(g, d.name, { version: d.version, kind: d.kind })) addEdge(g, 'build.gradle', d.name, d.kind)
  return finalize(g, 'build.gradle')
}

function cargoDepVersion(v) {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') return v.version || ''
  return ''
}

function parseCargoToml(obj) {
  const rootName = (obj.package && obj.package.name) || 'Cargo.toml'
  const toSection = (o, kind) => ({
    deps: o ? Object.entries(o).map(([name, v]) => [name, cargoDepVersion(v)]) : null,
    kind,
  })
  return flatManifest('Cargo.toml', rootName, [
    toSection(obj.dependencies, 'prod'),
    toSection(obj['dev-dependencies'], 'dev'),
    toSection(obj['build-dependencies'], 'build'),
  ], obj.package && obj.package.version)
}

function parseCargoLock(obj) {
  const g = makeGraph()
  const pkgs = Array.isArray(obj.package) ? obj.package : []
  for (const p of pkgs) addNode(g, p.name, { version: p.version, kind: 'prod' })
  for (const p of pkgs) {
    if (!Array.isArray(p.dependencies)) continue
    for (const dep of p.dependencies) {
      const name = String(dep).split(' ')[0]      // "foo 1.2.3 (registry+…)" → "foo"
      if (addNode(g, name, { kind: 'transitive' })) addEdge(g, p.name, name, 'transitive')
    }
  }
  return finalize(g, 'Cargo.lock')
}

function parsePyproject(obj) {
  const sections = []
  const proj = obj.project
  if (proj) {
    if (Array.isArray(proj.dependencies)) {
      sections.push({ deps: proj.dependencies.map(s => { const p = pep508(s); return p ? [p.name, p.version] : null }).filter(Boolean), kind: 'prod' })
    }
    const opt = proj['optional-dependencies']
    if (opt && typeof opt === 'object') {
      for (const list of Object.values(opt)) {
        if (Array.isArray(list)) sections.push({ deps: list.map(s => { const p = pep508(s); return p ? [p.name, p.version] : null }).filter(Boolean), kind: 'optional' })
      }
    }
  }
  const poetry = obj.tool && obj.tool.poetry
  if (poetry && poetry.dependencies) {
    sections.push({
      deps: Object.entries(poetry.dependencies)
        .filter(([name]) => name.toLowerCase() !== 'python')
        .map(([name, v]) => [name, cargoDepVersion(v)]),
      kind: 'prod',
    })
  }
  const rootName = (proj && proj.name) || (poetry && poetry.name) || 'pyproject.toml'
  return flatManifest('pyproject.toml', rootName, sections, (proj && proj.version) || (poetry && poetry.version))
}

function parsePoetryLock(obj) {
  const g = makeGraph()
  const pkgs = Array.isArray(obj.package) ? obj.package : []
  for (const p of pkgs) addNode(g, p.name, { version: p.version, kind: 'prod' })
  for (const p of pkgs) {
    if (!p.dependencies || typeof p.dependencies !== 'object') continue
    for (const dep of Object.keys(p.dependencies)) {
      if (dep.toLowerCase() === 'python') continue
      if (addNode(g, dep, { kind: 'transitive' })) addEdge(g, p.name, dep, 'transitive')
    }
  }
  return finalize(g, 'poetry.lock')
}

// ── Detection + dispatch ──────────────────────────────────────────────────────

export function detectFormat(filename, text) {
  const f = (filename || '').toLowerCase().split('/').pop()
  const byName = {
    'package-lock.json': 'package-lock',
    'package.json': 'package-json',
    'composer.lock': 'composer-lock',
    'composer.json': 'composer-json',
    'pipfile.lock': 'pipfile-lock',
    'pnpm-lock.yaml': 'pnpm-lock',
    'pnpm-lock.yml': 'pnpm-lock',
    'pom.xml': 'pom',
    'go.mod': 'go-mod',
    'gemfile': 'gemfile',
    'cargo.lock': 'cargo-lock',
    'cargo.toml': 'cargo-toml',
    'poetry.lock': 'poetry-lock',
    'pyproject.toml': 'pyproject',
  }
  if (byName[f]) return byName[f]
  if (/^requirements.*\.txt$/.test(f) || f === 'requirements.txt') return 'requirements'
  if (f.endsWith('.gradle') || f.endsWith('.gradle.kts')) return 'gradle'

  const t = (text || '').trim()
  if (!t) return null

  if (t[0] === '{') {
    try {
      const o = JSON.parse(t)
      if (o.lockfileVersion !== undefined || (o.packages && typeof o.packages === 'object' && !Array.isArray(o.packages))) return 'package-lock'
      if (o.dependencies || o.devDependencies || o.peerDependencies) return 'package-json'
      if (o._meta && o.default) return 'pipfile-lock'
      if (o['packages-dev'] || Array.isArray(o.packages)) return 'composer-lock'
      if (o.require || o['require-dev']) return 'composer-json'
    } catch { /* not JSON */ }
  }
  if (t.startsWith('<?xml') || /<project[\s>]/.test(t)) return 'pom'
  if (/^module\s+\S+/m.test(t) && /\brequire\b/.test(t)) return 'go-mod'
  if (/^\[\[package\]\]/m.test(t)) return /python-versions|category|^optional\s*=/m.test(t) ? 'poetry-lock' : 'cargo-lock'
  if (/^\[tool\.poetry\]/m.test(t) || /^\[project\]/m.test(t)) return 'pyproject'
  if (/^\[(dependencies|package)\]/m.test(t)) return 'cargo-toml'
  if (/^\s*gem\s+['"]/m.test(t)) return 'gemfile'
  if (/\b(implementation|testImplementation|api)\s*[\s(]\s*['"]/.test(t)) return 'gradle'
  if (/^packages:/m.test(t) && /resolution:|^importers:/m.test(t)) return 'pnpm-lock'
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*\s*(==|>=|<=|~=|!=|>|<)/m.test(t)) return 'requirements'
  return null
}

const JSON_PARSERS = {
  'package-json': parsePackageJson,
  'package-lock': parsePackageLock,
  'composer-json': parseComposerJson,
  'composer-lock': parseComposerLock,
  'pipfile-lock': parsePipfileLock,
}
const TOML_PARSERS = {
  'cargo-toml': parseCargoToml,
  'cargo-lock': parseCargoLock,
  'pyproject': parsePyproject,
  'poetry-lock': parsePoetryLock,
}
const TEXT_PARSERS = {
  'pom': parsePom,
  'requirements': parseRequirements,
  'go-mod': parseGoMod,
  'gemfile': parseGemfile,
  'gradle': parseGradle,
}

export const FORMAT_LABELS = {
  'package-json': 'package.json', 'package-lock': 'package-lock.json',
  'composer-json': 'composer.json', 'composer-lock': 'composer.lock',
  'pipfile-lock': 'Pipfile.lock', 'pnpm-lock': 'pnpm-lock.yaml',
  'pom': 'pom.xml (Maven)', 'requirements': 'requirements.txt',
  'go-mod': 'go.mod', 'gemfile': 'Gemfile', 'gradle': 'Gradle',
  'cargo-toml': 'Cargo.toml', 'cargo-lock': 'Cargo.lock',
  'pyproject': 'pyproject.toml', 'poetry-lock': 'poetry.lock',
}

/**
 * Parse a dependency file into the unified graph model.
 * Returns { format, nodes, edges, rootId, truncated } or { error }.
 */
export function buildGraph(filename, text) {
  if (!text || !text.trim()) return { empty: true }
  const format = detectFormat(filename, text)
  if (!format) return { error: 'Could not recognize this as a known dependency file.' }

  try {
    if (JSON_PARSERS[format]) return JSON_PARSERS[format](JSON.parse(text))
    if (format === 'pnpm-lock') return parsePnpmLock(yamlLoad(text) || {})
    if (TOML_PARSERS[format]) return TOML_PARSERS[format](parseToml(text))
    if (TEXT_PARSERS[format]) return TEXT_PARSERS[format](text)
    return { error: `No parser for ${format}` }
  } catch (e) {
    return { error: `Failed to parse ${FORMAT_LABELS[format] || format}: ${e.message || e}` }
  }
}
