import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react'
import ToolHeader from '../components/ToolHeader'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_LINES   = 10_000
const MAX_FILE_MB = 10

// ── Language detection ────────────────────────────────────────────────────────

const LANG_EXTS = [
  ['js',     ['.js', '.mjs', '.cjs', '.jsx']],
  ['ts',     ['.ts', '.tsx']],
  ['py',     ['.py', '.pyw', '.pyi']],
  ['c',      ['.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.m', '.mm']],
  ['cs',     ['.cs', '.csx']],
  ['rb',     ['.rb', '.rake', '.gemspec', '.ru']],
  ['php',    ['.php', '.php5', '.phtml']],
  ['swift',  ['.swift']],
  ['kt',     ['.kt', '.kts']],
  ['lua',    ['.lua']],
  ['css',    ['.css', '.scss', '.sass', '.less', '.styl']],
  ['html',   ['.html', '.htm', '.xhtml']],
  ['xml',    ['.xml', '.svg', '.xsl', '.xslt', '.wsdl', '.plist']],
  ['json',   ['.json', '.jsonc', '.json5']],
  ['yaml',   ['.yaml', '.yml']],
  ['sh',     ['.sh', '.bash', '.zsh', '.fish', '.ksh', '.csh']],
  ['go',     ['.go']],
  ['rs',     ['.rs']],
  ['java',   ['.java', '.gradle']],
  ['md',     ['.md', '.markdown', '.mdx']],
  ['sql',    ['.sql', '.psql', '.mysql']],
  ['toml',   ['.toml', '.ini', '.cfg', '.conf', '.properties', '.env', '.editorconfig']],
  ['diff',   ['.diff', '.patch']],
  ['text',   ['.txt', '.log', '.csv', '.tsv', '.text', '.out', '.nfo']],
]

// Files matched by base name (no extension or well-known names)
const SPECIAL_NAMES = {
  dockerfile:          'sh',
  'docker-compose.yml':'yaml',
  makefile:            'make',
  gnumakefile:         'make',
  rakefile:            'rb',
  gemfile:             'rb',
  'gemfile.lock':      'text',
  brewfile:            'rb',
  vagrantfile:         'rb',
  jenkinsfile:         'text',
  procfile:            'text',
  '.gitignore':        'text',
  '.gitattributes':    'text',
  '.dockerignore':     'text',
  '.npmignore':        'text',
  '.prettierrc':       'json',
  '.babelrc':          'json',
  '.eslintrc':         'json',
  '.eslintignore':     'text',
  '.editorconfig':     'toml',
  '.env':              'toml',
  '.env.local':        'toml',
  '.env.example':      'toml',
  '.env.development':  'toml',
  '.env.production':   'toml',
  'cargo.toml':        'toml',
  'cargo.lock':        'toml',
  'pyproject.toml':    'toml',
  'requirements.txt':  'text',
  'pipfile':           'toml',
  'tsconfig.json':     'json',
  'package.json':      'json',
  'package-lock.json': 'json',
  'composer.json':     'json',
}

const LANG_NAMES = {
  js: 'JavaScript', ts: 'TypeScript', py: 'Python', c: 'C / C++',
  cs: 'C#', rb: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin',
  lua: 'Lua', css: 'CSS', html: 'HTML', xml: 'XML', json: 'JSON',
  yaml: 'YAML', sh: 'Shell', go: 'Go', rs: 'Rust', java: 'Java',
  md: 'Markdown', sql: 'SQL', toml: 'Config', diff: 'Diff', text: 'Plain Text',
  make: 'Makefile',
}

function detectLang(name) {
  if (!name) return 'text'
  const base = name.split(/[\\/]/).pop().toLowerCase()
  // Exact filename match first
  if (SPECIAL_NAMES[base]) return SPECIAL_NAMES[base]
  // Extension match
  const ext = (base.match(/(\.[^.]+)$/)?.[1] ?? '').toLowerCase()
  for (const [id, exts] of LANG_EXTS) if (exts.includes(ext)) return id
  // No extension and no match → plain text (still loadable)
  return 'text'
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────
// Returns [{type, text}] for one line. Types: tv-kw tv-str tv-cmt tv-num
//   tv-fn tv-cls tv-dec tv-prop plain

const KW = {
  js:   /^(?:const|let|var|function|class|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|import|export|default|from|async|await|try|catch|finally|throw|null|undefined|true|false|void|of|in|extends|super|static|get|set|delete|yield|debugger)(?!\w)/,
  ts:   /^(?:const|let|var|function|class|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|import|export|default|from|async|await|try|catch|finally|throw|null|undefined|true|false|void|of|in|extends|super|static|get|set|delete|yield|type|interface|enum|abstract|declare|namespace|readonly|as|keyof|infer|never|unknown|any)(?!\w)/,
  py:   /^(?:def|class|if|elif|else|for|while|try|except|finally|with|as|import|from|return|yield|pass|break|continue|raise|in|not|and|or|is|lambda|global|nonlocal|None|True|False|del|assert|async|await)(?!\w)/,
  c:    /^(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|NULL|nullptr|true|false|bool|new|delete|class|public|private|protected|virtual|override|template|namespace|using)(?!\w)/,
  cs:   /^(?:abstract|as|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|override|params|private|protected|public|readonly|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual|void|volatile|while|var|async|await|yield)(?!\w)/,
  rb:   /^(?:def|class|module|end|if|elsif|else|unless|until|while|for|in|do|return|yield|begin|rescue|ensure|raise|include|extend|require|require_relative|attr_reader|attr_writer|attr_accessor|self|super|nil|true|false|and|or|not|then|when|case|break|next|redo|retry|lambda|proc|puts|print|p|pp)(?!\w)/,
  php:  /^(?:echo|print|return|if|else|elseif|while|for|foreach|do|switch|case|break|continue|class|interface|trait|extends|implements|function|new|null|true|false|array|list|isset|unset|empty|die|exit|require|require_once|include|include_once|namespace|use|abstract|final|public|private|protected|static|const|throw|try|catch|finally|yield|match|fn)(?!\w)/,
  go:   /^(?:func|type|struct|interface|map|chan|go|select|case|switch|if|else|for|range|return|break|continue|defer|goto|fallthrough|package|import|var|const|nil|true|false|make|new|len|cap|append|copy|delete|error|string|int|uint|bool|byte|rune|float)(?!\w)/,
  rs:   /^(?:fn|let|mut|struct|enum|impl|trait|use|mod|pub|crate|super|self|return|if|else|for|while|loop|match|break|continue|where|type|const|static|unsafe|async|await|move|ref|in|as|true|false|None|Some|Ok|Err|String|Vec|Box|Option|Result)(?!\w)/,
  java: /^(?:class|interface|enum|extends|implements|public|private|protected|static|final|abstract|void|return|if|else|for|while|do|switch|case|break|continue|new|this|super|import|package|try|catch|finally|throw|throws|null|true|false|int|long|double|float|boolean|char|byte|short|String|var|record|sealed|permits)(?!\w)/,
  swift:/^(?:func|class|struct|enum|protocol|extension|var|let|if|else|guard|switch|case|for|while|repeat|return|break|continue|throw|throws|rethrows|do|catch|try|import|typealias|associatedtype|init|deinit|subscript|operator|precedencegroup|self|super|nil|true|false|as|is|in|inout|mutating|nonmutating|open|public|internal|fileprivate|private|static|final|override|required|lazy|weak|unowned|@escaping|@objc|@discardableResult|async|await|actor)(?!\w)/,
  kt:   /^(?:fun|class|interface|object|val|var|if|else|when|for|while|do|return|break|continue|throw|try|catch|finally|import|package|typealias|is|as|in|!in|!is|null|true|false|super|this|by|init|constructor|companion|data|sealed|abstract|open|override|private|protected|public|internal|inline|suspend|coroutine|lateinit|const|enum|annotation|reified|out|in|crossinline|noinline|vararg)(?!\w)/,
  lua:  /^(?:and|break|do|else|elseif|end|false|for|function|goto|if|in|local|nil|not|or|repeat|return|then|true|until|while)(?!\w)/,
  sql:  /^(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP|BY|ORDER|HAVING|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|NOT|NULL|AND|OR|IN|IS|LIKE|BETWEEN|DISTINCT|AS|LIMIT|OFFSET|COUNT|SUM|AVG|MIN|MAX|UNION|ALL|EXISTS|WITH|CASE|WHEN|THEN|ELSE|END)(?!\w)/i,
  sh:   /^(?:if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|return|exit|echo|cd|ls|source|export|local|readonly|declare|unset|shift|eval|exec|trap|set|true|false|test)(?!\w)/,
  md:   null,
}

function tokenizeLine(line, lang) {
  if (lang === 'text' || lang === 'make' || !line) return [{ type: 'plain', text: line }]

  // ── Diff: special whole-line types ────────────────────────────────────────
  if (lang === 'diff') {
    if (line.startsWith('+++') || line.startsWith('---')) return [{ type: 'tv-fn',  text: line }]
    if (line.startsWith('+'))  return [{ type: 'tv-str', text: line }]
    if (line.startsWith('-'))  return [{ type: 'tv-dec', text: line }]
    if (line.startsWith('@@')) return [{ type: 'tv-kw',  text: line }]
    return [{ type: 'plain', text: line }]
  }

  const tokens = []
  let i = 0

  const push = (type, text) => { tokens.push({ type, text }) }
  const eat  = (m) => { i += m.length; return m }

  // C-style // comment langs
  const cStyleComment = ['js', 'ts', 'go', 'rs', 'java', 'c', 'cs', 'swift', 'kt', 'php']

  while (i < line.length) {
    const r = line.slice(i)
    let m

    // ── Comments ────────────────────────────────────────────────────────────
    if (cStyleComment.includes(lang) && r.startsWith('//')) {
      push('tv-cmt', r); break
    }
    if ((lang === 'py' || lang === 'sh' || lang === 'yaml' || lang === 'toml' || lang === 'rb' || lang === 'lua') && r.startsWith('#')) {
      push('tv-cmt', r); break
    }
    if (lang === 'sql' && r.startsWith('--')){ push('tv-cmt', r); break }
    if ((m = r.match(/^\/\*[\s\S]*?\*\//))) { push('tv-cmt', eat(m[0])); continue }

    // ── Strings ──────────────────────────────────────────────────────────────
    if ((m = r.match(/^`(?:[^`\\]|\\.)*`/)))        { push('tv-str', eat(m[0])); continue }
    if ((m = r.match(/^"(?:[^"\\]|\\.)*"/)))         { push('tv-str', eat(m[0])); continue }
    if ((m = r.match(/^'(?:[^'\\]|\\.)*'/)))         { push('tv-str', eat(m[0])); continue }
    if (lang === 'sql' && (m = r.match(/^'(?:[^'']|'')*'/))) { push('tv-str', eat(m[0])); continue }

    // ── Numbers ──────────────────────────────────────────────────────────────
    if ((m = r.match(/^0x[\da-fA-F]+/)))             { push('tv-num', eat(m[0])); continue }
    if ((m = r.match(/^\b\d+\.?\d*(?:[eE][+-]?\d+)?(?:f|d|l|u[sz]?|[iu]\d+)?\b/))) {
      push('tv-num', eat(m[0])); continue
    }

    // ── Decorators / annotations / attributes ─────────────────────────────
    if ((lang === 'py' || lang === 'java') && (m = r.match(/^@[\w.]+/))) {
      push('tv-dec', eat(m[0])); continue
    }
    if (lang === 'rs' && (m = r.match(/^#\[[\s\S]*?\]/))) {
      push('tv-dec', eat(m[0])); continue
    }
    if (lang === 'css' && (m = r.match(/^@[\w-]+/))) {
      push('tv-dec', eat(m[0])); continue
    }
    if (lang === 'toml' && (m = r.match(/^\[[\w.-]+\]/))) {
      push('tv-dec', eat(m[0])); continue
    }
    if (lang === 'sh' && (m = r.match(/^\$\{?[\w]+\}?/))) {
      push('tv-dec', eat(m[0])); continue
    }

    // ── CSS specifics ────────────────────────────────────────────────────────
    if (lang === 'css') {
      if ((m = r.match(/^#[0-9a-fA-F]{3,8}\b/)))   { push('tv-num', eat(m[0])); continue }
      if ((m = r.match(/^\.[\w-]+/)))               { push('tv-cls', eat(m[0])); continue }
      if ((m = r.match(/^:?:[\w-]+/)))              { push('tv-kw',  eat(m[0])); continue }
      if ((m = r.match(/^[\w-]+(?=\s*:)/)))         { push('tv-prop',eat(m[0])); continue }
    }

    // ── JSON: keys ───────────────────────────────────────────────────────────
    if (lang === 'json' && (m = r.match(/^"(?:[^"\\]|\\.)*"\s*(?=:)/))) {
      push('tv-prop', eat(m[0])); continue
    }

    // ── YAML: keys ───────────────────────────────────────────────────────────
    if (lang === 'yaml' && (m = r.match(/^[\w-]+(?=\s*:)/))) {
      push('tv-prop', eat(m[0])); continue
    }

    // ── TOML: keys ───────────────────────────────────────────────────────────
    if (lang === 'toml' && (m = r.match(/^[\w-]+(?=\s*=)/))) {
      push('tv-prop', eat(m[0])); continue
    }

    // ── Markdown headers ────────────────────────────────────────────────────
    if (lang === 'md') {
      if ((m = r.match(/^#{1,6} .*/)))              { push('tv-fn',  eat(m[0])); continue }
      if ((m = r.match(/^\*\*[^*]+\*\*/)))          { push('tv-kw',  eat(m[0])); continue }
      if ((m = r.match(/^`[^`]+`/)))                { push('tv-str', eat(m[0])); continue }
      if ((m = r.match(/^\[([^\]]+)\]\([^)]+\)/)))  { push('tv-prop',eat(m[0])); continue }
    }

    // ── Keywords (using language-specific regex) ────────────────────────────
    const kwRe = KW[lang]
    if (kwRe && (m = r.match(kwRe))) { push('tv-kw', eat(m[0])); continue }

    // ── Uppercase identifiers → class names ─────────────────────────────────
    if ((m = r.match(/^[A-Z][A-Za-z0-9_]*/))) { push('tv-cls', eat(m[0])); continue }

    // ── Function calls ───────────────────────────────────────────────────────
    if ((m = r.match(/^[a-z_$][\w$]*(?=\s*\()/))) { push('tv-fn', eat(m[0])); continue }

    // ── Plain: accumulate single char ────────────────────────────────────────
    if (tokens.length && tokens[tokens.length - 1].type === 'plain') {
      tokens[tokens.length - 1].text += line[i]
    } else {
      push('plain', line[i])
    }
    i++
  }

  return tokens
}

// ── HTML generation ───────────────────────────────────────────────────────────

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Build segments that split tokens at match boundaries, flag which are matches
function tokensToHtml(tokens, lineMatches, activeGlobalIdx) {
  if (!lineMatches?.length) {
    return tokens.map(t =>
      t.type !== 'plain' ? `<span class="${t.type}">${esc(t.text)}</span>` : esc(t.text)
    ).join('')
  }

  // Split tokens at every match boundary
  const breaks = new Set()
  for (const m of lineMatches) { breaks.add(m.start); breaks.add(m.end) }
  const bkArr = [...breaks].sort((a, b) => a - b)

  const segs = []
  let pos = 0
  for (const tok of tokens) {
    let lo = pos
    const hi = pos + tok.text.length
    for (const bp of bkArr) {
      if (bp > lo && bp < hi) {
        segs.push({ type: tok.type, text: tok.text.slice(lo - pos, bp - pos), start: lo })
        lo = bp
      }
    }
    segs.push({ type: tok.type, text: tok.text.slice(lo - pos), start: lo })
    pos = hi
  }

  const inMatch = (start) => lineMatches.find(m => start >= m.start && start < m.end)

  return segs.map(seg => {
    let html = esc(seg.text)
    if (seg.type !== 'plain') html = `<span class="${seg.type}">${html}</span>`
    const match = inMatch(seg.start)
    if (match) {
      const cls = match.gi === activeGlobalIdx ? 'tv-match tv-match--active' : 'tv-match'
      html = `<mark class="${cls}">${html}</mark>`
    }
    return html
  }).join('')
}

// ── Search ────────────────────────────────────────────────────────────────────

function findMatches(lines, query, caseSensitive) {
  if (!query) return []
  const q   = caseSensitive ? query : query.toLowerCase()
  const all = []
  let gi = 0
  for (let li = 0; li < lines.length; li++) {
    const src = caseSensitive ? lines[li] : lines[li].toLowerCase()
    let pos = 0
    while (true) {
      const idx = src.indexOf(q, pos)
      if (idx < 0) break
      all.push({ lineIdx: li, start: idx, end: idx + q.length, gi: gi++ })
      pos = idx + 1
    }
  }
  return all
}

// ── Line component ────────────────────────────────────────────────────────────

const Line = memo(function Line({ num, toks, lineMatches, activeGi, showNum, lineRef }) {
  const html = useMemo(
    () => tokensToHtml(toks, lineMatches, activeGi),
    [toks, lineMatches, activeGi]
  )
  const hasActive = lineMatches?.some(m => m.gi === activeGi)
  return (
    <div
      ref={lineRef}
      className={`tv-line${hasActive ? ' tv-line--active' : ''}`}
    >
      {showNum && <span className="tv-ln">{num}</span>}
      <span className="tv-code" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
})

// ── Drop zone ─────────────────────────────────────────────────────────────────

function DropZone({ onFile, onText }) {
  const [dragging, setDragging] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteVal, setPasteVal] = useState('')
  const fileRef = useRef(null)

  const acceptFile = f => {
    if (!f) return
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`File too large (max ${MAX_FILE_MB} MB)`)
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const content = e.target.result
      // Heuristic binary check: count null bytes in first 8 KB
      const sample = content.slice(0, 8192)
      const nullCount = (sample.match(/\0/g) || []).length
      if (nullCount > sample.length * 0.01) {
        alert('This looks like a binary file. Only text-based files can be viewed.')
        return
      }
      onFile(content, f.name)
    }
    reader.readAsText(f)
  }

  return (
    <div className="tv-dropzone">
      <div
        className={`tv-drop-area${dragging ? ' tv-drop-area--over' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false)
          acceptFile(e.dataTransfer.files[0])
        }}
      >
        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={e => { acceptFile(e.target.files[0]); e.target.value = '' }}
        />
        <span className="tv-drop-icon">📂</span>
        <span className="tv-drop-hint">Click or drag any text file here</span>
        <span className="tv-drop-sub">
          All text-based files · .js .py .go .rs .c .cpp .cs .rb .php .swift .kt .html .css .json .yaml .sql .sh .md .txt .log · Dockerfile · Makefile · .gitignore · …
        </span>
      </div>
      <div className="tv-paste-toggle">
        <button
          type="button"
          className="jv-file-btn"
          onClick={() => setShowPaste(v => !v)}
        >{showPaste ? 'Hide' : 'or paste text'}</button>
      </div>
      {showPaste && (
        <div className="tv-paste-area">
          <textarea
            className="text-area"
            style={{ minHeight: 140, resize: 'vertical' }}
            placeholder="Paste text or code here…"
            value={pasteVal}
            onChange={e => setPasteVal(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          <button
            className="submit-btn"
            type="button"
            disabled={!pasteVal.trim()}
            onClick={() => { onText(pasteVal); setPasteVal('') }}
            style={{ marginTop: 8 }}
          >View text</button>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TextViewer({ meta }) {
  const [text, setText]         = useState('')
  const [filename, setFilename] = useState('')
  const [langId, setLangId]     = useState('text')
  const [showNums, setShowNums] = useState(true)
  const [wrap, setWrap]         = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery]       = useState('')
  const [caseSens, setCaseSens] = useState(false)
  const [matchIdx, setMatchIdx] = useState(0)
  const [gotoVal, setGotoVal]   = useState('')
  const [copied, setCopied]     = useState(false)

  const searchInputRef = useRef(null)
  const lineRefs       = useRef({})

  // ── Derived state ──────────────────────────────────────────────────────────

  const lines = useMemo(() => text.split('\n'), [text])
  const displayLines = useMemo(() => lines.slice(0, MAX_LINES), [lines])
  const truncated = lines.length > MAX_LINES

  const tokens = useMemo(
    () => displayLines.map(l => tokenizeLine(l, langId)),
    [displayLines, langId]
  )

  const matches = useMemo(
    () => findMatches(displayLines, query, caseSens),
    [displayLines, query, caseSens]
  )

  const matchesByLine = useMemo(() => {
    const m = {}
    for (const match of matches) {
      if (!m[match.lineIdx]) m[match.lineIdx] = []
      m[match.lineIdx].push(match)
    }
    return m
  }, [matches])

  const stats = useMemo(() => {
    if (!text) return null
    return {
      lines: lines.length,
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
      chars: text.length,
    }
  }, [text, lines])

  // ── Reset match index when query changes ──────────────────────────────────

  useEffect(() => { setMatchIdx(0) }, [query, caseSens])

  // ── Scroll to active match ────────────────────────────────────────────────

  const scrollToMatch = useCallback((idx) => {
    const m = matches[idx]
    if (!m) return
    lineRefs.current[m.lineIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [matches])

  const nextMatch = useCallback(() => {
    if (!matches.length) return
    const next = (matchIdx + 1) % matches.length
    setMatchIdx(next)
    scrollToMatch(next)
  }, [matchIdx, matches, scrollToMatch])

  const prevMatch = useCallback(() => {
    if (!matches.length) return
    const prev = (matchIdx - 1 + matches.length) % matches.length
    setMatchIdx(prev)
    scrollToMatch(prev)
  }, [matchIdx, matches, scrollToMatch])

  // ── Go to line ────────────────────────────────────────────────────────────

  const handleGotoLine = e => {
    e.preventDefault()
    const n = parseInt(gotoVal, 10)
    if (!n || n < 1 || n > displayLines.length) return
    lineRefs.current[n - 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setGotoVal('')
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    if (!text) return
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 30)
      }
      if (e.key === 'Escape' && showSearch) { setShowSearch(false); setQuery('') }
      if (showSearch && e.key === 'Enter') {
        e.preventDefault()
        e.shiftKey ? prevMatch() : nextMatch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [text, showSearch, prevMatch, nextMatch])

  // ── File / text load ──────────────────────────────────────────────────────

  const openFile = (content, name) => {
    setText(content)
    setFilename(name ?? '')
    setLangId(detectLang(name))
    setQuery('')
    setMatchIdx(0)
    setShowSearch(false)
  }

  const close = () => {
    setText(''); setFilename(''); setQuery('')
    setShowSearch(false); setMatchIdx(0)
  }

  const copy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 1600)
  }

  const activeGi = matches[matchIdx]?.gi ?? -1

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="tool-ui tool-ui--wide">
      <ToolHeader meta={meta} />

      {!text ? (
        <DropZone onFile={openFile} onText={t => openFile(t, '')} />
      ) : (
        <div className="tv-viewer-wrap">

          {/* ── Toolbar ─────────────────────────────────────────────────── */}
          <div className="jv-toolbar tv-toolbar">
            <span className="jv-badge">{LANG_NAMES[langId] ?? 'Text'}</span>
            {filename && <span className="tv-fname">{filename}</span>}
            {stats && (
              <span className="tv-stats-row">
                {stats.lines.toLocaleString()} lines
                <span className="tv-stats-sep">·</span>
                {stats.words.toLocaleString()} words
                <span className="tv-stats-sep">·</span>
                {stats.chars.toLocaleString()} chars
              </span>
            )}
            <div className="jv-toolbar-actions">
              <button
                className={`jv-btn${showNums ? ' jv-btn--on' : ''}`}
                onClick={() => setShowNums(v => !v)}
              ># Lines</button>
              <button
                className={`jv-btn${wrap ? ' jv-btn--on' : ''}`}
                onClick={() => setWrap(v => !v)}
              >Wrap</button>
              <button
                className={`jv-btn${showSearch ? ' jv-btn--on' : ''}`}
                onClick={() => {
                  setShowSearch(v => {
                    if (!v) setTimeout(() => searchInputRef.current?.focus(), 30)
                    return !v
                  })
                }}
                title="Search (Ctrl+F)"
              >Search</button>
              <button className="jv-btn" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
              <button className="jv-btn" onClick={close} title="Close">✕</button>
            </div>
          </div>

          {/* ── Search bar ──────────────────────────────────────────────── */}
          {showSearch && (
            <div className="tv-search-bar">
              <input
                ref={searchInputRef}
                className="tv-search-input"
                placeholder="Search… (Enter ↓  Shift+Enter ↑)"
                value={query}
                onChange={e => setQuery(e.target.value)}
                spellCheck={false}
              />
              <button
                className={`jv-btn tv-case-btn${caseSens ? ' jv-btn--on' : ''}`}
                title="Case sensitive"
                onClick={() => setCaseSens(v => !v)}
              >Aa</button>
              {query && (
                <span className="tv-match-count">
                  {matches.length === 0
                    ? 'No results'
                    : `${matchIdx + 1} / ${matches.length}`}
                </span>
              )}
              <button className="jv-btn" onClick={prevMatch} disabled={!matches.length} title="Previous (Shift+Enter)">↑</button>
              <button className="jv-btn" onClick={nextMatch} disabled={!matches.length} title="Next (Enter)">↓</button>
            </div>
          )}

          {/* ── Code viewer ─────────────────────────────────────────────── */}
          <div className={`tv-viewer${wrap ? ' tv-viewer--wrap' : ''}`}>
            {displayLines.map((line, idx) => (
              <Line
                key={idx}
                num={idx + 1}
                toks={tokens[idx]}
                lineMatches={matchesByLine[idx]}
                activeGi={activeGi}
                showNum={showNums}
                lineRef={el => { lineRefs.current[idx] = el }}
              />
            ))}
            {truncated && (
              <div className="tv-truncate-note">
                Showing first {MAX_LINES.toLocaleString()} of {lines.length.toLocaleString()} lines
              </div>
            )}
          </div>

          {/* ── Go to line ──────────────────────────────────────────────── */}
          <form className="tv-goto-row" onSubmit={handleGotoLine}>
            <input
              className="form-input tv-goto-input"
              type="number"
              placeholder={`Go to line (1–${displayLines.length.toLocaleString()})`}
              value={gotoVal}
              min={1}
              max={displayLines.length}
              onChange={e => setGotoVal(e.target.value)}
            />
            <button type="submit" className="jv-btn">Go</button>
          </form>

        </div>
      )}
    </div>
  )
}
