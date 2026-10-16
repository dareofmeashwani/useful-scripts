# ── Stage 1: Build the Vite/React frontend ────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Install deps in a separate layer so source changes don't bust the npm cache
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --prefer-offline

COPY frontend/ ./
RUN npm run build


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM python:3.12-slim

# Non-root user — pikepdf and uvicorn need no special privileges
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Install Python runtime deps.
# pyinstaller is a desktop-bundler (build-time only) so we exclude it here.
COPY backend/requirements.txt ./
RUN grep -v "^pyinstaller" requirements.txt \
    | pip install --no-cache-dir -r /dev/stdin \
    && rm requirements.txt

# Mirror the source layout: main.py uses Path(__file__).parent.parent to find
# frontend/dist, so the image must preserve the same two-level structure.
#
#   /app/
#   ├── backend/main.py   ← __file__
#   └── frontend/dist/    ← parent.parent / "frontend" / "dist"
COPY backend/main.py ./backend/

COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 9000

# Run from backend/ so uvicorn can import main.py as "main"
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9000"]
