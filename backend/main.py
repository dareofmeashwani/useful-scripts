import io
import json
import sys
import hashlib
import datetime
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import pikepdf
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec, dsa, ed25519, ed448
from cryptography.x509.oid import ExtensionOID, NameOID

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
    {"id": "jwt-decode",      "name": "JWT Decoder",        "description": "Inspect JWT header, payload, signature and expiry",    "icon": "🔑", "categories": ["JWT", "Security"]},
    {"id": "uuid-generate",   "name": "UUID Generator",     "description": "Generate one or more random UUIDs (v4)",               "icon": "🎲", "categories": ["Guid", "UUID"]},
    {"id": "dep-graph",       "name": "Dependency Graph",   "description": "Visualize a dependency file from any language as a directed graph", "icon": "🕸️", "categories": ["Graph", "Dependencies"]},

    # ── Email ────────────────────────────────────────────────────────────────
    {"id": "email-to-pdf",    "name": "Email to PDF",       "description": "Convert an exported .eml or .emltpl email file to a complete, paginated PDF",        "icon": "📧", "categories": ["Email", "PDF"]},

    # ── Fun ──────────────────────────────────────────────────────────────────
    {"id": "paint",           "name": "Paint",              "description": "MS Paint-style drawing app — pencil, shapes, fill, text and more, all in the browser", "icon": "🎨", "categories": ["Edit", "Image"]},

    # ── Security ─────────────────────────────────────────────────────────────
    {"id": "cert-viewer",     "name": "Certificate Viewer", "description": "Inspect X.509 certificate details and full chain — subject, issuer, validity, SANs, key info and fingerprints", "icon": "🔐", "categories": ["Security", "Certificate"]},
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


# ── Certificate Viewer ─────────────────────────────────────────────────────────

def _dn_to_dict(name: x509.Name) -> dict:
    OID_LABELS = {
        NameOID.COMMON_NAME:             "CN",
        NameOID.ORGANIZATION_NAME:       "O",
        NameOID.ORGANIZATIONAL_UNIT_NAME:"OU",
        NameOID.COUNTRY_NAME:            "C",
        NameOID.STATE_OR_PROVINCE_NAME:  "ST",
        NameOID.LOCALITY_NAME:           "L",
        NameOID.EMAIL_ADDRESS:           "emailAddress",
    }
    result = {}
    for attr in name:
        label = OID_LABELS.get(attr.oid, attr.oid.dotted_string)
        result[label] = attr.value
    return result


def _pubkey_info(key) -> dict:
    if isinstance(key, rsa.RSAPublicKey):
        return {"algorithm": "RSA", "size": key.key_size}
    if isinstance(key, ec.EllipticCurvePublicKey):
        return {"algorithm": "EC", "curve": key.curve.name, "size": key.key_size}
    if isinstance(key, dsa.DSAPublicKey):
        return {"algorithm": "DSA", "size": key.key_size}
    if isinstance(key, ed25519.Ed25519PublicKey):
        return {"algorithm": "Ed25519", "size": 256}
    if isinstance(key, ed448.Ed448PublicKey):
        return {"algorithm": "Ed448", "size": 448}
    return {"algorithm": "Unknown", "size": None}


def _parse_cert(cert: x509.Certificate) -> dict:
    now = datetime.datetime.now(datetime.timezone.utc)
    not_after = cert.not_valid_after_utc
    not_before = cert.not_valid_before_utc
    days_remaining = (not_after - now).days

    # Key usage
    key_usage = []
    try:
        ku = cert.extensions.get_extension_for_oid(ExtensionOID.KEY_USAGE).value
        flags = {
            "Digital Signature": ku.digital_signature,
            "Content Commitment": ku.content_commitment,
            "Key Encipherment": ku.key_encipherment,
            "Data Encipherment": ku.data_encipherment,
            "Key Agreement": ku.key_agreement,
            "Key Cert Sign": ku.key_cert_sign,
            "CRL Sign": ku.crl_sign,
        }
        key_usage = [k for k, v in flags.items() if v]
    except x509.ExtensionNotFound:
        pass

    # Extended key usage
    ext_key_usage = []
    try:
        eku = cert.extensions.get_extension_for_oid(ExtensionOID.EXTENDED_KEY_USAGE).value
        EKU_LABELS = {
            "1.3.6.1.5.5.7.3.1": "Server Authentication",
            "1.3.6.1.5.5.7.3.2": "Client Authentication",
            "1.3.6.1.5.5.7.3.3": "Code Signing",
            "1.3.6.1.5.5.7.3.4": "Email Protection",
            "1.3.6.1.5.5.7.3.8": "Timestamping",
            "1.3.6.1.5.5.7.3.9": "OCSP Signing",
        }
        ext_key_usage = [EKU_LABELS.get(u.dotted_string, u.dotted_string) for u in eku]
    except x509.ExtensionNotFound:
        pass

    # Subject Alternative Names
    san = []
    try:
        san_ext = cert.extensions.get_extension_for_oid(ExtensionOID.SUBJECT_ALTERNATIVE_NAME).value
        for name in san_ext:
            if isinstance(name, x509.DNSName):
                san.append(f"DNS:{name.value}")
            elif isinstance(name, x509.IPAddress):
                san.append(f"IP:{name.value}")
            elif isinstance(name, x509.RFC822Name):
                san.append(f"email:{name.value}")
            elif isinstance(name, x509.UniformResourceIdentifier):
                san.append(f"URI:{name.value}")
    except x509.ExtensionNotFound:
        pass

    # Basic constraints
    is_ca = False
    path_length = None
    try:
        bc = cert.extensions.get_extension_for_oid(ExtensionOID.BASIC_CONSTRAINTS).value
        is_ca = bc.ca
        path_length = bc.path_length
    except x509.ExtensionNotFound:
        pass

    # Subject Key Identifier
    ski = None
    try:
        ski_ext = cert.extensions.get_extension_for_oid(ExtensionOID.SUBJECT_KEY_IDENTIFIER).value
        ski = ski_ext.key_identifier.hex(":")
    except x509.ExtensionNotFound:
        pass

    # Authority Key Identifier
    aki = None
    try:
        aki_ext = cert.extensions.get_extension_for_oid(ExtensionOID.AUTHORITY_KEY_IDENTIFIER).value
        if aki_ext.key_identifier:
            aki = aki_ext.key_identifier.hex(":")
    except x509.ExtensionNotFound:
        pass

    # Fingerprints
    der = cert.public_bytes(serialization.Encoding.DER)
    sha1   = hashlib.sha1(der).hexdigest().upper()
    sha256 = hashlib.sha256(der).hexdigest().upper()
    fp_sha1   = ":".join(sha1[i:i+2]   for i in range(0, len(sha1),   2))
    fp_sha256 = ":".join(sha256[i:i+2] for i in range(0, len(sha256), 2))

    pem = cert.public_bytes(serialization.Encoding.PEM).decode("ascii")

    return {
        "subject":             _dn_to_dict(cert.subject),
        "issuer":              _dn_to_dict(cert.issuer),
        "serial":              format(cert.serial_number, "X"),
        "version":             cert.version.value + 1,
        "not_before":          not_before.isoformat(),
        "not_after":           not_after.isoformat(),
        "is_expired":          days_remaining < 0,
        "days_remaining":      days_remaining,
        "signature_algorithm": cert.signature_hash_algorithm.name if cert.signature_hash_algorithm else "unknown",
        "public_key":          _pubkey_info(cert.public_key()),
        "is_ca":               is_ca,
        "path_length":         path_length,
        "key_usage":           key_usage,
        "ext_key_usage":       ext_key_usage,
        "san":                 san,
        "subject_key_id":      ski,
        "authority_key_id":    aki,
        "fingerprint_sha1":    fp_sha1,
        "fingerprint_sha256":  fp_sha256,
        "pem":                 pem,
    }


def _load_certs_from_bytes(data: bytes) -> list[x509.Certificate]:
    certs = []
    # Try PEM (may contain multiple certificates)
    if b"-----BEGIN" in data:
        import re
        blocks = re.findall(
            rb"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
            data, re.DOTALL,
        )
        if not blocks:
            raise HTTPException(status_code=400, detail="No CERTIFICATE blocks found in PEM data")
        for block in blocks:
            try:
                certs.append(x509.load_pem_x509_certificate(block))
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Failed to parse PEM block: {exc}")
        return certs
    # Try DER
    try:
        certs.append(x509.load_der_x509_certificate(data))
        return certs
    except Exception:
        pass
    raise HTTPException(status_code=400, detail="Could not parse certificate — expected PEM or DER format")


@app.post("/tools/cert-viewer")
async def cert_viewer(
    file: UploadFile = File(None),
    pem_text: str    = Form(None),
):
    if file and file.filename:
        raw = await file.read()
    elif pem_text and pem_text.strip():
        raw = pem_text.strip().encode("utf-8")
    else:
        raise HTTPException(status_code=400, detail="Provide a certificate file or paste PEM text")

    certs = _load_certs_from_bytes(raw)
    return {"chain": [_parse_cert(c) for c in certs]}


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
