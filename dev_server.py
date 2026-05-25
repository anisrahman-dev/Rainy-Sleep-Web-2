"""Static dev server that mimics Vercel's cleanUrls: /journal -> journal.html."""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self._maybe_rewrite()
        return super().do_GET()

    def do_HEAD(self):
        self._maybe_rewrite()
        return super().do_HEAD()

    def _maybe_rewrite(self):
        parts = urlsplit(self.path)
        path = parts.path
        if path.endswith("/") or "." in os.path.basename(path):
            return
        candidate = path.lstrip("/") + ".html"
        if os.path.isfile(os.path.join(os.getcwd(), candidate)):
            rest = parts.query
            self.path = "/" + candidate + (("?" + rest) if rest else "")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer(("127.0.0.1", port), CleanUrlHandler)
    print(f"Serving {os.getcwd()} on http://localhost:{port} (cleanUrls enabled)")
    server.serve_forever()
