// Web preview on x1: serves the Metro web dev server and Tally's API from one origin, so the web build can call
// /api without CORS. `node scripts/preview.mjs` → http://127.0.0.1:8090 (Metro on :8082, Tally on :8000, or
// API_PORT=8001 for a backend running on a copy of the database).
import http from 'node:http'

const API = Number(process.env.API_PORT || 8000)
const route = (path) => (path.startsWith('/api/') || path.startsWith('/export/') ? API : 8082)
http.createServer((req, res) => {
  const up = http.request({ host: '127.0.0.1', port: route(req.url), path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers)
    r.pipe(res)
  })
  up.on('error', () => { res.writeHead(502); res.end() })
  req.pipe(up)
}).listen(8090, '127.0.0.1', () => console.log('preview on http://127.0.0.1:8090'))
