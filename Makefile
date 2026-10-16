.PHONY: install dev build prod bundle clean frontend-install backend-install

# ── Install ────────────────────────────────────────────────────────────────────

install: frontend-install backend-install

frontend-install:
	cd frontend && npm install

backend-install:
	cd backend && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt

# ── Dev (runs both concurrently, Ctrl+C stops both) ───────────────────────────

dev:
	@trap 'kill 0' INT; \
	(cd backend && . venv/bin/activate && uvicorn main:app --reload --port 9000) & \
	(cd frontend && npm run dev) & \
	wait

# ── Build / Prod ───────────────────────────────────────────────────────────────

build:
	cd frontend && npm run build

prod: build
	@echo "Serving on http://0.0.0.0:9000"
	cd backend && . venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 9000

# ── Bundle (single self-contained executable via PyInstaller) ──────────────────
# 1. Builds the frontend (Vite) so backend/UTools.spec can reference the dist.
# 2. Runs PyInstaller using the checked-in spec file (no ad-hoc flags).
# Output (macOS): backend/dist/UTools.app  – double-click or: open backend/dist/UTools.app
# Output (other): backend/dist/UTools

bundle: build
	@echo "==> Bundling with PyInstaller…"
	cd backend && . venv/bin/activate && pip install -q pyinstaller && \
	pyinstaller UTools.spec --clean
	@echo ""
	@echo "==> Done!  Output → backend/dist/"

# ── Clean ──────────────────────────────────────────────────────────────────────

clean:
	rm -rf frontend/node_modules frontend/dist frontend/.vite
	rm -rf backend/venv backend/__pycache__ backend/_ui
	rm -rf backend/dist backend/build
	find . -name "*.pyc" -delete
	find . -name "__pycache__" -delete
