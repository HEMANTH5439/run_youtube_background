import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import ssl

PORT = 8085

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == '/api/get_audio':
            query_components = urllib.parse.parse_qs(parsed_path.query)
            video_id = query_components.get('v', [None])[0]
            
            if not video_id:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "Missing video ID"}')
                return
                
            try:
                import yt_dlp
                ydl_opts = {
                    'format': 'bestaudio',
                    'quiet': True,
                    'no_warnings': True
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                    stream_url = info['url']
                    title = info.get('title', 'YouTube Audio')
                    author = info.get('uploader', 'YouTube Stream')
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "streamUrl": stream_url,
                        "title": title,
                        "author": author
                    }).encode())
                    return
            except ImportError:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b'{"error": "yt_dlp module not found on server"}')
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
                return
                
        # Fallback to serving static files
        return super().do_GET()

# Allow address reuse so we don't get "Address already in use" errors on restart
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()
