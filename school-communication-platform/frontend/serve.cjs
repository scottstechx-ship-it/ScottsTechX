// Frontend static server WITH API proxy.
// Frontend:  http://localhost:5500
// API proxied:  http://localhost:5500/api/*  ->  http://localhost:4000/api/*
//                http://localhost:5500/socket.io/* -> http://localhost:4000/socket.io/*
// This means the frontend keeps using same-origin (location.origin) and config.js
// works unchanged. No CORS headaches.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.FRONTEND_PORT ? parseInt(process.env.FRONTEND_PORT, 10) : 5500;
const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 4000;
const API_HOST = process.env.API_HOST || 'localhost';
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

// ---- API reverse-proxy ----------------------------------------------------
function proxyToApi(req, res) {
  const options = {
    hostname: API_HOST,
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` },
  };
  const proxy = http.request(options, (pRes) => {
    res.writeHead(pRes.statusCode || 502, pRes.headers);
    pRes.pipe(res);
  });
  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API server unreachable on port ' + API_PORT }));
  });
  req.pipe(proxy);
}

// ---- static file server ---------------------------------------------------
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Proxy /api/* and /socket.io/* to the backend on API_PORT
  if (urlPath.startsWith('/api/') || urlPath.startsWith('/socket.io/')) {
    return proxyToApi(req, res);
  }

  if (urlPath === '/') urlPath = '/index.html';

  // If path ends with / or has no extension, try index.html
  const ext = path.extname(urlPath);
  if (urlPath.endsWith('/') || !ext) {
    urlPath = urlPath.replace(/\/$/, '') + '/index.html';
  }

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found: ' + urlPath);
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`==============================================`);
  console.log(` Frontend:  http://localhost:${PORT}/`);
  console.log(` API proxy: http://localhost:${PORT}/api/*  ->  http://${API_HOST}:${API_PORT}/api/*`);
  console.log(` Socket.IO: http://localhost:${PORT}/socket.io/*  ->  http://${API_HOST}:${API_PORT}/socket.io/*`);
  console.log(`==============================================`);
});
