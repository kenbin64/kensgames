'use strict';
/**
 * Dev launcher: starts the SAME loopback server the Electron desktop build uses,
 * with the SAME injected desktop globals, but with plain Node so it runs without
 * Electron installed. Open the printed URL in a browser to test the desktop build
 * content (the window chrome is the only thing Electron adds on top of this).
 *
 * Run:  node run-fasttrack-desktop.js
 * Stop: Ctrl+C
 */
const path = require('path');
const { startStaticServer } = require('./loopback-server');

const WS_URL = process.env.KG_WS_URL || 'wss://www.kensgames.com/ws';
const cfg = {
  __KG_WS_URL__: WS_URL,
  __KENSGAMES_PLATFORM__: 'desktop',
  __KENSGAMES_WRAPPER__: 'electron',
  __KENSGAMES_GAME__: 'fasttrack',
  __KENSGAMES_VERSION__: '1.0.0',
  __STEAM_AVAILABLE__: false,
};
const inject = '<script>' +
  Object.entries(cfg).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('') +
  '</script>';

const root = path.join(__dirname, '..', '..'); // repo root, same as main.js getAppRoot() in dev

startStaticServer({ root, injectHtml: inject }).then((s) => {
  console.log('FASTTRACK_DESKTOP_URL=' + s.url + '/fasttrack/index.html');
  console.log('serving root: ' + root + '  | relay: ' + WS_URL);
  console.log('(leave this running; Ctrl+C to stop)');
}).catch((e) => { console.error('failed:', e); process.exit(1); });
