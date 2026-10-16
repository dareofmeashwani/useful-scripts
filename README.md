# UTools

A local browser-based toolbox — PDF manipulation, image processing, text utilities, and developer tools, all running in your browser with no data leaving your machine.

Most tools run entirely client-side (Canvas API, pdf-lib, pdfjs-dist). The Python backend exists only for operations that genuinely require it, currently just PDF Unlock (pikepdf).

---

## Tools

| Category | Tool | Description |
|----------|------|-------------|
| **PDF** | PDF Unlock | Remove password protection from a PDF |
| | PDF Split | Split a PDF into pages or custom ranges |
| | PDF Merge | Combine multiple PDFs into one |
| | PDF to Images | Export every page as a PNG (ZIP) |
| **Image** | Images to PDF | Combine images into a single PDF |
| | Image Converter | Convert to PNG, JPG, WEBP, or BMP |
| | Image Resize | Resize by percentage or exact dimensions |
| | Image Crop | Select and crop a region |
| | Image Thumbnail | Generate thumbnails at any size |
| | Image to ICO | Convert to a multi-size `.ico` icon |
| **Text & Code** | Text Viewer | View any file with syntax highlighting |
| | Text Diff | Line-by-line text comparison |
| | JSON / YAML Viewer | Explore JSON or YAML with expand/collapse |
| | XML Viewer | Navigate XML with syntax highlighting |
| | Base64 | Encode or decode text |
| **Developer** | JWT Decoder | Inspect header, payload, and expiry |
| | UUID Generator | Generate random UUIDs v4 |
| | Dependency Graph | Visualize a dependency file as a directed graph |
| **Fun** | Paint | MS Paint-style drawing app |

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, React Router 7, Vite 8 |
| Client-side processing | pdf-lib, pdfjs-dist, fflate, Canvas API |
| Backend | Python 3, FastAPI, uvicorn, pikepdf |
| Desktop bundle | PyInstaller |
| Container | Docker |

---

## Running

### Development

Runs the Vite dev server and FastAPI backend concurrently. Ctrl+C stops both.

```bash
make install   # one-time: npm ci + pip install
make dev
# Frontend → http://localhost:5173
# Backend  → http://localhost:9000
```

Or separately:

```bash
# Terminal 1
cd frontend && npm run dev

# Terminal 2
cd backend && source venv/bin/activate && uvicorn main:app --reload --port 9000
```

### Production (no bundle)

Builds the frontend and serves everything through the FastAPI server.

```bash
make prod
# → http://0.0.0.0:9000
```

### Desktop app (PyInstaller)

Produces a single self-contained executable. On macOS it becomes a `.app` bundle that opens a browser tab automatically and runs silently in the background (no Dock icon).

```bash
make bundle
# macOS:  open backend/dist/UTools.app
# Other:  ./backend/dist/UTools
```

### Docker

```bash
docker build -t utools .
docker run -p 9000:9000 utools
# → http://localhost:9000
```

---

## Project layout

```
UTools/
├── frontend/               # Vite / React
│   └── src/
│       ├── tools/          # One component per tool
│       ├── components/     # Shared UI (FileZone, ToolHeader, …)
│       ├── hooks/          # usePdfFile, useTheme
│       ├── utils/          # imageUtils (Canvas helpers, BMP encoder, ICO builder)
│       └── toolLoaders.js  # Static imports (eager) + dynamic imports (lazy PDF tools)
│
├── backend/
│   ├── main.py             # FastAPI app + static file serving
│   ├── app.py              # PyInstaller entry point (port scan + browser open)
│   ├── requirements.txt
│   └── UTools.spec         # PyInstaller spec
│
├── Dockerfile
├── Makefile
└── .dockerignore
```

### Bundle strategy

Tools are split into two groups:

- **Eager** (bundled into `app.js`, loaded immediately): every tool that uses only browser APIs or small libraries.
- **Lazy** (separate chunks, loaded on first open): `PdfToImages` (pdfjs-dist, 430 KB), `PdfSplit`, and `PdfFromImages` (pdf-lib, 419 KB).

Large vendor libraries (`vendor-react`, `vendor-pdf-lib`, `vendor-pdfjs`) are split into named chunks so the browser caches them across app updates. All asset filenames are content-hashed; `index.html` is served with `Cache-Control: no-cache` so the browser always picks up new asset URLs.

---

## Makefile reference

| Target | Description |
|--------|-------------|
| `make install` | Install all frontend and backend dependencies |
| `make dev` | Start both servers in dev mode |
| `make build` | Build the frontend only |
| `make prod` | Build frontend + start production server |
| `make bundle` | Build frontend + create PyInstaller executable |
| `make clean` | Remove all build artifacts and virtual environments |
