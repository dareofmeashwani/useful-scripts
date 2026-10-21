import io
import json
import sys
import hashlib
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import pikepdf

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TOOLS = [
    # ── PDF ─────────────────────────────────────────────────────────────────
    {"id": "pdf-unlock",      "name": "PDF Unlock",         "description": "Remove password protection from PDF files",            "icon": "🔓", "categories": ["PDF"]},
    {"id": "pdf-split",       "name": "PDF Split",          "description": "Split a PDF into separate pages or custom ranges",      "icon": "✂️",  "categories": ["PDF"]},
    {"id": "pdf-merge",       "name": "PDF Merge",          "description": "Combine multiple PDFs into one",                        "icon": "📎", "categories": ["PDF"]},
    {"id": "pdf-to-images",   "name": "PDF to Images",      "description": "Export every PDF page as an image (ZIP)",              "icon": "📑", "categories": ["PDF", "Image"]},

    # ── Image ────────────────────────────────────────────────────────────────
    {"id": "pdf-from-images", "name": "Images to PDF",      "description": "Combine multiple images into a single PDF",            "icon": "🖼️", "categories": ["Image", "PDF"]},
    {"id": "image-convert",   "name": "Image Converter",    "description": "Convert an image to PNG, JPG, WEBP and more",          "icon": "🔄", "categories": ["Image"]},
    {"id": "image-resize",    "name": "Image Resize",       "description": "Resize images by percentage or exact dimensions",       "icon": "📐", "categories": ["Image"]},
    {"id": "image-crop",      "name": "Image Crop",         "description": "Select and crop a region from an image",               "icon": "🔲", "categories": ["Image"]},
    {"id": "image-thumbnail", "name": "Image Thumbnail",    "description": "Generate thumbnails from any image format",            "icon": "🖼",  "categories": ["Image"]},
    {"id": "image-to-ico",    "name": "Image to ICO",       "description": "Convert any image to a multi-size .ico icon file",     "icon": "🎨", "categories": ["Image", "Icon"]},

    # ── Text & Code ──────────────────────────────────────────────────────────
    {"id": "text-viewer",     "name": "Text Viewer",        "description": "View any text or code file with syntax highlighting",   "icon": "🔍", "categories": ["Text", "Code"]},
    {"id": "text-diff",       "name": "Text Diff",          "description": "Compare two texts and show line-by-line differences",   "icon": "↔️",  "categories": ["Text"]},
    {"id": "json-viewer",     "name": "JSON / YAML Viewer", "description": "Explore and navigate JSON or YAML with expand/collapse","icon": "📋", "categories": ["Text", "JSON", "Yaml"]},
    {"id": "xml-viewer",      "name": "XML Viewer",         "description": "Explore and navigate XML with syntax highlighting",     "icon": "📄", "categories": ["Text", "XML"]},
    {"id": "base64-text",     "name": "Base64",             "description": "Encode or decode text using Base64",                   "icon": "🔢", "categories": ["Text", "Base64"]},

    # ── Developer ────────────────────────────────────────────────────────────
    {"id": "jwt-decode",      "name": "JWT Decoder",        "description": "Inspect JWT header, payload, signature and expiry",    "icon": "🔑", "categories": ["JWT"]},
    {"id": "uuid-generate",   "name": "UUID Generator",     "description": "Generate one or more random UUIDs (v4)",               "icon": "🎲", "categories": ["Guid", "UUID"]},
    {"id": "dep-graph",       "name": "Dependency Graph",   "description": "Visualize a dependency file from any language as a directed graph", "icon": "🕸️", "categories": ["Graph", "Dependencies"]},

    # ── Email ────────────────────────────────────────────────────────────────
    {"id": "email-to-pdf",    "name": "Email to PDF",       "description": "Convert an exported .eml or .emltpl email file to a complete, paginated PDF",        "icon": "📧", "categories": ["Email", "PDF"]},

    # ── Fun ──────────────────────────────────────────────────────────────────
    {"id": "paint",           "name": "Paint",              "description": "MS Paint-style drawing app — pencil, shapes, fill, text and more, all in the browser", "icon": "🎨", "categories": ["Fun", "Image"]},
]

MAX_PDF_BYTES = 50 * 1024 * 1024   # 50 MB


def _validate_pdf(data: bytes) -> None:
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="File is not a valid PDF")


def _stream_pdf(buffer: io.BytesIO, filename: str) -> StreamingResponse:
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

_TOOLS_JSON = json.dumps(TOOLS, separators=(",", ":")).encode("utf-8")
_TOOLS_ETAG = '"' + hashlib.md5(_TOOLS_JSON).hexdigest() + '"'
_TOOLS_CACHE_CONTROL = "public, max-age=300"


@app.get("/tools")
def get_tools(request: Request):
    headers = {"ETag": _TOOLS_ETAG, "Cache-Control": _TOOLS_CACHE_CONTROL}
    if request.headers.get("if-none-match") == _TOOLS_ETAG:
        return Response(status_code=304, headers=headers)
    return Response(content=_TOOLS_JSON, media_type="application/json", headers=headers)


@app.post("/tools/pdf-unlock")
async def pdf_unlock(file: UploadFile = File(...), password: str = Form(...)):
    data = await file.read()
    _validate_pdf(data)

    try:
        try:
            probe = pikepdf.open(io.BytesIO(data))
            probe.close()
            raise HTTPException(status_code=400, detail="This PDF is not password-protected")
        except pikepdf.PasswordError:
            pass

        pdf = pikepdf.open(io.BytesIO(data), password=password)
        output = io.BytesIO()
        pdf.save(output)
        pdf.close()

        return _stream_pdf(output, f"unlocked_{file.filename or 'document.pdf'}")
    except HTTPException:
        raise
    except pikepdf.PasswordError:
        raise HTTPException(status_code=400, detail="Incorrect password")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to process the PDF")


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Production static file serving ────────────────────────────────────────────

_BASE = Path(sys._MEIPASS) if hasattr(sys, "_MEIPASS") else Path(__file__).resolve().parent.parent
_DIST = _BASE / "frontend" / "dist"

_IMMUTABLE_CACHE = "public, max-age=31536000, immutable"


class _ImmutableStaticFiles(StaticFiles):
    """StaticFiles that marks responses immutable — safe because Vite emits
    content-hashed asset filenames, so a changed file always has a new URL."""

    def file_response(self, *args, **kwargs):
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = _IMMUTABLE_CACHE
        return resp


if _DIST.exists():
    app.mount("/assets", _ImmutableStaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        file = _DIST / full_path
        if file.is_file():
            return FileResponse(str(file))
        return FileResponse(
            str(_DIST / "index.html"),
            headers={"Cache-Control": "no-cache"},
        )
