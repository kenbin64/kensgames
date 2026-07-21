/**
 * FastTrack desktop — loopback static server
 * ButterflyFx / KensGames · Kenneth Bingham
 *
 * Why this exists:
 *   The game pages use absolute web paths (/js, /lib, /assets, /fasttrack) and
 *   navigate page-to-page exactly as they do on kensgames.com, where the web
 *   docroot is the repo root. Loading them with Electron's loadFile() gives a
 *   file:// origin, which breaks every absolute path AND makes the multiplayer
 *   client's _wsUrl() resolve to nothing (location.hostname is empty).
 *
 *   So instead of file://, we serve the repo root over a 127.0.0.1 HTTP server
 *   and point the window at it. Now absolute paths resolve like the live site,
 *   and we inject a fixed relay URL into every HTML page so sockets connect.
 *
 * It serves ONLY from `root`, binds to loopback on an ephemeral port, and has
 * no external surface. No third-party dependencies (Node http/fs only) so the
 * packaged build stays simple.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Insert a snippet of HTML (typically a <script> that sets desktop globals)
 * as early as possible so it runs before any of the page's own scripts.
 */
function injectIntoHtml(html, snippet) {
  if (!snippet) return html;
  const headIdx = html.search(/<head[^>]*>/i);
  if (headIdx !== -1) {
    const insertAt = html.indexOf('>', headIdx) + 1;
    return html.slice(0, insertAt) + snippet + html.slice(insertAt);
  }
  // No <head> (unusual) — fall back to prepending.
  return snippet + html;
}

/**
 * Resolve a request URL path to an absolute file path inside `root`,
 * rejecting any path that escapes the root (directory traversal).
 */
function resolveSafePath(root, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch (_) { return null; }
  decoded = decoded.split('?')[0].split('#')[0];
  if (decoded.endsWith('/')) decoded += 'index.html';
  const resolved = path.normalize(path.join(root, decoded));
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    return null; // escaped the docroot
  }
  return resolved;
}

/**
 * Start the loopback server.
 * @param {object} opts
 * @param {string} opts.root        Absolute docroot (the repo root).
 * @param {string} [opts.injectHtml] HTML snippet injected into every .html page.
 * @returns {Promise<{url:string, port:number, close:()=>void}>}
 */
function startStaticServer(opts) {
  const root = path.resolve(opts.root);
  const injectHtml = opts.injectHtml || '';

  const server = http.createServer((req, res) => {
    let pathname = '/';
    try { pathname = new URL(req.url, 'http://127.0.0.1').pathname; } catch (_) { pathname = req.url; }

    let filePath = resolveSafePath(root, pathname);
    if (!filePath) { res.writeHead(403); res.end('Forbidden'); return; }

    fs.stat(filePath, (err, stat) => {
      if (err || (stat.isDirectory() && !filePath.endsWith('index.html'))) {
        if (stat && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
        else { res.writeHead(404); res.end('Not found'); return; }
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      // injectHtml may be a function (pathname) => snippet, so the injected
      // globals (e.g. the current login token) can change between navigations
      // without restarting the server.
      const snippet = (typeof injectHtml === 'function') ? injectHtml(pathname) : injectHtml;

      if (ext === '.html' && snippet) {
        fs.readFile(filePath, 'utf8', (rErr, html) => {
          if (rErr) { res.writeHead(404); res.end('Not found'); return; }
          const out = injectIntoHtml(html, snippet);
          res.writeHead(200, { 'Content-Type': type });
          res.end(out);
        });
        return;
      }

      res.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(filePath)
        .on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); })
        .pipe(res);
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    // Port 0 → OS assigns a free ephemeral port. Loopback only.
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () => { try { server.close(); } catch (_) { /* ignore */ } },
      });
    });
  });
}

module.exports = { startStaticServer };
