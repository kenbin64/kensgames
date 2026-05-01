#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let WebSocketServer;
try {
  ({ WebSocketServer } = require('ws'));
} catch (_) {
  ({ WebSocketServer } = require(path.join(__dirname, 'node_modules', 'ws')));
}

const ROOT = path.join(__dirname, '..');
const WATCH_DIRS = [
  path.join(ROOT, 'fasttrack'),
  path.join(ROOT, 'starfighter'),
  path.join(ROOT, 'brickbreaker3d'),
  path.join(ROOT, 'js'),
  path.join(ROOT, 'server'),
  path.join(ROOT, 'scripts'),
  path.join(ROOT, 'tests'),
  ROOT,
];
const WATCH_EXT = new Set(['.js', '.html', '.css', '.json']);
const PORT = parseInt(process.env.DEV_RUNNER_PORT || '8766', 10);
const BIND_HOST = process.env.DEV_RUNNER_HOST || '127.0.0.1';

if (process.env.NODE_ENV === 'production') {
  console.error('[dev-runner] Refusing to start in production mode.');
  process.exit(1);
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function relPath(absPath) {
  return normalizePath(path.relative(ROOT, absPath));
}

function isWatchable(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!WATCH_EXT.has(ext)) return false;
  const rel = relPath(filePath);
  if (!rel || rel.startsWith('..')) return false;
  if (rel.includes('/node_modules/')) return false;
  if (rel.includes('/.git/')) return false;
  if (rel.startsWith('assets/')) return false;
  if (rel.includes('/assets/')) return false;
  return true;
}

const wss = new WebSocketServer({ port: PORT, host: BIND_HOST });
const runningJobs = new Map();
let lastReloadAt = 0;
let nextJobId = 1;

function send(ws, data) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
  } catch (_) {
    // Ignore broken socket sends
  }
}

function broadcast(data) {
  for (const client of wss.clients) send(client, data);
}

function listScenarioScripts() {
  const dir = path.join(ROOT, 'scripts');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.js') && name.includes('scenario'))
    .sort();
}

function runScenario(payload, ws) {
  const game = String(payload && payload.game || 'fasttrack').toLowerCase();
  const humans = Math.max(2, parseInt(payload && payload.humans || '2', 10));
  const durationSec = Math.max(5, parseInt(payload && payload.durationSec || '30', 10));
  const tickMs = Math.max(100, parseInt(payload && payload.tickMs || '900', 10));
  const actionsPerTick = Math.max(1, parseInt(payload && payload.actionsPerTick || '1', 10));
  const scriptPath = path.join(ROOT, 'scripts', 'dev-scenario-cli.js');

  if (!fs.existsSync(scriptPath)) {
    send(ws, { type: 'job_error', message: 'Scenario CLI not found at scripts/dev-scenario-cli.js' });
    return;
  }

  const jobId = `job-${nextJobId++}`;
  const args = [
    scriptPath,
    '--game', game,
    '--humans', String(humans),
    '--duration', String(durationSec),
    '--tick', String(tickMs),
    '--actions-per-tick', String(actionsPerTick),
  ];

  const child = spawn('node', args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      NODE_ENV: 'development',
      SCENARIO_LIVE: '1',
    }),
  });

  runningJobs.set(jobId, child);
  send(ws, {
    type: 'job_started',
    jobId,
    command: ['node'].concat(args.map((v) => relPath(v).startsWith('..') ? v : relPath(v))).join(' '),
    meta: { game, humans, durationSec, tickMs, actionsPerTick },
  });

  child.stdout.on('data', (buf) => {
    send(ws, { type: 'job_log', jobId, stream: 'stdout', text: String(buf) });
  });
  child.stderr.on('data', (buf) => {
    send(ws, { type: 'job_log', jobId, stream: 'stderr', text: String(buf) });
  });
  child.on('exit', (code, signal) => {
    runningJobs.delete(jobId);
    send(ws, { type: 'job_exit', jobId, code: code == null ? null : code, signal: signal || null });
  });
  child.on('error', (err) => {
    runningJobs.delete(jobId);
    send(ws, { type: 'job_error', jobId, message: err && err.message ? err.message : String(err) });
  });
}

function stopJob(payload, ws) {
  const jobId = payload && payload.jobId ? String(payload.jobId) : '';
  const child = runningJobs.get(jobId);
  if (!child) {
    send(ws, { type: 'job_error', jobId, message: 'Job not found.' });
    return;
  }
  child.kill('SIGTERM');
  send(ws, { type: 'job_stopping', jobId });
}

wss.on('connection', (ws, req) => {
  const remote = req && req.socket ? req.socket.remoteAddress : 'unknown';
  send(ws, {
    type: 'hello',
    role: 'kensgames-dev-runner',
    devOnly: true,
    scenarioScripts: listScenarioScripts(),
    now: Date.now(),
    remote,
  });

  ws.on('message', (raw) => {
    let msg = null;
    try {
      msg = JSON.parse(String(raw));
    } catch (_) {
      send(ws, { type: 'error', message: 'Invalid JSON message.' });
      return;
    }

    if (!msg || typeof msg.type !== 'string') {
      send(ws, { type: 'error', message: 'Message type is required.' });
      return;
    }

    if (msg.type === 'ping') {
      send(ws, { type: 'pong', now: Date.now() });
      return;
    }

    if (msg.type === 'list_scenarios') {
      send(ws, { type: 'scenario_list', scripts: listScenarioScripts() });
      return;
    }

    if (msg.type === 'run_scenario') {
      runScenario(msg, ws);
      return;
    }

    if (msg.type === 'stop_job') {
      stopJob(msg, ws);
      return;
    }

    send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
  });
});

function triggerReload(absFile) {
  const now = Date.now();
  if (now - lastReloadAt < 250) return;
  lastReloadAt = now;
  const file = relPath(absFile);
  const payload = { type: 'file_changed', file, ts: now };
  broadcast(payload);
  broadcast({ type: 'reload', file, ts: now });
  console.log(`[dev-runner] change -> ${file}`);
}

function watchDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'assets') continue;
      watchDir(abs);
      continue;
    }
    if (!isWatchable(abs)) continue;
    fs.watchFile(abs, { interval: 250 }, (curr, prev) => {
      if (curr.mtimeMs > prev.mtimeMs) triggerReload(abs);
    });
  }
}

for (const dir of WATCH_DIRS) watchDir(dir);

console.log(`[dev-runner] websocket control server listening on ws://${BIND_HOST}:${PORT}`);
console.log('[dev-runner] dev-only mode enabled.');
