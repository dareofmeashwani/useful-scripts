"""Entry point for the PyInstaller bundle."""
import os
import socket
import sys
import threading
import webbrowser

# When frozen as a windowed app (console=False) there is no stdout/stderr.
# Redirect both to a log file so errors are not silently swallowed.
if hasattr(sys, "_MEIPASS"):
    import tempfile
    _log_path = os.path.join(tempfile.gettempdir(), "UTools.log")
    _log = open(_log_path, "w", buffering=1)
    sys.stdout = _log
    sys.stderr = _log

import uvicorn
from main import app  # noqa: E402  (import after stdio redirect)


def _find_free_port(start: int = 9000, end: int = 9100) -> int:
    """Return the first available TCP port in [start, end)."""
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start  # fallback – let uvicorn surface the bind error


def _open_browser(port: int) -> None:
    """Poll until the server is accepting connections, then open the browser."""
    for _ in range(60):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                break
        except OSError:
            import time
            time.sleep(0.25)
    webbrowser.open(f"http://127.0.0.1:{port}")


if __name__ == "__main__":
    port = _find_free_port()
    threading.Thread(target=_open_browser, args=(port,), daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="error")
