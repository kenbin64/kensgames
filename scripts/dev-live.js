/**
 * Zero-dep dev server with live reload (SSE).
 * Usage: `node scripts/dev-live.js [port]`  (default 8000)
 * Serves the repo root and auto-injects an SSE reload snippet into every HTML
 * response. File changes under the repo (excluding node_modules/.git/assets)
 * trigger a reload event for every connected page.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = parseInt(process.argv[2], 10) || 8000;
const ROOT = path.resolve(__dirname, '..');
const WATCH_EXT = new Set(['.html', '.css', '.js', '.json', '.svg']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'assets', 'dist', 'state']);

const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.mjs':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.webp':'image/webp', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2',
  '.ttf':'font/ttf', '.otf':'font/otf', '.map':'application/json',
};

const RELOAD_SNIPPET = `
<script>
(function(){
  if (window.__kgLive) return; window.__kgLive = true;
  var es = new EventSource('/__live');
  var dot = document.createElement('div');
  dot.style.cssText='position:fixed;right:8px;bottom:8px;z-index:2147483647;width:10px;height:10px;border-radius:50%;background:#0f0;box-shadow:0 0 6px #0f0;font:10px monospace;color:#fff;line-height:10px;text-align:center;cursor:default;opacity:.7';
  dot.title='dev-live: connected';
  document.addEventListener('DOMContentLoaded',function(){document.body&&document.body.appendChild(dot)});
  es.addEventListener('reload',function(e){dot.style.background='#f90';dot.title='reloading…';location.reload();});
  es.addEventListener('hello',function(){dot.style.background='#0f0';dot.title='dev-live: connected';});
  es.onerror=function(){dot.style.background='#f00';dot.title='dev-live: disconnected';};
})();
</script>`;

const clients = new Set();
let lastBroadcast = 0;
function broadcast(file) {
  const now = Date.now();
  if (now - lastBroadcast < 200) return;
  lastBroadcast = now;
  const payload = `event: reload\ndata: ${JSON.stringify({ file, ts: now })}\n\n`;
  for (const res of clients) { try { res.write(payload); } catch (_) {} }
  console.log(`[dev-live] reload -> ${file}`);
}

function watchTree(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const ent of entries) {
    if (ent.name.startsWith('.') && ent.name !== '.well-known') continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      watchTree(abs);
    } else if (WATCH_EXT.has(path.extname(ent.name).toLowerCase())) {
      fs.watchFile(abs, { interval: 300 }, (curr, prev) => {
        if (curr.mtimeMs > prev.mtimeMs) broadcast(path.relative(ROOT, abs).split(path.sep).join('/'));
      });
    }
  }
}

function serveLive(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: hello\ndata: {}\n\n');
  clients.add(res);
  const ka = setInterval(() => { try { res.write(': keepalive\n\n'); } catch (_) {} }, 25000);
  req.on('close', () => { clearInterval(ka); clients.delete(res); });
}

function serveFile(req, res, fp) {
  fs.stat(fp, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found: ' + req.url); }
    const ext = path.extname(fp).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    if (ext === '.html') {
      fs.readFile(fp, 'utf8', (e, body) => {
        if (e) { res.writeHead(500); return res.end('Read error'); }
        const out = body.includes('</body>') ? body.replace('</body>', RELOAD_SNIPPET + '</body>') : body + RELOAD_SNIPPET;
        const buf = Buffer.from(out, 'utf8');
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
        res.end(buf);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(fp).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname || '/');
  if (pathname === '/__live') return serveLive(req, res);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const fp = path.join(ROOT, pathname);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  serveFile(req, res, fp);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev-live] http://localhost:${PORT}/  (root: ${ROOT})`);
  console.log(`[dev-live] open e.g. http://localhost:${PORT}/x-dimensional/`);
  watchTree(ROOT);
  console.log('[dev-live] watching for changes...');
});

process.on('SIGINT', () => { console.log('\n[dev-live] shutting down'); server.close(() => process.exit(0)); });
