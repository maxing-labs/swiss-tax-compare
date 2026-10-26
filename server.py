#!/usr/bin/env python3
"""Swiss Tax Compare: local dev server. Serves static/ and routes /api/* to api/index.py like Vercel does."""

import json
import logging
import urllib.parse
from http import HTTPStatus
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from api.index import error_status, handle_api_request


class TaxHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).parent / "static"), **kwargs)

    def send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            qs = urllib.parse.parse_qs(parsed.query)
            try:
                return self.send_json(handle_api_request(parsed.path, qs))
            except Exception as e:
                status = error_status(e)
                log = logging.exception if status == 500 else logging.warning
                log("GET %s -> %d: %s", self.path, status, e)
                return self.send_json({"error": HTTPStatus(status).phrase}, status=status)
        return super().do_GET()


if __name__ == "__main__":
    port = 8766
    print(f"Starting Swiss Tax Compare server at http://127.0.0.1:{port}")
    HTTPServer(("127.0.0.1", port), TaxHandler).serve_forever()
