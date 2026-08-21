import os
import http.server
import socketserver

os.chdir("/Users/nsam/Documents/dev/edge-of-the-world-lan-party")

with socketserver.TCPServer(("", 5588), http.server.SimpleHTTPRequestHandler) as httpd:
    httpd.serve_forever()
