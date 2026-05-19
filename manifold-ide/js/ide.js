// manifold-ide/js/ide.js
// Manifold IDE main controller.
// Reuses manifold-ai's engines, dimensional paradigm, and code-agent transports.

import { createEngine, parseManifoldOutput } from '../../manifold-ai/js/engine.js';
import { SUBSTRATES, routeSubstrate } from '../../manifold-ai/js/substrates.js';
import { VOID, ladderPosition, FIB, PHI } from '../../manifold-ai/js/dimensional.js';
import {
  ToolRegistry, SandboxTransport,
  FolderTransport, MCPTransport
} from '../../manifold-ai/js/code-agent.js';
import { Runner } from './runner.js';
import { DimensionalDebugger } from './debugger.js';

const MONACO_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs';

const $ = (s, r = document) => r.querySelector(s);
const ui = {
  filePath: $('#filePath'),
  langSelect: $('#langSelect'),
  engineSelect: $('#engineSelect'),
  runBtn: $('#runBtn'),
  debugBtn: $('#debugBtn'),
  deployBtn: $('#deployBtn'),
  folderBtn: $('#grantFolderBtn'),
  mcpBtn: $('#connectMcpBtn'),
  dimIndicator: $('#dimIndicator'),
  newFileBtn: $('#newFileBtn'),
  scopeRoot: $('#scopeRoot'),
  allowAllBtn: $('#allowAllBtn'),
  deployList: $('#deployList'),
  addDeployBtn: $('#addDeployBtn'),
  tree: $('#tree'),
  tabBar: $('#tabBar'),
  tabsList: $('#tabsList'),
  editorHost: $('#editorHost'),
  bottom: $('#bottom'),
  paneConsole: $('#paneConsole'),
  paneDebug: $('#paneDebug'),
  paneManifold: $('#paneManifold'),
  clearConsole: $('#clearConsoleBtn'),
  bottomToggle: $('#bottomToggle'),
  aiPage: $('#aiPage'),
  aiPrevBtn: $('#aiPrevBtn'),
  aiNextBtn: $('#aiNextBtn'),
  aiLatestBtn: $('#aiLatestBtn'),
  aiPageInd: $('#aiPageIndicator'),
  aiProgress: $('#aiProgress'),
  aiPrompt: $('#aiPrompt'),
  aiForm: $('#aiForm'),
  aiStatus: $('#aiStatus'),
  toolList: $('#toolList'),
  ideStatus: $('#ideStatus'),
  cursorPos: $('#cursorPos'),
};

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────
const state = {
  // Editor
  monaco: null,
  editor: null,
  models: new Map(),         // path → monaco.ITextModel
  active: null,              // current path
  dirty: new Set(),

  // Files / tree
  folder: new FolderTransport(),
  tree: null,                // { name, kind:'dir'|'file', children?, handle? }

  // AI
  reg: new ToolRegistry(),
  sandbox: new SandboxTransport(),
  mcp: new MCPTransport(),
  instant: createEngine('deterministic'),
  engine: null,
  enginePromise: null,
  preferred: 'auto',
  lastPoint: VOID,
  history: [],
  pages: [],          // [{ role, text, opts, msgEl? }]
  pageIndex: -1,
  pinLatest: true,    // auto-jump to newest unless user navigates away

  // Run / debug
  runner: new Runner(),
  debugger: null,
  bottomPane: 'console',

  // Project dim level
  fileCount: 0,

  // Allowed deploy targets (per root). Cleared on root switch.
  deployAllow: new Set(),
};
state.sandbox.register(state.reg);
state.debugger = new DimensionalDebugger(state.runner, () => { });
await state.instant.init(() => { });

refreshTools();
updateDim();

// ────────────────────────────────────────────────────────────
// Monaco loader
// ────────────────────────────────────────────────────────────
async function loadMonaco() {
  if (state.monaco) return state.monaco;
  setStatus('loading editor…', 'loading');
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${MONACO_BASE}/loader.js`;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  await new Promise((resolve) => {
    window.require.config({ paths: { vs: MONACO_BASE } });
    // Worker shim for cross-origin Monaco workers.
    window.MonacoEnvironment = {
      getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`
        self.MonacoEnvironment = { baseUrl: '${MONACO_BASE}/' };
        importScripts('${MONACO_BASE}/base/worker/workerMain.js');`)}`
    };
    window.require(['vs/editor/editor.main'], () => resolve());
  });
  state.monaco = window.monaco;
  defineTheme(state.monaco);
  setStatus('editor ready');
  return state.monaco;
}

function defineTheme(monaco) {
  monaco.editor.defineTheme('manifold-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5b6a85', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7df9ff' },
      { token: 'string', foreground: 'ffd9a8' },
      { token: 'number', foreground: 'b07dff' },
    ],
    colors: {
      'editor.background': '#05060a',
      'editor.foreground': '#e8eef8',
      'editorLineNumber.foreground': '#3a4660',
      'editorLineNumber.activeForeground': '#7df9ff',
      'editorCursor.foreground': '#7df9ff',
      'editor.selectionBackground': '#2a3850',
      'editor.lineHighlightBackground': '#0a0e16',
      'editorIndentGuide.background': '#1a2030',
    }
  });
}

// ────────────────────────────────────────────────────────────
// Editor lifecycle
// ────────────────────────────────────────────────────────────
async function openFile(path, content, lang) {
  await loadMonaco();
  if (!state.editor) {
    state.editor = state.monaco.editor.create(ui.editorHost, {
      value: '', language: lang || 'javascript',
      theme: 'manifold-dark', fontSize: 13.5,
      minimap: { enabled: false }, automaticLayout: true,
      scrollBeyondLastLine: false, smoothScrolling: true,
      tabSize: 2, wordWrap: 'on', renderWhitespace: 'selection',
    });
    state.editor.onDidChangeCursorPosition((e) => {
      ui.cursorPos.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });
    state.editor.onDidChangeModelContent(() => {
      if (state.active) state.dirty.add(state.active);
      renderTabs();
    });
    bindShortcuts();
  }

  let model = state.models.get(path);
  if (!model) {
    const guessed = lang || guessLang(path);
    model = state.monaco.editor.createModel(content || '', guessed,
      state.monaco.Uri.parse(`inmemory:///${path}`));
    state.models.set(path, model);
  } else if (content != null && content !== model.getValue()) {
    model.setValue(content);
  }

  state.editor.setModel(model);
  state.active = path;
  ui.filePath.textContent = path;
  ui.langSelect.value = model.getLanguageId();
  state.dirty.delete(path);
  renderTabs();
  state.fileCount = state.models.size;
  updateDim();
}

function closeFile(path) {
  const model = state.models.get(path);
  if (model) model.dispose();
  state.models.delete(path);
  state.dirty.delete(path);
  if (state.active === path) {
    const next = [...state.models.keys()][0];
    if (next) openFile(next);
    else { state.editor?.setModel(null); state.active = null; ui.filePath.textContent = 'untitled'; }
  }
  renderTabs();
}

function guessLang(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return ({
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
    py: 'python', html: 'html', htm: 'html', css: 'css',
    json: 'json', md: 'markdown', rs: 'rust', go: 'go',
    sh: 'shell', bash: 'shell', yml: 'yaml', yaml: 'yaml'
  })[ext] || 'plaintext';
}

// Inverse: language id → default extension.
function extForLang(lang) {
  return ({
    javascript: 'js', typescript: 'ts', python: 'py',
    html: 'html', css: 'css', json: 'json', markdown: 'md',
    rust: 'rs', go: 'go', shell: 'sh', yaml: 'yml', plaintext: 'txt'
  })[lang] || 'txt';
}

function renderTabs() {
  ui.tabBar.innerHTML = '';
  ui.tabsList.innerHTML = '';
  for (const path of state.models.keys()) {
    const tab = document.createElement('div');
    tab.className = 'tab' + (path === state.active ? ' active' : '') +
      (state.dirty.has(path) ? ' dirty' : '');
    const label = document.createElement('span');
    label.textContent = path.split('/').pop();
    label.title = path;
    label.onclick = () => openFile(path);
    const x = document.createElement('span');
    x.className = 'x'; x.textContent = '✕';
    x.onclick = (e) => { e.stopPropagation(); closeFile(path); };
    tab.append(label, x);
    ui.tabBar.appendChild(tab);

    const li = document.createElement('div');
    li.className = 'tl-item' + (path === state.active ? ' active' : '');
    li.innerHTML = `<span>${path.split('/').pop()}</span>` +
      `<span class="tl-close">${state.dirty.has(path) ? '●' : '✕'}</span>`;
    li.onclick = () => openFile(path);
    li.querySelector('.tl-close').onclick = (e) => { e.stopPropagation(); closeFile(path); };
    ui.tabsList.appendChild(li);
  }
}

// ────────────────────────────────────────────────────────────
// Folder tree
// ────────────────────────────────────────────────────────────
async function buildTree(handle, path = '') {
  const node = { name: handle.name, kind: 'dir', handle, path: path || handle.name, children: [] };
  for await (const [name, child] of handle.entries()) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const childPath = `${node.path}/${name}`;
    if (child.kind === 'directory') {
      node.children.push(await buildTree(child, childPath));
    } else {
      node.children.push({ name, kind: 'file', handle: child, path: childPath });
    }
  }
  node.children.sort((a, b) =>
    (a.kind === b.kind) ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1);
  return node;
}

function renderTree() {
  ui.tree.innerHTML = '';
  if (!state.tree) {
    ui.tree.innerHTML = '<div class="tree-empty">no folder granted<br><small>click 📁 folder above</small></div>';
    return;
  }
  ui.tree.appendChild(renderTreeNode(state.tree, true));
}

function renderTreeNode(node, isRoot = false) {
  const wrap = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'tree-node ' + node.kind;
  if (state.active === node.path) row.classList.add('active');
  const ico = document.createElement('span');
  ico.className = 'ico';
  ico.textContent = node.kind === 'dir' ? '▸' : '·';
  const lbl = document.createElement('span');
  lbl.textContent = node.name;
  row.append(ico, lbl);
  wrap.appendChild(row);

  if (node.kind === 'dir') {
    const children = document.createElement('div');
    children.className = 'tree-children';
    if (!isRoot) children.style.display = 'none';
    node.children.forEach(c => children.appendChild(renderTreeNode(c, false)));
    wrap.appendChild(children);
    row.onclick = () => {
      const open = children.style.display !== 'none';
      children.style.display = open ? 'none' : '';
      ico.textContent = open ? '▸' : '▾';
    };
    if (isRoot) ico.textContent = '▾';
  } else {
    row.onclick = async () => {
      try {
        const file = await node.handle.getFile();
        const text = await file.text();
        await openFile(node.path, text, guessLang(node.path));
        renderTree();
      } catch (e) { setStatus(`open failed: ${e.message}`, 'error'); }
    };
  }
  return wrap;
}

// ────────────────────────────────────────────────────────────
// Console / debug pane
// ────────────────────────────────────────────────────────────
function logTo(pane, level, text) {
  const el = pane === 'debug' ? ui.paneDebug : pane === 'manifold' ? ui.paneManifold : ui.paneConsole;
  const span = document.createElement('span');
  span.className = level || '';
  span.textContent = text + '\n';
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
  showBottom();
}
function clearPane(pane) {
  const el = pane === 'debug' ? ui.paneDebug : pane === 'manifold' ? ui.paneManifold : ui.paneConsole;
  el.innerHTML = '';
}
function setBottomPane(name) {
  state.bottomPane = name;
  document.querySelectorAll('.bt-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.pane === name));
  document.querySelectorAll('.pane').forEach(p =>
    p.classList.toggle('active', p.classList.contains('pane-' + name)));
}
function showBottom() { ui.bottom.classList.remove('collapsed'); ui.bottomToggle.textContent = '▾'; }
function toggleBottom() {
  ui.bottom.classList.toggle('collapsed');
  ui.bottomToggle.textContent = ui.bottom.classList.contains('collapsed') ? '▴' : '▾';
}

document.querySelectorAll('.bt-tab').forEach(b =>
  b.onclick = () => { setBottomPane(b.dataset.pane); showBottom(); });
ui.clearConsole.onclick = () => clearPane(state.bottomPane);
ui.bottomToggle.onclick = toggleBottom;

// ────────────────────────────────────────────────────────────
// Run / Debug / Deploy
// ────────────────────────────────────────────────────────────
async function runActive() {
  if (!state.editor) return;
  const code = state.editor.getValue();
  const lang = state.editor.getModel().getLanguageId();
  if (!state.runner.supports(lang)) {
    logTo('console', 'warn', `no in-browser runner for ${lang}`);
    return;
  }
  setBottomPane('console'); clearPane('console');
  logTo('console', 'acc', `▶ run · ${lang} · ${state.active || 'untitled'}`);
  setStatus('running…', 'loading');
  const onLog = (level, text) => logTo('console', level, text);
  const result = await state.runner.run(lang, code, onLog);
  if (result.ok) {
    logTo('console', 'ok', `✓ done in ${result.ms} ms`);
    if (result.result !== undefined) logTo('console', 'dim', `   return: ${result.result}`);
    setStatus(`ran in ${result.ms} ms`);
  } else {
    logTo('console', 'err', `✗ ${result.error}`);
    setStatus(`run error`, 'error');
  }
}

async function debugActive() {
  if (!state.editor) return;
  const code = state.editor.getValue();
  const lang = state.editor.getModel().getLanguageId();
  if (!state.runner.supports(lang)) {
    logTo('debug', 'warn', `no debugger for ${lang}`);
    return;
  }
  setBottomPane('debug'); clearPane('debug');
  setStatus('debugging…', 'loading');
  const onLog = (level, text) => logTo('debug', level, text);
  const result = await state.debugger.debug(lang, code, onLog);
  setStatus(result.ok ? `debug · ${result.steps} steps · finalZ=${result.finalZ.toFixed(3)}`
    : 'debug error', result.ok ? '' : 'error');
}

async function deployActive() {
  if (!state.mcp || !state.mcp.ws || state.mcp.ws.readyState !== 1) {
    setStatus('connect MCP first', 'error');
    setBottomPane('console');
    logTo('console', 'warn', '☁ deploy requires an MCP bridge. Click 🔌 MCP to connect.');
    return;
  }
  if (!state.active) { setStatus('open a file first', 'error'); return; }
  const code = state.editor.getValue();

  // Pick a target. Default to last-used, else the active file path.
  const suggested = state.lastDeployTarget || state.active;
  const target = window.prompt(
    `Deploy target on the MCP bridge.\n\n` +
    `Only targets you approve here are allowed — the AI cannot deploy anywhere else.\n` +
    `Switching roots clears this allowlist.`,
    suggested
  );
  if (!target) return;

  // Enforce allowlist. First use of a target prompts to remember it.
  if (!state.deployAllow.has(target)) {
    const ok = window.confirm(
      `"${target}" is not in your deploy allowlist.\n\n` +
      `Approve this target and remember it for the current root?\n` +
      `(Approved targets appear in DEPLOY TARGETS in the explorer.)`
    );
    if (!ok) { setStatus('deploy cancelled', 'error'); return; }
    state.deployAllow.add(target);
    renderDeployList();
  }
  state.lastDeployTarget = target;

  setBottomPane('console');
  logTo('console', 'acc', `☁ deploy · ${target} via MCP`);
  setStatus('deploying…', 'loading');
  try {
    const r = await state.reg.call('mcp_call', {
      server: 'deploy', method: 'deploy_file',
      params: { path: target, content: code, lang: state.editor.getModel().getLanguageId() }
    });
    logTo('console', 'ok', `✓ deployed: ${JSON.stringify(r)}`);
    setStatus('deployed');
  } catch (e) {
    logTo('console', 'err', `✗ deploy failed: ${e.message || e}`);
    setStatus('deploy failed', 'error');
  }
}

// ────────────────────────────────────────────────────────────
// AI panel
// ────────────────────────────────────────────────────────────
function pickAutoEngine() { return ('gpu' in navigator) ? 'webllm' : 'transformers'; }

function ensureEngine(onProgress) {
  if (state.enginePromise) {
    if (onProgress && state.lastProgress) onProgress(state.lastProgress);
    if (onProgress) state.progressSubs.add(onProgress);
    return state.enginePromise;
  }
  state.progressSubs = new Set();
  if (onProgress) state.progressSubs.add(onProgress);
  const kind = state.preferred === 'auto' ? pickAutoEngine() : state.preferred;
  state.engineKind = kind;
  state.engine = createEngine(kind);
  ui.aiStatus.textContent = `loading ${kind}…`;
  const fanout = (p) => {
    state.lastProgress = p;
    state.progressSubs.forEach(cb => { try { cb(p); } catch (_) { } });
  };
  state.enginePromise = state.engine.init(fanout).then(() => {
    ui.aiStatus.textContent = `${kind} ready`;
    state.lastProgress = { stage: 'ready', percent: 1, label: 'ready' };
    state.progressSubs.forEach(cb => { try { cb(state.lastProgress); } catch (_) { } });
  }).catch((e) => {
    ui.aiStatus.textContent = `${kind} failed → deterministic`;
    state.preferred = 'deterministic';
    state.engine = state.instant;
    throw e;
  });
  return state.enginePromise;
}

function buildMessageElement(role, text, opts = {}) {
  const div = document.createElement('div');
  div.className = `ai-msg ${role}` + (opts.provisional ? ' provisional' : '');
  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = text;
  div.appendChild(body);
  if (opts.meta) {
    const m = document.createElement('div');
    m.className = 'meta';
    m.textContent = opts.meta;
    div.appendChild(m);
  }
  if (opts.patch) {
    const actions = document.createElement('div');
    actions.className = 'patch-actions';
    const apply = document.createElement('button');
    apply.className = 'patch-btn';
    apply.textContent = '↳ apply patch';
    apply.onclick = () => applyPatch(opts.patch);
    actions.appendChild(apply);
    div.appendChild(actions);
  }
  return { container: div, body };
}

function aiAddMessage(role, text, opts = {}) {
  const { container, body } = buildMessageElement(role, text, opts);
  const page = { role, text, opts, container, body };
  state.pages.push(page);
  if (state.pinLatest || state.pageIndex === state.pages.length - 2) {
    state.pageIndex = state.pages.length - 1;
  }
  renderPage();
  return page;
}

function updateMessage(page, text, opts = {}) {
  if (!page) return;
  page.text = text;
  if (opts && Object.keys(opts).length) page.opts = { ...page.opts, ...opts };
  // Rebuild element in place if it's the visible page; otherwise just update data.
  const fresh = buildMessageElement(page.role, page.text, page.opts);
  page.container.replaceWith(fresh.container);
  page.container = fresh.container;
  page.body = fresh.body;
  if (state.pages[state.pageIndex] === page) renderPage();
}

function renderPage() {
  const total = state.pages.length;
  ui.aiPage.innerHTML = '';
  if (total === 0) {
    ui.aiPage.classList.add('ai-page-empty');
    const hint = document.createElement('div');
    hint.className = 'ai-empty-hint';
    hint.textContent = 'No messages yet — ask the manifold below.';
    ui.aiPage.appendChild(hint);
  } else {
    ui.aiPage.classList.remove('ai-page-empty');
    const idx = Math.max(0, Math.min(state.pageIndex, total - 1));
    state.pageIndex = idx;
    const page = state.pages[idx];
    ui.aiPage.appendChild(page.container);
    ui.aiPage.scrollTop = 0;
  }
  ui.aiPageInd.textContent = total === 0 ? '0 / 0' : `${state.pageIndex + 1} / ${total}`;
  ui.aiPrevBtn.disabled = state.pageIndex <= 0;
  ui.aiNextBtn.disabled = state.pageIndex >= total - 1;
  ui.aiLatestBtn.disabled = state.pinLatest && state.pageIndex === total - 1;
}

function gotoPage(idx) {
  if (!state.pages.length) return;
  state.pageIndex = Math.max(0, Math.min(idx, state.pages.length - 1));
  state.pinLatest = state.pageIndex === state.pages.length - 1;
  renderPage();
}

ui.aiPrevBtn.onclick = () => gotoPage(state.pageIndex - 1);
ui.aiNextBtn.onclick = () => gotoPage(state.pageIndex + 1);
ui.aiLatestBtn.onclick = () => { state.pinLatest = true; gotoPage(state.pages.length - 1); };

function applyPatch(text) {
  if (!state.editor) return;
  const m = text.match(/```[\w-]*\n([\s\S]+?)\n```/);
  const newCode = m ? m[1] : text;
  const oldCode = state.editor.getValue();
  const delta = newCode.length - oldCode.length;
  const ok = window.confirm(
    `Apply patch to ${state.active || 'editor'}?\n\n` +
    `Old: ${oldCode.length} chars\nNew: ${newCode.length} chars (${delta >= 0 ? '+' : ''}${delta})\n\n` +
    `This only changes the in-editor buffer — nothing is written to disk until you save (Ctrl+S).`
  );
  if (!ok) { setStatus('patch declined'); return; }
  state.editor.setValue(newCode);
  if (state.active) state.dirty.add(state.active);
  renderTabs();
  setStatus('patch applied (unsaved)');
}

function metaLine(point, sub) {
  const ladder = point.ladder || ladderPosition((point.step || 1) - 1);
  const yScalar = (typeof point.yScalar === 'number') ? point.yScalar : 0;
  const dimL = `dim ${ladder.dim} (${ladder.label}, F=${ladder.rung}) · φ=${ladder.spiral.toFixed(3)}`;
  const core = sub.canonical
    ? `x=${(+point.x).toFixed(3)} · ∏y=${yScalar.toFixed(3)} · z=${(+point.z).toFixed(3)} · z=xy ✓`
    : `x=${(+point.x).toFixed(3)} · ∏y=${yScalar.toFixed(3)} · ${sub.id} lens=${(+point.lens_value).toFixed(3)}`;
  return `${sub.glyph} ${sub.id} · ${dimL}\n${core}`;
}

async function askAI(query) {
  const q = String(query || '').trim();
  if (!q) return;
  ui.aiPrompt.value = '';

  // Pull context from editor.
  const ctx = state.editor ? buildCodeContext() : '';
  const fullQuery = ctx ? `${q}\n\n--- code context ---\n${ctx}` : q;

  aiAddMessage('user', q);
  state.history.push({ role: 'user', content: fullQuery });

  const route = routeSubstrate(fullQuery);
  // Instant first.
  let asMsg = aiAddMessage('assistant', '…', { provisional: true });
  try {
    const raw = await state.instant.generate(state.history,
      { substrate: route.substrate, prior: state.lastPoint });
    const point = parseManifoldOutput(raw, route.substrate, state.lastPoint);
    updateMessage(asMsg, point.answer || '(no answer)', {
      provisional: true,
      meta: metaLine(point, route.substrate)
    });
    state.lastPoint = point;
  } catch (_) { }

  // Upgrade if not deterministic.
  const wantedKind = state.preferred === 'auto' ? pickAutoEngine() : state.preferred;
  if (wantedKind === 'deterministic') return;

  ui.aiProgress.classList.remove('hidden');
  const uText = ui.aiProgress.querySelector('.u-text');
  const uPct = ui.aiProgress.querySelector('.u-pct');
  const uFill = ui.aiProgress.querySelector('.upgrade-fill');
  const onProg = (p) => {
    const pct = Math.round((p.percent || 0) * 100);
    uText.textContent = p.label || 'loading';
    uPct.textContent = pct + '%';
    uFill.style.width = pct + '%';
  };

  try { await ensureEngine(onProg); }
  catch (e) {
    ui.aiProgress.classList.add('hidden');
    aiAddMessage('assistant', `model unavailable (${e.message || e}). Showing instant answer.`);
    return;
  }
  ui.aiProgress.classList.add('hidden');

  let raw;
  try {
    raw = await state.engine.generate(state.history,
      { substrate: route.substrate, prior: state.lastPoint });
  }
  catch (e) { aiAddMessage('assistant', `model error: ${e.message || e}`); return; }

  const point = parseManifoldOutput(raw, route.substrate, state.lastPoint);
  state.history.push({ role: 'assistant', content: raw });
  state.lastPoint = point;

  const newMsg = aiAddMessage('assistant', point.answer || '(no answer)',
    {
      meta: metaLine(point, route.substrate),
      patch: looksLikePatch(point.answer) ? point.answer : null
    });

  // Run any tool calls.
  if (Array.isArray(point.tool_calls)) {
    for (const tc of point.tool_calls) {
      try {
        const r = await state.reg.call(tc.name, tc.arguments);
        aiAddMessage('assistant', `↳ ${tc.name}: ${JSON.stringify(r).slice(0, 400)}`,
          { meta: 'tool result' });
      } catch (e) {
        aiAddMessage('assistant', `↳ ${tc.name} failed: ${e.message || e}`);
      }
    }
  }
}

function makeMeta(text) {
  const m = document.createElement('div');
  m.className = 'meta';
  m.textContent = text;
  return m;
}

function looksLikePatch(text) {
  return text && /```[\w-]*\n[\s\S]+?\n```/.test(text);
}

function buildCodeContext() {
  const code = state.editor.getValue();
  const lang = state.editor.getModel().getLanguageId();
  const path = state.active || 'untitled';
  const cap = code.length > 4000 ? code.slice(0, 4000) + '\n…[truncated]' : code;
  return `file: ${path}\nlang: ${lang}\n\`\`\`${lang}\n${cap}\n\`\`\``;
}

// AI shortcuts
document.querySelectorAll('.ai-chip').forEach(b => b.onclick = () => {
  const action = b.dataset.action;
  const map = {
    explain: 'Explain this code in plain language. Note key dimensions (data flow, side effects, complexity).',
    refactor: 'Refactor this code for clarity. Return a complete updated file in a fenced code block.',
    fix: 'Find and fix bugs in this code. Return the corrected file in a fenced code block.',
    test: 'Write unit tests for this code. Return a complete test file in a fenced code block.',
  };
  ui.aiPrompt.value = map[action] || '';
  ui.aiPrompt.focus();
});

ui.aiForm.addEventListener('submit', (e) => { e.preventDefault(); askAI(ui.aiPrompt.value); });
ui.aiPrompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ui.aiForm.requestSubmit(); }
});

// ────────────────────────────────────────────────────────────
// Header controls
// ────────────────────────────────────────────────────────────
ui.langSelect.onchange = () => {
  if (state.editor && state.monaco) {
    state.monaco.editor.setModelLanguage(state.editor.getModel(), ui.langSelect.value);
  }
};
ui.engineSelect.onchange = () => {
  state.preferred = ui.engineSelect.value;
  state.enginePromise = null;
  ui.aiStatus.textContent = `engine: ${state.preferred}`;
};
ui.runBtn.onclick = runActive;
ui.debugBtn.onclick = debugActive;
ui.deployBtn.onclick = deployActive;

ui.folderBtn.onclick = async () => {
  try {
    const name = await state.folder.grant();   // also resets autoAllow via FolderTransport
    state.folder.register(state.reg);
    refreshTools();
    state.tree = await buildTree(state.folder.root);
    renderTree();
    // Switching roots = new focus. Reset deploy allowlist + UI toggle.
    state.deployAllow = new Set();
    renderDeployList();
    updateScopeUI();
    setStatus(`scope → ${name}`);
  } catch (e) { setStatus(`folder failed: ${e.message}`, 'error'); }
};

ui.mcpBtn.onclick = async () => {
  // If already connected, offer to disconnect.
  if (state.mcp.connected && state.mcp.connected()) {
    const ok = window.confirm(
      `MCP connected to:\n  ${state.mcp.url}\n` +
      (state.mcp.serverInfo ? `Server: ${state.mcp.serverInfo.name} ${state.mcp.serverInfo.version || ''}\n` : '') +
      `Tools: ${state.mcp.tools.length}\n\nDisconnect?`
    );
    if (ok) {
      state.mcp.disconnect();
      setStatus('MCP disconnected');
      refreshTools();
    }
    return;
  }
  const url = window.prompt(
    'MCP bridge WebSocket URL.\n\n' +
    'Examples:\n' +
    '  ws://localhost:8765\n' +
    '  wss://my-bridge.example.com/mcp\n\n' +
    'Start a bridge first (e.g. `npx @modelcontextprotocol/server-filesystem` ' +
    'behind a WS adapter, or any custom JSON-RPC 2.0 server).',
    sessionStorage.getItem('mcp.url') || 'ws://localhost:8765'
  );
  if (!url) return;
  // Token is optional; many local bridges run unauthenticated. With a
  // token the AI gets whatever reach the bridge grants that credential.
  const tokenIn = window.prompt(
    `Bearer token for ${url} (leave blank for none).\n\n` +
    `Sent two ways the server can accept:\n` +
    `  • WebSocket subprotocol  bearer.<token>\n` +
    `  • Query param            ?access_token=<token>\n\n` +
    `Stored in sessionStorage only — cleared when this tab closes.`,
    sessionStorage.getItem('mcp.token') || ''
  );
  const token = tokenIn ? tokenIn.trim() : '';
  setStatus('MCP connecting…', 'loading');
  try {
    const info = await state.mcp.connect(url, token ? { token } : {});
    state.mcp.register(state.reg);
    state.mcp.onToolsChanged = () => refreshTools();
    sessionStorage.setItem('mcp.url', url);
    if (token) sessionStorage.setItem('mcp.token', token);
    else sessionStorage.removeItem('mcp.token');
    refreshTools();
    const sname = info?.server?.name ? ` · ${info.server.name}` : '';
    const tcount = info?.tools?.length || 0;
    setStatus(`MCP: ${url}${sname} · ${tcount} tools${token ? ' · auth' : ''}`);
    setBottomPane('console');
    logTo('console', 'ok', `🔌 MCP connected${sname} — ${tcount} tools available${token ? ' (authenticated)' : ' (no auth)'}`);
    if (tcount) {
      logTo('console', 'acc', info.tools.map(t => `  • ${t.name}${t.description ? ' — ' + t.description : ''}`).join('\n'));
    }
  } catch (e) {
    setStatus(`MCP failed: ${e.message}`, 'error');
    setBottomPane('console');
    logTo('console', 'err', `🔌 MCP connect failed: ${e.message}`);
  }
};

// New file uses the language dropdown for the extension. Stays in-root if granted.
ui.newFileBtn.onclick = async () => {
  const lang = ui.langSelect.value;
  const ext = extForLang(lang);
  const def = state.folder.root ? `new-file.${ext}` : `untitled.${ext}`;
  const name = window.prompt(
    `New ${lang} file (relative path, no '..' or leading '/')` +
    (state.folder.root ? `\nRoot: ${state.folder.root.name}` : `\n(no folder granted — file lives in memory only)`),
    def
  );
  if (!name) return;
  if (state.folder.root && (/^[\\/]|(^|[\\/])\.\.([\\/]|$)/.test(name))) {
    setStatus('rejected: path must stay within root', 'error');
    return;
  }
  const fullPath = state.folder.root ? `${state.folder.root.name}/${name}` : name;
  await openFile(fullPath, '', lang);
  state.dirty.add(fullPath);
  renderTabs();
};

// ── Scope (root) controls ─────────────────────────────────
state.folder.onScopeChange = (rootName) => {
  state.deployAllow = new Set();
  renderDeployList();
  updateScopeUI();
};

function updateScopeUI() {
  const root = state.folder.root;
  if (root) {
    ui.scopeRoot.textContent = root.name;
    ui.scopeRoot.classList.remove('none');
  } else {
    ui.scopeRoot.textContent = '(no root — writes disabled)';
    ui.scopeRoot.classList.add('none');
  }
  const on = !!state.folder.autoAllowWrites;
  ui.allowAllBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  ui.allowAllBtn.textContent = on ? '🔓 allow all in root' : '🔒 confirm each';
  ui.allowAllBtn.title = on
    ? `AI writes within ${root ? root.name : 'root'} skip per-write confirms. Click to require confirms again.`
    : 'Every AI write asks first. Click to trust this root.';
}

ui.allowAllBtn.onclick = () => {
  if (!state.folder.root) {
    setStatus('grant a folder first', 'error');
    return;
  }
  const next = !state.folder.autoAllowWrites;
  if (next) {
    const ok = window.confirm(
      `Allow Manifold AI to write any file within "${state.folder.root.name}" without asking each time?\n\n` +
      `Writes outside this root are still blocked.\n` +
      `This resets if you switch roots.`
    );
    if (!ok) return;
  }
  state.folder.setAutoAllow(next);
  updateScopeUI();
  setStatus(next ? `trust: all writes in ${state.folder.root.name}` : `trust: confirm each write`);
};

// ── Deploy targets allowlist ──────────────────────────────
ui.addDeployBtn.onclick = () => addDeployTarget();

function addDeployTarget(prefill) {
  const target = window.prompt(
    'Add an allowed deploy target.\n' +
    'Examples:\n  ./public/index.html\n  www-data@host:/var/www/site/index.html\n  vhost:kensgames.com/manifold-ide/index.html',
    prefill || ''
  );
  if (!target) return;
  state.deployAllow.add(target);
  renderDeployList();
  setStatus(`deploy target added: ${target}`);
}

function renderDeployList() {
  ui.deployList.innerHTML = '';
  if (state.deployAllow.size === 0) {
    ui.deployList.innerHTML = '<div class="tree-empty"><small>no targets · ☁ deploy will ask first</small></div>';
    return;
  }
  for (const t of state.deployAllow) {
    const row = document.createElement('div');
    row.className = 'dp-item';
    row.innerHTML = `<span class="dp-ico">☁</span><span class="dp-path" title="${t}">${t}</span><span class="dp-rm" title="remove">✕</span>`;
    row.querySelector('.dp-path').onclick = () => { state.lastDeployTarget = t; setStatus(`deploy default → ${t}`); };
    row.querySelector('.dp-rm').onclick = () => { state.deployAllow.delete(t); renderDeployList(); };
    ui.deployList.appendChild(row);
  }
}

updateScopeUI();

// ────────────────────────────────────────────────────────────
// Save (Ctrl+S) — write through FolderTransport when granted.
// ────────────────────────────────────────────────────────────
async function saveActive() {
  if (!state.editor || !state.active) return;
  const content = state.editor.getValue();
  if (state.folder.root) {
    try {
      // Strip the root-folder prefix so write path is relative to grant.
      const rootName = state.folder.root.name + '/';
      const rel = state.active.startsWith(rootName) ? state.active.slice(rootName.length) : state.active;
      await state.reg.call('fs_write', { path: rel, content });
      state.dirty.delete(state.active);
      renderTabs();
      setStatus(`saved ${rel}`);
    } catch (e) { setStatus(`save failed: ${e.message}`, 'error'); }
  } else {
    // No folder — download as a file.
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.active.split('/').pop();
    a.click();
    URL.revokeObjectURL(a.href);
    state.dirty.delete(state.active);
    renderTabs();
    setStatus('downloaded');
  }
}

function bindShortcuts() {
  state.editor.addCommand(state.monaco.KeyMod.CtrlCmd | state.monaco.KeyCode.KeyS, saveActive);
  state.editor.addCommand(state.monaco.KeyMod.CtrlCmd | state.monaco.KeyCode.Enter, runActive);
}

// Global shortcuts (when not in editor)
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 's') { e.preventDefault(); saveActive(); }
  if (mod && e.key === 'Enter') { e.preventDefault(); runActive(); }
  if (mod && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    document.body.classList.toggle('show-left');
  }
  if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); toggleBottom(); }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); gotoPage(state.pageIndex - 1); }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); gotoPage(state.pageIndex + 1); }
});

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function setStatus(text, cls = '') {
  ui.ideStatus.textContent = text;
  ui.ideStatus.className = 'status ' + cls;
}
function refreshTools() {
  ui.toolList.textContent = 'tools: ' + state.reg.list().join(', ');
}
function updateDim() {
  // Project lives on the dimensional ladder by file count.
  const step = Math.max(0, state.fileCount - 1);
  const ladder = ladderPosition(step);
  ui.dimIndicator.textContent =
    `◇ dim ${ladder.dim} (${ladder.label}, F=${ladder.rung})`;
}

// ────────────────────────────────────────────────────────────
// Welcome content
// ────────────────────────────────────────────────────────────
const WELCOME = `// Welcome to Manifold IDE
// Free, browser-only, powered by Manifold AI · z = xy
//
// Try:
//   1. Click ▶ run                 — runs JavaScript / TypeScript / Python
//   2. Click ◐ debug               — walks the dimensional ladder (point→…→bloom)
//   3. Click 📁 folder             — grant a local folder; tree appears on the left
//   4. Click 🔌 MCP                — connect a local bridge for filesystem & deploy
//   5. Click ☁ deploy              — pushes the active file via MCP
//   6. Ask the AI on the right     — explain / refactor / fix / test
//
// Keyboard:  Ctrl+Enter run · Ctrl+S save · Ctrl+B sidebar · Ctrl+J bottom

function fib(n) {
  if (n < 2) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) { const t = a + b; a = b; b = t; }
  return b;
}

const seven = [1,1,2,3,5,8,13];
console.log('Fibonacci-7 ladder:', seven.map((_, i) => fib(i + 1)).join(' '));
console.log('Golden ratio φ =', (1 + Math.sqrt(5)) / 2);
`;

await openFile('welcome.js', WELCOME, 'javascript');
aiAddMessage('assistant',
  'Hi. I\'m the Manifold AI inside this IDE. Each turn is a manifold point — z = x · ∏y on the canonical zynxy substrate. ' +
  'Use the chips below for quick actions, or ask anything about your code.',
  { meta: '◈ zynxy · dim 1 (point, F=1) · ready' });
setStatus('ready');
ui.aiStatus.textContent = `auto · ${pickAutoEngine()} on first ask`;
