const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8766 });

let lastReload = 0;
function triggerReload(file) {
  if (Date.now() - lastReload < 500) return; // Debounce
  lastReload = Date.now();
  console.log(`[Watcher] File changed: ${file}. Emitting reload...`);
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send('reload');
  });
}

function watchDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(ent => {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name !== 'node_modules' && ent.name !== '.git' && ent.name !== 'assets') {
        watchDir(p);
      }
    } else if (p.endsWith('.js') || p.endsWith('.html') || p.endsWith('.css')) {
      fs.watchFile(p, { interval: 500 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) triggerReload(p);
      });
    }
  });
}

const root = path.join(__dirname, '..');
watchDir(path.join(root, 'fasttrack'));
watchDir(path.join(root, 'starfighter'));
watchDir(path.join(root, 'js'));
watchDir(path.join(root, 'brickbreaker3d'));

console.log('[Watcher] Dev-monitor WebSocket server running on ws://localhost:8766');
