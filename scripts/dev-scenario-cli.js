#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

let WebSocket;
try {
  ({ WebSocket } = require('ws'));
} catch (_) {
  ({ WebSocket } = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws')));
}

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'state', 'simulations');

function parseArgs(argv) {
  const out = {
    game: 'fasttrack',
    humans: 2,
    duration: 30,
    tick: 900,
    actionsPerTick: 1,
    ws: process.env.SCENARIO_WS_URL || 'ws://127.0.0.1:8765',
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--game') out.game = String(v || out.game).toLowerCase();
    if (k === '--humans') out.humans = Math.max(2, parseInt(v || String(out.humans), 10));
    if (k === '--duration') out.duration = Math.max(5, parseInt(v || String(out.duration), 10));
    if (k === '--tick') out.tick = Math.max(100, parseInt(v || String(out.tick), 10));
    if (k === '--actions-per-tick') out.actionsPerTick = Math.max(1, parseInt(v || String(out.actionsPerTick), 10));
    if (k === '--ws') out.ws = String(v || out.ws);
  }
  return out;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function makeGuestToken(name) {
  const rand = Math.random().toString(16).slice(2);
  return `guest-${Date.now()}-${name}-${rand}`;
}

function safeName(base, index) {
  return `${base}_${index + 1}`.slice(0, 20);
}

class SimClient {
  constructor(label, wsUrl, transcript) {
    this.label = label;
    this.wsUrl = wsUrl;
    this.ws = null;
    this.user = null;
    this.session = null;
    this._listeners = [];
    this.transcript = transcript;
  }

  log(event, data) {
    const line = { ts: nowIso(), actor: this.label, event, data: data || null };
    this.transcript.push(line);
    console.log(`[${line.ts}] [${this.label}] ${event}` + (data ? ` ${JSON.stringify(data)}` : ''));
  }

  connect(username, avatarId) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.on('open', () => {
        this.log('ws_open', { wsUrl: this.wsUrl });
        this.send({
          type: 'guest_login',
          token: makeGuestToken(this.label),
          username,
          guest_name: username,
          name: username,
          avatar_id: avatarId || 'person_cool',
        });
      });

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(String(raw)); } catch (_) { return; }
        this._listeners.forEach((fn) => fn(msg));

        if (msg.type === 'auth_success') {
          this.user = msg.user || { user_id: msg.user_id, username: msg.username };
          this.log('auth_success', { user_id: this.user.user_id, username: this.user.username });
          resolve(msg);
        }

        if (msg.type === 'session_update' || msg.type === 'session_created' || msg.type === 'session_joined') {
          if (msg.session) this.session = msg.session;
        }
      });

      ws.on('error', (err) => {
        this.log('ws_error', { message: err && err.message ? err.message : String(err) });
      });

      ws.on('close', () => {
        this.log('ws_close');
      });

      setTimeout(() => {
        if (!this.user) reject(new Error(`${this.label} auth timeout`));
      }, 8000);
    });
  }

  onMessage(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((f) => f !== fn);
    };
  }

  waitFor(predicate, timeoutMs, tag) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off();
        reject(new Error(`${this.label} wait timeout: ${tag || 'predicate'}`));
      }, timeoutMs || 8000);

      const off = this.onMessage((msg) => {
        let ok = false;
        try { ok = !!predicate(msg); } catch (_) { ok = false; }
        if (ok) {
          clearTimeout(timeout);
          off();
          resolve(msg);
        }
      });
    });
  }

  send(data) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(data));
  }

  close() {
    try { this.send({ type: 'leave_session' }); } catch (_) { }
    try { this.ws && this.ws.close(); } catch (_) { }
  }
}

async function run() {
  const cfg = parseArgs(process.argv);
  const transcript = [];
  const startedAt = Date.now();

  const clients = [];
  for (let i = 0; i < cfg.humans; i++) {
    const client = new SimClient(`human-${i + 1}`, cfg.ws, transcript);
    clients.push(client);
  }

  try {
    for (let i = 0; i < clients.length; i++) {
      const avatar = i % 2 === 0 ? 'person_smile' : 'person_cool';
      await clients[i].connect(safeName('SimPlayer', i), avatar);
      await delay(80);
    }

    const host = clients[0];
    host.send({
      type: 'create_session',
      game_id: cfg.game,
      private: true,
      max_players: cfg.humans,
      settings: { dev_scenario: true, source: 'dev-scenario-cli' },
    });

    await host.waitFor((m) => m.type === 'session_created' && m.session && m.session.session_code, 8000, 'session_created');
    const code = host.session && host.session.session_code;
    if (!code) throw new Error('Host session code missing.');

    for (let i = 1; i < clients.length; i++) {
      clients[i].send({ type: 'join_by_code', code });
      await clients[i].waitFor((m) => m.type === 'session_joined' || (m.type === 'session_update' && m.session && m.session.session_code === code), 8000, 'session_joined');
    }

    await host.waitFor((m) => m.type === 'session_update' && m.session && Array.isArray(m.session.players) && m.session.players.length >= cfg.humans, 8000, 'all_players_joined');

    for (const c of clients) {
      c.send({ type: 'toggle_ready' });
      await delay(40);
    }

    host.send({ type: 'accept_lobby' });
    await delay(100);
    host.send({ type: 'start_game' });

    await host.waitFor((m) => m.type === 'game_started', 8000, 'game_started');

    const actionKinds = ['sim_step', 'move', 'observe', 'sync'];
    const endAt = Date.now() + cfg.duration * 1000;
    let step = 0;

    while (Date.now() < endAt) {
      step += 1;
      for (let a = 0; a < cfg.actionsPerTick; a++) {
        const actor = clients[(step + a) % clients.length];
        const action = actionKinds[(step + a) % actionKinds.length];
        actor.send({
          type: 'game_action',
          action,
          payload: {
            step,
            actionIndex: a,
            scenario: 'dev-runner',
            game: cfg.game,
            actor: actor.user ? actor.user.username : actor.label,
            t: Date.now(),
          },
        });
      }
      await delay(cfg.tick);
    }

    for (const c of clients) c.close();

    const report = {
      schema: 'kg.dev.scenario/1',
      created_at: nowIso(),
      duration_ms: Date.now() - startedAt,
      config: cfg,
      stats: {
        humans: cfg.humans,
        actions_sent: step * cfg.actionsPerTick,
      },
      transcript,
    };

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const fileName = `sim-${new Date().toISOString().replace(/[.:]/g, '-')}-${cfg.game}.json`;
    const outPath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`\nScenario complete.`);
    console.log(`Saved: ${outPath}`);
    process.exit(0);
  } catch (err) {
    for (const c of clients) c.close();
    console.error(`Scenario failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  }
}

run();
