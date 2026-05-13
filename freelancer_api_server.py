#!/usr/bin/env python3
"""Freelancer Browser API — separater Server auf Port 8790."""
import json, os, sys, time, base64, threading
from http.server import HTTPServer, BaseHTTPRequestHandler
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from api.freelancer import get_status, screenshot, click, fill, navigate, evaluate, form_fields, start as fl_start, stop as fl_stop, save_session, select_option

class FLHandler(BaseHTTPRequestHandler):
    def _json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode())
    
    def _png(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'image/png')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(base64.b64decode(data))
    
    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length:
            return json.loads(self.rfile.read(length).decode())
        return {}
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        p = self.path
        try:
            if p == '/status':
                return self._json(get_status())
            if p == '/screenshot':
                return self._png(screenshot())
            if p == '/form-fields':
                return self._json(form_fields())
            if p == '/ping':
                return self._json({'ok': True})
        except Exception as e:
            return self._json({'error': str(e)[:200]}, 500)
        self._json({'error': 'not found'}, 404)
    
    def do_POST(self):
        p = self.path
        body = self._read_body()
        try:
            if p == '/start':
                return self._json(fl_start())
            if p == '/stop':
                fl_stop()
                return self._json({'status': 'stopped'})
            if p == '/navigate':
                return self._json(navigate(body.get('url', 'https://www.freelancer.com/login')))
            if p == '/click':
                return self._json(click(int(body.get('x', 0)), int(body.get('y', 0))))
            if p == '/fill':
                return self._json(fill(body.get('selector', ''), body.get('text', '')))
            if p == '/evaluate':
                return self._json(evaluate(body.get('js', '')))
            if p == '/select':
                return self._json(select_option(body.get('selector', ''), body.get('value', '')))
            if p == '/save-session':
                save_session()
                return self._json({'status': 'saved'})
        except Exception as e:
            return self._json({'error': str(e)[:200]}, 500)
        self._json({'error': 'not found'}, 404)
    
    def log_message(self, format, *args):
        pass

def run():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    server = HTTPServer(('127.0.0.1', port), FLHandler)
    print(f'[freelancer-api] http://127.0.0.1:{port}', flush=True)
    server.serve_forever()

if __name__ == '__main__':
    run()
