import { useRef, useState, useEffect } from 'react';
import './Paint.css';

// ── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = [
  '#000000','#808080','#800000','#808000','#008000','#008080','#000080','#800080',
  '#FF8040','#804000','#408040','#004040','#0080FF','#400080',
  '#FFFFFF','#C0C0C0','#FF0000','#FFFF00','#00FF00','#00FFFF','#0000FF','#FF00FF',
  '#FF8080','#FFFF80','#80FF80','#80FFFF','#8080FF','#FF80FF',
];

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  { id: 'select',     label: 'Select' },
  { id: 'freeselect', label: 'Free-Form Select' },
  { id: 'eraser',     label: 'Eraser' },
  { id: 'fill',       label: 'Fill With Color' },
  { id: 'eyedrop',    label: 'Pick Color' },
  { id: 'magnifier',  label: 'Magnifier' },
  { id: 'pencil',     label: 'Pencil' },
  { id: 'brush',      label: 'Brush' },
  { id: 'airbrush',   label: 'Airbrush' },
  { id: 'text',       label: 'Text' },
  { id: 'line',       label: 'Line' },
  { id: 'curve',      label: 'Curve' },
  { id: 'rect',       label: 'Rectangle' },
  { id: 'polygon',    label: 'Polygon' },
  { id: 'ellipse',    label: 'Ellipse' },
  { id: 'roundrect',  label: 'Rounded Rectangle' },
];

// ── SVG icons ─────────────────────────────────────────────────────────────────
function Icon({ id }) {
  const icons = {
    select: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor">
        <rect x="1" y="1" width="11" height="11" strokeDasharray="2,1"/>
        <path d="M12 12h4v4h-4z" fill="currentColor" stroke="none"/>
      </svg>
    ),
    freeselect: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor">
        <path d="M3 11C2 7 4 2 8 2C12 2 14 6 13 10C12 13 9 15 6 14C4 13 3 12 3 11" strokeDasharray="2,1"/>
      </svg>
    ),
    eraser: (
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path d="M10 2L14 6L7 14H2V10Z" fill="#f88" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="2" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth="0.8"/>
      </svg>
    ),
    fill: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M9 1L12 6H10V12H8V6H6Z"/>
        <path d="M2 12.5C2 11.7 2.7 11 3.5 11H8.5C9.3 11 10 11.7 10 12.5S9.3 14 8.5 14H3.5C2.7 14 2 13.3 2 12.5Z" opacity=".5"/>
        <path d="M4 6L8 3.5L11 7.5L7 10Z" opacity=".4"/>
      </svg>
    ),
    eyedrop: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M13 1Q15 3 13 5L6 12H4V10L11 3Z"/>
        <circle cx="2.5" cy="13.5" r="1.8" fill="#4af"/>
      </svg>
    ),
    magnifier: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="6" r="4.5"/>
        <line x1="10" y1="10" x2="15" y2="15"/>
      </svg>
    ),
    pencil: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M11 2L14 5L5 14H2V11Z"/>
        <path d="M12 1L15 4L14 5L11 2Z" opacity=".6"/>
      </svg>
    ),
    brush: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M13 2L14 3L5 12Q3 13 2 14Q3 11 4 10Z"/>
      </svg>
    ),
    airbrush: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <rect x="6" y="9" width="7" height="4" rx="1"/>
        <rect x="3" y="10.5" width="3" height="1"/>
        <circle cx="2" cy="7" r=".8"/>
        <circle cx="4" cy="5" r=".8"/>
        <circle cx="7" cy="4" r=".8"/>
        <circle cx="3" cy="9" r=".5" opacity=".4"/>
      </svg>
    ),
    text: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <text x="1" y="14" fontFamily="serif" fontSize="14" fontWeight="bold">A</text>
      </svg>
    ),
    line: (
      <svg viewBox="0 0 16 16" width="14" height="14">
        <line x1="1" y1="15" x2="15" y2="1" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
    curve: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 13Q8 1 15 13"/>
      </svg>
    ),
    rect: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="3" width="14" height="10"/>
      </svg>
    ),
    polygon: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="8,1 15,6 13,15 3,15 1,6"/>
      </svg>
    ),
    ellipse: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="8" cy="8" rx="7" ry="5"/>
      </svg>
    ),
    roundrect: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="3" width="14" height="10" rx="3"/>
      </svg>
    ),
  };
  return icons[id] || null;
}

// ── Flood fill ────────────────────────────────────────────────────────────────
function floodFill(ctx, sx, sy, hex) {
  sx = Math.round(sx); sy = Math.round(sy);
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = img.data, w = img.width, h = img.height;
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return;
  const i0 = (sy * w + sx) * 4;
  const [tr, tg, tb, ta] = [d[i0], d[i0+1], d[i0+2], d[i0+3]];
  const fr = parseInt(hex.slice(1,3),16), fg = parseInt(hex.slice(3,5),16), fb = parseInt(hex.slice(5,7),16);
  if (tr===fr && tg===fg && tb===fb && ta===255) return;
  const eq = i => d[i]===tr && d[i+1]===tg && d[i+2]===tb && d[i+3]===ta;
  const set = i => { d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=255; };
  const vis = new Uint8Array(w * h);
  const stk = [sy * w + sx];
  while (stk.length) {
    let pos = stk.pop(), x = pos % w, y = (pos / w) | 0;
    while (x > 0 && eq((y*w+x-1)*4) && !vis[y*w+x-1]) x--;
    let sa = false, sb = false;
    while (x < w && eq((y*w+x)*4) && !vis[y*w+x]) {
      vis[y*w+x] = 1; set((y*w+x)*4);
      if (y > 0 && eq(((y-1)*w+x)*4) && !vis[(y-1)*w+x]) { if (!sa) { stk.push((y-1)*w+x); sa=true; } } else sa=false;
      if (y < h-1 && eq(((y+1)*w+x)*4) && !vis[(y+1)*w+x]) { if (!sb) { stk.push((y+1)*w+x); sb=true; } } else sb=false;
      x++;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ── Zoom levels ───────────────────────────────────────────────────────────────
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
const ZOOM_PAD = 16; // px padding around canvas in canvas area

function nextZoomLevel(cur, dir) {
  if (dir > 0) return ZOOM_LEVELS.find(z => z > cur + 0.001) ?? null;
  return [...ZOOM_LEVELS].reverse().find(z => z < cur - 0.001) ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPos(e, el, zoom) {
  const r = el.getBoundingClientRect();
  return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
}

function snapAngle(sx, sy, x, y) {
  const dx = x-sx, dy = y-sy;
  const a = Math.atan2(dy, dx);
  const s = Math.round(a / (Math.PI/4)) * (Math.PI/4);
  const r = Math.sqrt(dx*dx + dy*dy);
  return { x: sx + Math.cos(s)*r, y: sy + Math.sin(s)*r };
}

function snapSquare(sx, sy, x, y) {
  const s = Math.max(Math.abs(x-sx), Math.abs(y-sy));
  return { x: sx + (x > sx ? s : -s), y: sy + (y > sy ? s : -s) };
}

function drawShape(ctx, type, x1, y1, x2, y2, stroke, fill, lw, fm) {
  const x = Math.min(x1,x2), y = Math.min(y1,y2);
  const w = Math.abs(x2-x1), h = Math.abs(y2-y1);
  ctx.save();
  ctx.lineWidth = lw;
  switch (type) {
    case 'line':
      ctx.strokeStyle = stroke; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      break;
    case 'rect':
      ctx.lineCap = 'square';
      if (fm !== 0) { ctx.fillStyle = fill; ctx.fillRect(x,y,w,h); }
      if (fm !== 2) { ctx.strokeStyle = stroke; ctx.strokeRect(x,y,w,h); }
      break;
    case 'ellipse':
      ctx.beginPath(); ctx.ellipse((x1+x2)/2,(y1+y2)/2,w/2,h/2,0,0,Math.PI*2);
      if (fm !== 0) { ctx.fillStyle = fill; ctx.fill(); }
      if (fm !== 2) { ctx.strokeStyle = stroke; ctx.stroke(); }
      break;
    case 'roundrect': {
      const rad = Math.min(Math.min(w,h)*0.25, 20);
      ctx.beginPath();
      ctx.moveTo(x+rad,y); ctx.lineTo(x+w-rad,y); ctx.arcTo(x+w,y,x+w,y+rad,rad);
      ctx.lineTo(x+w,y+h-rad); ctx.arcTo(x+w,y+h,x+w-rad,y+h,rad);
      ctx.lineTo(x+rad,y+h); ctx.arcTo(x,y+h,x,y+h-rad,rad);
      ctx.lineTo(x,y+rad); ctx.arcTo(x,y,x+rad,y,rad);
      ctx.closePath();
      if (fm !== 0) { ctx.fillStyle = fill; ctx.fill(); }
      if (fm !== 2) { ctx.strokeStyle = stroke; ctx.stroke(); }
      break;
    }
  }
  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Paint({ meta }) {
  const [tool, setTool] = useState('pencil');
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#ffffff');
  const [lineW, setLineW] = useState(1);
  const [brushSz, setBrushSz] = useState(6);
  const [eraserSz, setEraserSz] = useState(12);
  const [zoom, setZoom] = useState(1);
  const [fillMode, setFillMode] = useState(0);
  const [textOpts, setTextOpts] = useState({ font: 'Arial', size: 18, bold: false, italic: false });
  const [menu, setMenu] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [selRect, setSelRect] = useState(null);
  const [textPos, setTextPos] = useState(null);
  const [histVer, setHistVer] = useState(0);

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const canvasAreaRef = useRef(null);
  const zoomRef = useRef(1);
  const textRef = useRef(null);
  const histRef = useRef([]);
  const histIdxRef = useRef(-1);
  const airTimerRef = useRef(null);
  const animRef = useRef(null);
  const selDataRef = useRef(null);
  const selRectRef = useRef(null);

  // Drawing state (mutable, not causing re-renders)
  const ds = useRef({
    drawing: false, btn: 0,
    sx: 0, sy: 0, lx: 0, ly: 0,
    saved: null,
    polyPts: [],
    curvePh: 0, curveP1: null, curveP2: null,
    selMoving: false, selMoveOff: { dx: 0, dy: 0 },
  });

  // Keep selRectRef in sync
  useEffect(() => { selRectRef.current = selRect; }, [selRect]);
  // Keep zoomRef in sync
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // ── Ctrl+wheel zoom (pivot on mouse position) ────────────────────────────
  useEffect(() => {
    const area = canvasAreaRef.current;
    if (!area) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const cur = zoomRef.current;
      const next = nextZoomLevel(cur, e.deltaY < 0 ? 1 : -1);
      if (!next) return;
      const rect = area.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const canvasX = (area.scrollLeft + screenX - ZOOM_PAD) / cur;
      const canvasY = (area.scrollTop  + screenY - ZOOM_PAD) / cur;
      setZoom(next);
      requestAnimationFrame(() => {
        area.scrollLeft = canvasX * next + ZOOM_PAD - screenX;
        area.scrollTop  = canvasY * next + ZOOM_PAD - screenY;
      });
    };
    area.addEventListener('wheel', onWheel, { passive: false });
    return () => area.removeEventListener('wheel', onWheel);
  }, []); // intentionally empty — reads zoomRef.current

  // ── Canvas init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    histRef.current = [data];
    histIdxRef.current = 0;
    setHistVer(1);
  }, []);

  // ── Selection marching-ants animation ───────────────────────────────────────
  useEffect(() => {
    let off = 0;
    const tick = () => {
      const octx = overlayRef.current?.getContext('2d');
      if (!octx) { animRef.current = requestAnimationFrame(tick); return; }
      const sel = selRectRef.current;
      if (sel && !ds.current.drawing) {
        octx.clearRect(0, 0, octx.canvas.width, octx.canvas.height);
        octx.save();
        octx.lineWidth = 1;
        octx.setLineDash([4, 4]); octx.lineDashOffset = -off;
        octx.strokeStyle = '#000'; octx.strokeRect(sel.x+.5, sel.y+.5, sel.w, sel.h);
        octx.lineDashOffset = -off + 4;
        octx.strokeStyle = '#fff'; octx.strokeRect(sel.x+.5, sel.y+.5, sel.w, sel.h);
        octx.setLineDash([]); octx.restore();
        off = (off + 0.4) % 8;
      } else if (!ds.current.drawing) {
        // Don't clear overlay during drawing — let mouse handlers manage it
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── Zoom helpers (viewport-centred) ─────────────────────────────────────────
  function applyZoom(next, screenX, screenY) {
    const area = canvasAreaRef.current;
    const cur = zoomRef.current;
    const sx = screenX ?? (area ? area.clientWidth  / 2 : 0);
    const sy = screenY ?? (area ? area.clientHeight / 2 : 0);
    const canvasX = area ? (area.scrollLeft + sx - ZOOM_PAD) / cur : 0;
    const canvasY = area ? (area.scrollTop  + sy - ZOOM_PAD) / cur : 0;
    setZoom(next);
    requestAnimationFrame(() => {
      if (!canvasAreaRef.current) return;
      canvasAreaRef.current.scrollLeft = canvasX * next + ZOOM_PAD - sx;
      canvasAreaRef.current.scrollTop  = canvasY * next + ZOOM_PAD - sy;
    });
  }

  function zoomIn()  { const n = nextZoomLevel(zoomRef.current,  1); if (n) applyZoom(n); }
  function zoomOut() { const n = nextZoomLevel(zoomRef.current, -1); if (n) applyZoom(n); }

  // ── History helpers ─────────────────────────────────────────────────────────
  function pushHistory() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    histRef.current = histRef.current.slice(0, histIdxRef.current + 1);
    histRef.current.push(data);
    if (histRef.current.length > 50) histRef.current.shift();
    histIdxRef.current = histRef.current.length - 1;
    setHistVer(v => v + 1);
  }

  function undo() {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    canvasRef.current.getContext('2d').putImageData(histRef.current[histIdxRef.current], 0, 0);
    setSelRect(null); selDataRef.current = null;
    setHistVer(v => v + 1);
  }

  function redo() {
    if (histIdxRef.current >= histRef.current.length - 1) return;
    histIdxRef.current++;
    canvasRef.current.getContext('2d').putImageData(histRef.current[histIdxRef.current], 0, 0);
    setSelRect(null); selDataRef.current = null;
    setHistVer(v => v + 1);
  }

  const canUndo = histIdxRef.current > 0;
  const canRedo = histIdxRef.current < histRef.current.length - 1;

  // ── Actions ─────────────────────────────────────────────────────────────────
  function newCanvas() {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    pushHistory();
    setSelRect(null); selDataRef.current = null;
    setMenu(null);
  }

  function saveImage() {
    const a = document.createElement('a');
    a.download = 'painting.png';
    a.href = canvasRef.current.toDataURL('image/png');
    a.click();
    setMenu(null);
  }

  function openFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const ctx = canvasRef.current.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.drawImage(img, 0, 0, Math.min(img.width, ctx.canvas.width), Math.min(img.height, ctx.canvas.height));
          pushHistory();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    };
    inp.click();
    setMenu(null);
  }

  function selectAll() {
    const c = canvasRef.current;
    setSelRect({ x: 0, y: 0, w: c.width, h: c.height });
    setMenu(null);
  }

  function deleteSelection() {
    const sel = selRectRef.current;
    if (!sel) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
    pushHistory();
    setSelRect(null); selDataRef.current = null;
  }

  function commitSelMove() {
    const sel = selRectRef.current;
    if (!sel || !selDataRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const tmp = document.createElement('canvas');
    tmp.width = sel.w; tmp.height = sel.h;
    tmp.getContext('2d').putImageData(selDataRef.current, 0, 0);
    ctx.drawImage(tmp, sel.x, sel.y);
    selDataRef.current = null;
    pushHistory();
  }

  function commitText() {
    if (!textPos || !textRef.current) { setTextPos(null); return; }
    const val = textRef.current.value;
    if (val.trim()) {
      const ctx = canvasRef.current.getContext('2d');
      const italic = textOpts.italic ? 'italic ' : '';
      const bold = textOpts.bold ? 'bold ' : '';
      ctx.font = `${italic}${bold}${textOpts.size}px ${textOpts.font}`;
      ctx.fillStyle = fg;
      ctx.textBaseline = 'top';
      val.split('\n').forEach((line, i) => {
        ctx.fillText(line, textPos.x, textPos.y + i * textOpts.size * 1.25);
      });
      pushHistory();
    }
    setTextPos(null);
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'z') { e.preventDefault(); undo(); }
      else if (ctrl && (e.key === 'y' || (e.key === 'Z'))) { e.preventDefault(); redo(); }
      else if (ctrl && e.key === 's') { e.preventDefault(); saveImage(); }
      else if (ctrl && e.key === 'n') { e.preventDefault(); newCanvas(); }
      else if (ctrl && e.key === 'a') { e.preventDefault(); selectAll(); }
      else if (e.key === 'Delete') deleteSelection();
      else if (e.key === 'Escape') {
        commitText();
        if (selDataRef.current) commitSelMove();
        setSelRect(null); selDataRef.current = null;
        ds.current.drawing = false; ds.current.curvePh = 0; ds.current.polyPts = [];
        overlayRef.current?.getContext('2d').clearRect(0,0,9999,9999);
      }
      else if (ctrl && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomIn(); }
      else if (ctrl && e.key === '-') { e.preventDefault(); zoomOut(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Mouse handlers ───────────────────────────────────────────────────────────
  function handleMouseDown(e) {
    e.preventDefault();
    setMenu(null);
    if (textPos) { commitText(); }

    const d = ds.current;
    const btn = e.button;
    const color = btn === 2 ? bg : fg;
    const altColor = btn === 2 ? fg : bg;
    const { x, y } = getPos(e, overlayRef.current, zoom);
    const ctx = canvasRef.current.getContext('2d');
    const octx = overlayRef.current.getContext('2d');

    d.btn = btn; d.sx = x; d.sy = y; d.lx = x; d.ly = y;

    switch (tool) {
      case 'pencil':
        d.drawing = true;
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = lineW; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y + 0.01); ctx.stroke();
        ctx.restore();
        break;

      case 'brush':
        d.drawing = true;
        ctx.save(); ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, brushSz/2, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        break;

      case 'eraser':
        d.drawing = true;
        ctx.fillStyle = bg;
        ctx.fillRect(x - eraserSz/2, y - eraserSz/2, eraserSz, eraserSz);
        break;

      case 'airbrush':
        d.drawing = true;
        sprayDots(ctx, x, y, color, brushSz);
        if (airTimerRef.current) clearInterval(airTimerRef.current);
        airTimerRef.current = setInterval(() => {
          if (!ds.current.drawing) return;
          sprayDots(canvasRef.current.getContext('2d'), ds.current.lx, ds.current.ly, color, brushSz);
        }, 50);
        break;

      case 'fill':
        floodFill(ctx, x, y, color);
        pushHistory();
        break;

      case 'eyedrop': {
        const xi = Math.max(0, Math.min(Math.floor(x), ctx.canvas.width-1));
        const yi = Math.max(0, Math.min(Math.floor(y), ctx.canvas.height-1));
        const px = ctx.getImageData(xi, yi, 1, 1).data;
        const hex = '#' + [px[0],px[1],px[2]].map(v => v.toString(16).padStart(2,'0')).join('');
        if (btn === 2) setBg(hex); else setFg(hex);
        break;
      }

      case 'magnifier':
        if (btn === 2) zoomOut(); else zoomIn();
        break;

      case 'text':
        setTextPos({ x, y });
        break;

      case 'select': {
        const sel = selRectRef.current;
        if (sel && x >= sel.x && x <= sel.x+sel.w && y >= sel.y && y <= sel.y+sel.h) {
          d.drawing = true;
          d.selMoving = true;
          d.selMoveOff = { dx: x - sel.x, dy: y - sel.y };
          if (!selDataRef.current) {
            selDataRef.current = ctx.getImageData(sel.x, sel.y, sel.w, sel.h);
            ctx.fillStyle = bg;
            ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
            d.saved = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
          }
          return;
        }
        if (selDataRef.current) commitSelMove();
        setSelRect(null); selDataRef.current = null;
        d.drawing = true; d.selMoving = false;
        d.saved = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        break;
      }

      case 'freeselect':
        if (selDataRef.current) commitSelMove();
        setSelRect(null); selDataRef.current = null;
        d.drawing = true;
        d.polyPts = [{ x, y }];
        d.saved = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        break;

      case 'line':
      case 'rect':
      case 'ellipse':
      case 'roundrect':
        d.drawing = true;
        d.saved = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        break;

      case 'polygon':
        if (!d.drawing || d.polyPts.length === 0) {
          d.drawing = true;
          d.polyPts = [{ x, y }];
          d.saved = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        } else {
          d.polyPts.push({ x, y });
        }
        break;

      case 'curve':
        if (d.curvePh === 0) {
          d.drawing = true; d.curvePh = 1;
          d.curveP1 = { x, y };
          d.saved = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        } else if (d.curvePh === 2) {
          // Set control point and commit
          ctx.putImageData(d.saved, 0, 0);
          ctx.save();
          ctx.strokeStyle = color; ctx.lineWidth = lineW; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(d.curveP1.x, d.curveP1.y);
          ctx.quadraticCurveTo(x, y, d.curveP2.x, d.curveP2.y);
          ctx.stroke(); ctx.restore();
          octx.clearRect(0, 0, octx.canvas.width, octx.canvas.height);
          pushHistory();
          d.curvePh = 0; d.drawing = false;
        }
        break;
    }
  }

  function sprayDots(ctx, x, y, color, size) {
    ctx.fillStyle = color;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * size * 1.5;
      ctx.fillRect(x + Math.cos(a)*r, y + Math.sin(a)*r, 1, 1);
    }
  }

  function handleMouseMove(e) {
    const { x, y } = getPos(e, overlayRef.current, zoom);
    setCursorPos({ x: Math.floor(x), y: Math.floor(y) });
    const d = ds.current;
    d.lx = x; d.ly = y;
    if (!d.drawing) return;

    const color = d.btn === 2 ? bg : fg;
    const altColor = d.btn === 2 ? fg : bg;
    const ctx = canvasRef.current.getContext('2d');
    const octx = overlayRef.current.getContext('2d');

    switch (tool) {
      case 'pencil': {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = lineW; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(d.lx, d.ly); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore();
        // Update lx/ly mid-move
        d.lx = x; d.ly = y;
        break;
      }

      case 'brush': {
        ctx.save(); ctx.fillStyle = color;
        const dx = x - d.lx, dy = y - d.ly, dist = Math.sqrt(dx*dx + dy*dy);
        const step = Math.max(1, brushSz / 4);
        for (let i = 0; i <= dist; i += step) {
          const t = dist > 0 ? i/dist : 1;
          ctx.beginPath(); ctx.arc(d.lx + dx*t, d.ly + dy*t, brushSz/2, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
        d.lx = x; d.ly = y;
        break;
      }

      case 'eraser': {
        const dx = x - d.lx, dy = y - d.ly, dist = Math.sqrt(dx*dx + dy*dy);
        const step = Math.max(1, eraserSz / 4);
        ctx.fillStyle = bg;
        for (let i = 0; i <= dist; i += step) {
          const t = dist > 0 ? i/dist : 1;
          ctx.fillRect(d.lx+dx*t - eraserSz/2, d.ly+dy*t - eraserSz/2, eraserSz, eraserSz);
        }
        d.lx = x; d.ly = y;
        break;
      }

      case 'line': {
        const end = e.shiftKey ? snapAngle(d.sx,d.sy,x,y) : {x,y};
        octx.clearRect(0,0,octx.canvas.width,octx.canvas.height);
        drawShape(octx,'line',d.sx,d.sy,end.x,end.y,color,altColor,lineW,fillMode);
        break;
      }

      case 'rect':
      case 'ellipse':
      case 'roundrect': {
        const end = e.shiftKey ? snapSquare(d.sx,d.sy,x,y) : {x,y};
        octx.clearRect(0,0,octx.canvas.width,octx.canvas.height);
        drawShape(octx,tool,d.sx,d.sy,end.x,end.y,color,altColor,lineW,fillMode);
        break;
      }

      case 'select':
        if (d.selMoving) {
          const nx = x - d.selMoveOff.dx, ny = y - d.selMoveOff.dy;
          const sel = selRectRef.current;
          if (sel) {
            const newSel = { x: nx, y: ny, w: sel.w, h: sel.h };
            setSelRect(newSel);
            if (selDataRef.current) {
              ctx.putImageData(d.saved, 0, 0);
              const tmp = document.createElement('canvas');
              tmp.width = sel.w; tmp.height = sel.h;
              tmp.getContext('2d').putImageData(selDataRef.current, 0, 0);
              ctx.drawImage(tmp, nx, ny);
            }
          }
        } else {
          setSelRect({
            x: Math.min(d.sx,x), y: Math.min(d.sy,y),
            w: Math.abs(x-d.sx), h: Math.abs(y-d.sy)
          });
        }
        break;

      case 'freeselect':
        d.polyPts.push({ x, y });
        octx.clearRect(0,0,octx.canvas.width,octx.canvas.height);
        octx.save();
        octx.strokeStyle = '#000'; octx.lineWidth = 1; octx.setLineDash([3,3]);
        octx.beginPath();
        octx.moveTo(d.polyPts[0].x, d.polyPts[0].y);
        d.polyPts.slice(1).forEach(p => octx.lineTo(p.x, p.y));
        octx.stroke(); octx.setLineDash([]); octx.restore();
        break;

      case 'polygon':
        octx.clearRect(0,0,octx.canvas.width,octx.canvas.height);
        octx.save(); octx.strokeStyle = color; octx.lineWidth = lineW; octx.lineCap = 'round';
        octx.beginPath();
        if (d.polyPts.length > 0) {
          octx.moveTo(d.polyPts[0].x, d.polyPts[0].y);
          d.polyPts.slice(1).forEach(p => octx.lineTo(p.x, p.y));
        }
        octx.lineTo(x, y);
        octx.stroke(); octx.restore();
        break;

      case 'curve':
        if (d.curvePh === 1) {
          octx.clearRect(0,0,octx.canvas.width,octx.canvas.height);
          octx.save(); octx.strokeStyle = color; octx.lineWidth = lineW; octx.lineCap = 'round';
          octx.beginPath(); octx.moveTo(d.curveP1.x,d.curveP1.y); octx.lineTo(x,y); octx.stroke();
          octx.restore();
        } else if (d.curvePh === 2) {
          octx.clearRect(0,0,octx.canvas.width,octx.canvas.height);
          octx.save(); octx.strokeStyle = color; octx.lineWidth = lineW; octx.lineCap = 'round';
          octx.beginPath(); octx.moveTo(d.curveP1.x,d.curveP1.y);
          octx.quadraticCurveTo(x,y,d.curveP2.x,d.curveP2.y);
          octx.stroke(); octx.restore();
        }
        break;
    }
  }

  function handleMouseUp(e) {
    const d = ds.current;
    if (!d.drawing && tool !== 'curve') return;
    const { x, y } = getPos(e, overlayRef.current, zoom);
    const color = d.btn === 2 ? bg : fg;
    const altColor = d.btn === 2 ? fg : bg;
    const ctx = canvasRef.current.getContext('2d');
    const octx = overlayRef.current.getContext('2d');

    switch (tool) {
      case 'pencil':
      case 'brush':
      case 'eraser':
        d.drawing = false;
        pushHistory();
        break;

      case 'airbrush':
        d.drawing = false;
        clearInterval(airTimerRef.current); airTimerRef.current = null;
        pushHistory();
        break;

      case 'line': {
        d.drawing = false;
        const end = e.shiftKey ? snapAngle(d.sx,d.sy,x,y) : {x,y};
        octx.clearRect(0,0,octx.canvas.width,octx.canvas.height);
        drawShape(ctx,'line',d.sx,d.sy,end.x,end.y,color,altColor,lineW,fillMode);
        pushHistory();
        break;
      }

      case 'rect':
      case 'ellipse':
      case 'roundrect': {
        d.drawing = false;
        const end = e.shiftKey ? snapSquare(d.sx,d.sy,x,y) : {x,y};
        octx.clearRect(0,0,octx.canvas.width,octx.canvas.height);
        drawShape(ctx,tool,d.sx,d.sy,end.x,end.y,color,altColor,lineW,fillMode);
        pushHistory();
        break;
      }

      case 'select':
        if (d.selMoving) {
          d.selMoving = false;
        } else {
          d.drawing = false;
          const w = Math.abs(x-d.sx), h = Math.abs(y-d.sy);
          if (w < 2 || h < 2) { setSelRect(null); }
        }
        break;

      case 'freeselect': {
        d.drawing = false;
        octx.clearRect(0,0,octx.canvas.width,octx.canvas.height);
        const pts = d.polyPts;
        if (pts.length > 2) {
          const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
          setSelRect({
            x: Math.min(...xs), y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)
          });
        }
        d.polyPts = [];
        break;
      }

      case 'curve':
        if (d.curvePh === 1) {
          d.curveP2 = { x, y };
          d.curvePh = 2;
          // Keep drawing = true so next mousedown sets control point
          return;
        }
        d.drawing = false;
        break;

      case 'polygon':
        // Handled by dblClick
        break;
    }
  }

  function handleDblClick(e) {
    const d = ds.current;
    const { x, y } = getPos(e, overlayRef.current, zoom);
    const color = d.btn === 2 ? bg : fg;
    const altColor = d.btn === 2 ? fg : bg;
    const ctx = canvasRef.current.getContext('2d');
    const octx = overlayRef.current.getContext('2d');

    if (tool === 'polygon' && d.drawing && d.polyPts.length >= 2) {
      octx.clearRect(0, 0, octx.canvas.width, octx.canvas.height);
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = lineW; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(d.polyPts[0].x, d.polyPts[0].y);
      d.polyPts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      if (fillMode !== 0) { ctx.fillStyle = altColor; ctx.fill(); }
      if (fillMode !== 2) { ctx.stroke(); }
      ctx.restore();
      pushHistory();
      d.drawing = false; d.polyPts = [];
    }
  }

  // ── Tool options panel ───────────────────────────────────────────────────────
  function renderOpts() {
    const shapeTools = ['rect','ellipse','roundrect','polygon'];
    const sizeTools = ['pencil','brush','eraser','airbrush','line','curve','rect','ellipse','roundrect','polygon'];

    if (sizeTools.includes(tool)) {
      const isEraser = tool === 'eraser';
      const isBrush = tool === 'brush' || tool === 'airbrush';
      const sizes = isEraser ? [8,12,16,22] : [1,2,3,5,8];
      const cur = isEraser ? eraserSz : isBrush ? brushSz : lineW;
      const setter = isEraser ? setEraserSz : isBrush ? setBrushSz : setLineW;
      return (
        <div className="pt-opts">
          {sizes.map(s => (
            <div key={s} className={'pt-size-opt' + (cur===s ? ' pt-size-opt--active' : '')} onClick={() => setter(s)}>
              <div style={{
                width: isEraser ? s/1.5 : s+2, height: isEraser ? s/1.5 : s+2,
                background: '#000',
                borderRadius: isEraser ? 1 : '50%',
              }}/>
            </div>
          ))}
          {shapeTools.includes(tool) && (
            <>
              <div className="pt-sep"/>
              {[0,1,2].map(m => (
                <div key={m}
                  className={'pt-fill-opt' + (fillMode===m ? ' pt-fill-opt--active' : '')}
                  onClick={() => setFillMode(m)}
                  title={['Outline only','Filled + outline','Filled only'][m]}>
                  <svg viewBox="0 0 20 14" width="22" height="15">
                    <rect x="1" y="1" width="18" height="12"
                      fill={m>0?'currentColor':'none'} stroke={m<2?'currentColor':'none'}
                      strokeWidth="1.5" opacity={m>0&&m<2?0.3:1}/>
                  </svg>
                </div>
              ))}
            </>
          )}
        </div>
      );
    }

    if (tool === 'magnifier') {
      return (
        <div className="pt-opts">
          {ZOOM_LEVELS.map(z => (
            <div key={z} className={'pt-zoom-btn' + (Math.abs(zoom - z) < 0.001 ? ' pt-zoom-btn--active' : '')}
              onClick={() => applyZoom(z)}>
              {z < 1 ? `${Math.round(z*100)}%` : `${z}×`}
            </div>
          ))}
        </div>
      );
    }

    if (tool === 'text') {
      return (
        <div className="pt-opts pt-opts--text">
          <select className="pt-select" value={textOpts.font} onChange={e => setTextOpts(o => ({...o, font: e.target.value}))}>
            {['Arial','Georgia','Courier New','Times New Roman','Verdana','Comic Sans MS','Impact'].map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <input type="number" className="pt-num" min="6" max="144" value={textOpts.size}
            onChange={e => setTextOpts(o => ({...o, size: +e.target.value}))}/>
          <button className={'pt-style-btn'+(textOpts.bold?' pt-style-btn--on':'')}
            onClick={() => setTextOpts(o => ({...o, bold: !o.bold}))}><b>B</b></button>
          <button className={'pt-style-btn'+(textOpts.italic?' pt-style-btn--on':'')}
            onClick={() => setTextOpts(o => ({...o, italic: !o.italic}))}><i>I</i></button>
        </div>
      );
    }

    return <div className="pt-opts"/>;
  }

  // ── Menu definitions ─────────────────────────────────────────────────────────
  const MENUS = {
    File: [
      { label: 'New', shortcut: 'Ctrl+N', action: newCanvas },
      { label: 'Open…', action: openFile },
      null,
      { label: 'Save as PNG', shortcut: 'Ctrl+S', action: saveImage },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: undo, disabled: !canUndo },
      { label: 'Redo', shortcut: 'Ctrl+Y', action: redo, disabled: !canRedo },
      null,
      { label: 'Select All', shortcut: 'Ctrl+A', action: selectAll },
      { label: 'Delete', shortcut: 'Del', action: deleteSelection, disabled: !selRect },
    ],
    View: [
      ...[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8].map(z => ({
        label: z < 1 ? `Zoom ${Math.round(z*100)}%` : `Zoom ${z}×`,
        action: () => { applyZoom(z); setMenu(null); },
      })),
    ],
    Image: [
      { label: 'Clear Canvas (white)', action: newCanvas },
    ],
  };

  const cursorStyle = tool === 'text' ? 'text'
    : tool === 'magnifier' ? (zoom < 8 ? 'zoom-in' : 'zoom-out')
    : (tool === 'select' || tool === 'freeselect') && selRect ? 'default'
    : 'crosshair';

  return (
    <div className="paint-wrap" onClick={() => menu && setMenu(null)}>
      <div className="paint-root">

        {/* ── Menu bar ── */}
        <div className="paint-menu" onClick={e => e.stopPropagation()}>
          <span className="paint-brand">🎨</span>
          {Object.keys(MENUS).map(name => (
            <div key={name}
              className={'pm-item' + (menu === name ? ' pm-item--open' : '')}
              onClick={() => setMenu(m => m === name ? null : name)}>
              {name}
              {menu === name && (
                <div className="pm-dropdown" onClick={e => e.stopPropagation()}>
                  {MENUS[name].map((item, i) =>
                    item === null
                      ? <div key={i} className="pm-sep"/>
                      : <div key={i}
                          className={'pm-di' + (item.disabled ? ' pm-di--disabled' : '')}
                          onClick={() => { if (!item.disabled) { item.action(); setMenu(null); } }}>
                          <span>{item.label}</span>
                          {item.shortcut && <span className="pm-shortcut">{item.shortcut}</span>}
                        </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="paint-body">

          {/* Toolbox */}
          <div className="paint-toolbox">
            <div className="pt-grid">
              {TOOLS.map(t => (
                <button key={t.id}
                  className={'pt-btn' + (tool === t.id ? ' pt-btn--active' : '')}
                  title={t.label}
                  onClick={() => {
                    if (tool !== t.id) {
                      if (textPos) commitText();
                      if (selDataRef.current) commitSelMove();
                      if (t.id !== 'polygon') { ds.current.drawing = false; ds.current.polyPts = []; }
                      if (t.id !== 'curve') { ds.current.curvePh = 0; }
                    }
                    setTool(t.id);
                  }}>
                  <Icon id={t.id}/>
                </button>
              ))}
            </div>
            <div className="pt-sep"/>
            {renderOpts()}
          </div>

          {/* Canvas area */}
          <div ref={canvasAreaRef} className="paint-canvas-area" onClick={() => menu && setMenu(null)}>
            <div className="pt-canvas-wrap"
              style={{ width: 800 * zoom, height: 600 * zoom }}>
              <canvas ref={canvasRef} width={800} height={600}
                className="pt-canvas-main"
                style={{ width: 800 * zoom, height: 600 * zoom }}/>
              <canvas ref={overlayRef} width={800} height={600}
                className="pt-canvas-overlay"
                style={{ width: 800 * zoom, height: 600 * zoom, cursor: cursorStyle }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDblClick}
                onContextMenu={e => e.preventDefault()}
                onMouseLeave={e => { if (ds.current.drawing && tool !== 'polygon' && tool !== 'curve') handleMouseUp(e); }}/>

              {/* Floating text input */}
              {textPos && (
                <textarea ref={textRef} autoFocus className="pt-text-input"
                  style={{
                    left: textPos.x * zoom,
                    top: textPos.y * zoom,
                    font: `${textOpts.italic?'italic ':''} ${textOpts.bold?'bold ':''} ${textOpts.size * zoom}px ${textOpts.font}`,
                    color: fg,
                    minWidth: 40,
                    minHeight: (textOpts.size * zoom * 1.4) + 4,
                  }}
                  onBlur={commitText}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setTextPos(null); }
                    e.stopPropagation();
                  }}/>
              )}
            </div>
          </div>
        </div>

        {/* ── Color bar ── */}
        <div className="paint-colorbar">
          <div className="pt-active-colors">
            <div className="pt-color-bg" style={{ background: bg }} title="Right-click color"
              onClick={() => { const i=document.createElement('input'); i.type='color'; i.value=bg; i.oninput=e=>setBg(e.target.value); i.click(); }}/>
            <div className="pt-color-fg" style={{ background: fg }} title="Left-click color"
              onClick={() => { const i=document.createElement('input'); i.type='color'; i.value=fg; i.oninput=e=>setFg(e.target.value); i.click(); }}/>
          </div>
          <div className="pt-palette">
            {PALETTE.map(c => (
              <div key={c} className="pt-swatch" style={{ background: c }} title={c}
                onClick={() => setFg(c)}
                onContextMenu={e => { e.preventDefault(); setBg(c); }}/>
            ))}
          </div>
        </div>

        {/* ── Status bar ── */}
        <div className="paint-statusbar">
          <span className="pt-status-seg">{cursorPos.x}, {cursorPos.y}</span>
          <span className="pt-status-seg">800 × 600 px</span>
          {selRect && <span className="pt-status-seg">Sel: {Math.round(selRect.w)} × {Math.round(selRect.h)}</span>}
          <span className="pt-status-seg">Tool: {TOOLS.find(t=>t.id===tool)?.label}</span>
          <span className="pt-status-seg pt-status-zoom" style={{ marginLeft: 'auto' }}>
            <button className="pt-zoom-step-btn" onClick={zoomOut}
              disabled={!nextZoomLevel(zoom, -1)} title="Zoom out (Ctrl+−)">−</button>
            <span className="pt-zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="pt-zoom-step-btn" onClick={zoomIn}
              disabled={!nextZoomLevel(zoom, 1)} title="Zoom in (Ctrl++)">+</button>
          </span>
        </div>
      </div>
    </div>
  );
}
