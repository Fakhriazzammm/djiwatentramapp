#!/usr/bin/env python3
"""Dependency-free local server for booking browser QA only.
Serves production dist, the fixture, and a visible mock Mayar page."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DIST = ROOT / "apps/booking/dist"
FIXTURE = ROOT / "apps/booking/test/browser-mock-qa-fixture.js"

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/qa-fixture.js":
            body = FIXTURE.read_bytes()
            self.send_response(200); self.send_header("Content-Type", "text/javascript"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if self.path.startswith("/mock-mayar/"):
            body = b"<!doctype html><meta name='viewport' content='width=device-width'><title>Mock Mayar</title><main style='font:20px system-ui;max-width:520px;margin:20vh auto;text-align:center'><h1>Mock Mayar checkout</h1><p>QA-only simulated provider page.</p><button id='pay'>Simulasikan pembayaran berhasil</button><button id='pending'>Kembali tanpa pembayaran</button><script>const back=(mode)=>{sessionStorage.setItem('qa-payment-mode',mode);location.href='/status?code=BK-QA-001'};document.querySelector('#pay').onclick=()=>back('paid');document.querySelector('#pending').onclick=()=>back('pending');</script></main>"
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        # The production app owns /status client-side; serve the SPA shell for
        # direct callback navigation instead of returning the static 404.
        if self.path.split("?", 1)[0] in {"/", "/status", "/success"}:
            self.path = "/index.html"
        self.directory = str(DIST)
        return super().do_GET()
    def log_message(self, *_): pass

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4174), Handler).serve_forever()
