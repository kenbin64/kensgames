// ═══════════════════════════════════════════════════════════════════════════
// STARFIGHTER — ENEMY CODEX / THREAT DATABASE (overlay UI)
// ═══════════════════════════════════════════════════════════════════════════
// In-flight overlay listing every Hive Sigma threat archetype: type, class,
// abilities, vulnerabilities, and backstory. Plus a holographic 3D diagram
// of each ship (lazy-loaded LOD2 GLB).  Toggle with `I`, close with `Escape`.
//
// Companion live snippet: when the player has a target locked, an inline
// intel card appears beside the cockpit crosshair. Toggle with `Y`.
//
// Pure additive UI. Zero changes to existing render or gameplay code.
// Reads via window.SFCodexData and window.Starfighter.getState().

const SFCodex = (function () {
  'use strict';

  let _root = null;          // overlay root <div>
  let _open = false;
  let _currentId = null;     // currently selected archetype id
  let _diagram = null;       // { canvas, scene, camera, renderer, model, key, raf }
  let _scanEnabled = true;   // live intel snippet on locked target
  let _scanCard = null;
  let _scanRaf = 0;

  // ── Public API ──────────────────────────────────────────────────────────

  function init() {
    if (_root) return;
    _buildOverlay();
    _bindKeys();
    _startScanLoop();
  }

  function toggle() { if (!_root) init(); _open ? close() : open(); }
  function open() {
    if (!_root) init();
    _root.style.display = 'flex';
    _open = true;
    if (!_currentId) {
      const first = (window.SFCodexData && SFCodexData.allHostileIds()[0]) || null;
      if (first) showEntry(first);
    } else {
      showEntry(_currentId);
    }
  }
  function close() {
    if (!_root) return;
    _root.style.display = 'none';
    _open = false;
    _stopDiagram();
  }
  function isOpen() { return _open; }
  function setScanEnabled(v) { _scanEnabled = !!v; if (!v && _scanCard) _scanCard.style.display = 'none'; }

  // ── DOM scaffold ────────────────────────────────────────────────────────

  function _buildOverlay() {
    _root = document.createElement('div');
    _root.id = 'sf-codex';
    _root.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9000',
      'display:none', 'flex-direction:column',
      'background:radial-gradient(ellipse at center, rgba(0,12,24,0.92) 0%, rgba(0,4,10,0.98) 100%)',
      'color:#cfeaff', 'font-family:"Share Tech Mono","Courier New",monospace',
      'backdrop-filter:blur(4px)', 'padding:24px 32px',
    ].join(';');

    _root.innerHTML = [
      '<div id="sf-codex-header" style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,255,255,0.25);padding-bottom:10px;margin-bottom:14px">',
      '  <div style="font-size:22px;letter-spacing:0.18em;color:#0ff;text-shadow:0 0 12px rgba(0,255,255,0.5)">UEDF · THREAT DATABASE</div>',
      '  <div style="display:flex;gap:14px;align-items:center">',
      '    <div id="sf-codex-tabs" style="display:flex;gap:6px"></div>',
      '    <div style="opacity:0.6;font-size:11px">[I] toggle · [Esc] close</div>',
      '    <button id="sf-codex-close" style="background:rgba(255,80,80,0.15);color:#ff8888;border:1px solid rgba(255,80,80,0.4);padding:4px 12px;cursor:pointer;font-family:inherit">CLOSE</button>',
      '  </div>',
      '</div>',
      '<div id="sf-codex-body" style="display:grid;grid-template-columns:280px 1fr 360px;gap:20px;flex:1;min-height:0">',
      '  <div id="sf-codex-list" style="overflow:hidden;border:1px solid rgba(0,255,255,0.18);padding:8px;background:rgba(0,20,40,0.4)"></div>',
      '  <div id="sf-codex-detail" style="overflow:hidden;border:1px solid rgba(0,255,255,0.18);padding:18px 22px;background:rgba(0,20,40,0.35)"></div>',
      '  <div id="sf-codex-diagram-wrap" style="border:1px solid rgba(0,255,255,0.18);padding:10px;background:rgba(0,8,16,0.6);display:flex;flex-direction:column">',
      '    <div style="font-size:11px;letter-spacing:0.16em;opacity:0.7;margin-bottom:6px">HOLOGRAPHIC DIAGRAM</div>',
      '    <canvas id="sf-codex-canvas" style="flex:1;width:100%;min-height:280px;display:block"></canvas>',
      '    <div id="sf-codex-diagram-status" style="font-size:10px;opacity:0.55;margin-top:6px;min-height:14px"></div>',
      '  </div>',
      '</div>',
    ].join('');

    document.body.appendChild(_root);
    document.getElementById('sf-codex-close').addEventListener('click', close);
    _renderTabs('hostile');
    _renderList('hostile');

    _scanCard = document.createElement('div');
    _scanCard.id = 'sf-codex-scan';
    _scanCard.style.cssText = [
      'position:fixed', 'top:50%', 'right:24px', 'transform:translateY(-50%)',
      'z-index:8500', 'display:none', 'min-width:240px', 'max-width:280px',
      'background:rgba(0,16,28,0.78)', 'border:1px solid rgba(255,200,80,0.55)',
      'color:#ffe0a0', 'font-family:"Share Tech Mono","Courier New",monospace',
      'font-size:11px', 'padding:10px 12px', 'pointer-events:none',
      'box-shadow:0 0 18px rgba(255,170,40,0.18)',
    ].join(';');
    document.body.appendChild(_scanCard);
  }

  function _renderTabs(active) {
    const tabs = document.getElementById('sf-codex-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    [['hostile', 'HIVE SIGMA'], ['friendly', 'UEDF']].forEach(([id, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      const isActive = id === active;
      b.style.cssText = [
        'background:' + (isActive ? 'rgba(0,255,255,0.2)' : 'rgba(0,40,60,0.4)'),
        'color:' + (isActive ? '#0ff' : '#7aa'),
        'border:1px solid rgba(0,255,255,' + (isActive ? '0.55' : '0.2') + ')',
        'padding:4px 12px', 'cursor:pointer', 'font-family:inherit', 'letter-spacing:0.12em',
      ].join(';');
      b.addEventListener('click', () => { _renderTabs(id); _renderList(id); });
      tabs.appendChild(b);
    });
  }

  function _renderList(group) {
    const list = document.getElementById('sf-codex-list');
    if (!list || !window.SFCodexData) return;
    const entries = group === 'friendly' ? SFCodexData.FRIENDLY : SFCodexData.HOSTILE;
    list.innerHTML = '';
    entries.forEach(e => {
      const row = document.createElement('div');
      const threat = e.threatLevel || 0;
      const dots = '●'.repeat(threat) + '○'.repeat(Math.max(0, 5 - threat));
      row.style.cssText = [
        'padding:8px 10px', 'cursor:pointer', 'border-bottom:1px solid rgba(0,255,255,0.08)',
        'transition:background 0.1s',
      ].join(';');
      row.innerHTML = [
        '<div style="font-size:13px;color:#cfeaff">' + (e.shortName || e.designation) + '</div>',
        '<div style="font-size:10px;opacity:0.6;margin-top:2px">' + (e.class || '') + '</div>',
        threat ? '<div style="font-size:10px;color:#ff8866;margin-top:2px;letter-spacing:0.2em">' + dots + '</div>' : '',
      ].join('');
      row.addEventListener('mouseenter', () => row.style.background = 'rgba(0,255,255,0.08)');
      row.addEventListener('mouseleave', () => row.style.background = e.id === _currentId ? 'rgba(0,255,255,0.12)' : 'transparent');
      row.addEventListener('click', () => showEntry(e.id));
      if (e.id === _currentId) row.style.background = 'rgba(0,255,255,0.12)';
      list.appendChild(row);
    });
  }

  // ── Detail panel ────────────────────────────────────────────────────────

  function showEntry(id) {
    if (!window.SFCodexData) return;
    const e = SFCodexData.byId(id);
    if (!e) return;
    _currentId = id;
    const detail = document.getElementById('sf-codex-detail');
    if (!detail) return;

    const isHostile = !!e.threatLevel;
    const dotColor = isHostile ? '#ff8866' : '#88ccff';
    const dots = isHostile ? '●'.repeat(e.threatLevel) + '○'.repeat(5 - e.threatLevel) : '';

    const abilHTML = (e.abilities || []).map(a =>
      '<li style="margin:4px 0"><span style="color:#ffe080">' + a.name + '</span>' +
      ' <span style="opacity:0.55;font-size:10px">[' + (a.kind || 'spec') + ']</span>' +
      '<div style="opacity:0.75;font-size:11px;margin-left:14px">' + (a.notes || '') + '</div></li>'
    ).join('');
    const vulnHTML = (e.vulnerabilities || []).map(v =>
      '<li style="margin:4px 0;color:#a0e0a0">' + v + '</li>'
    ).join('');

    detail.innerHTML = [
      '<div style="font-size:11px;letter-spacing:0.18em;opacity:0.6">UEDF DESIGNATION</div>',
      '<div style="font-size:24px;color:#0ff;text-shadow:0 0 10px rgba(0,255,255,0.4);margin-top:2px">' + (e.designation || e.shortName) + '</div>',
      '<div style="display:flex;gap:18px;margin-top:8px;font-size:11px;flex-wrap:wrap">',
      '  <div><span style="opacity:0.55">CLASS</span> <span style="color:#cfeaff">' + (e.class || '—') + '</span></div>',
      e.faction ? '  <div><span style="opacity:0.55">FACTION</span> <span style="color:#cfeaff">' + e.faction + '</span></div>' : '',
      isHostile ? '  <div><span style="opacity:0.55">THREAT</span> <span style="color:' + dotColor + ';letter-spacing:0.2em">' + dots + '</span></div>' : '',
      e.firstWave ? '  <div><span style="opacity:0.55">FIRST WAVE</span> <span style="color:#cfeaff">W' + e.firstWave + '</span></div>' : '',
      '</div>',
      e.silhouette ? '<div style="margin-top:14px"><div style="font-size:11px;letter-spacing:0.16em;opacity:0.55">SILHOUETTE</div><div style="margin-top:4px;font-size:12px;opacity:0.85">' + e.silhouette + '</div></div>' : '',
      abilHTML ? '<div style="margin-top:14px"><div style="font-size:11px;letter-spacing:0.16em;opacity:0.55">ABILITIES</div><ul style="margin:6px 0 0 0;padding-left:18px;font-size:12px">' + abilHTML + '</ul></div>' : '',
      vulnHTML ? '<div style="margin-top:14px"><div style="font-size:11px;letter-spacing:0.16em;opacity:0.55">KNOWN VULNERABILITIES</div><ul style="margin:6px 0 0 0;padding-left:18px;font-size:12px">' + vulnHTML + '</ul></div>' : '',
      e.backstory ? '<div style="margin-top:16px"><div style="font-size:11px;letter-spacing:0.16em;opacity:0.55">FIELD INTEL</div><div style="margin-top:4px;font-size:12px;line-height:1.55;opacity:0.9;font-style:italic">' + e.backstory + '</div></div>' : '',
      e.notes ? '<div style="margin-top:14px;font-size:12px;opacity:0.85">' + e.notes + '</div>' : '',
    ].filter(Boolean).join('');

    const list = document.getElementById('sf-codex-list');
    if (list) Array.from(list.children).forEach(c => { c.style.background = 'transparent'; });
    _loadDiagram(e);
  }

  // ── Holographic diagram (lazy GLB into mini Three.js scene) ─────────────

  function _ensureDiagram() {
    if (_diagram) return _diagram;
    const canvas = document.getElementById('sf-codex-canvas');
    if (!canvas || !window.THREE) return null;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
    scene.add(new THREE.AmbientLight(0x4488cc, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(5, 6, 8); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88ccff, 0.9); rim.position.set(-6, 2, -4); scene.add(rim);
    _diagram = { canvas, scene, camera, renderer, model: null, key: null, raf: 0, t: 0 };
    return _diagram;
  }

  function _resizeDiagram() {
    if (!_diagram) return;
    const r = _diagram.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    _diagram.renderer.setSize(w, h, false);
    _diagram.camera.aspect = w / h;
    _diagram.camera.updateProjectionMatrix();
  }

  function _loadDiagram(entry) {
    const d = _ensureDiagram();
    if (!d) return;
    const status = document.getElementById('sf-codex-diagram-status');
    if (d.model && d.key === entry.glbKey) { _runDiagram(); return; }
    if (d.model) { d.scene.remove(d.model); d.model = null; }
    d.key = entry.glbKey;
    if (!entry.glbFile) { if (status) status.textContent = 'no model reference'; _runDiagram(); return; }

    if (status) status.textContent = 'loading ' + entry.glbFile + ' …';
    const loader = new THREE.GLTFLoader();
    const lod2 = 'assets/models/optimized/' + entry.glbFile.replace(/\.glb$/i, '_lod2.glb');
    const fallback = 'assets/models/' + entry.glbFile;
    const tryLoad = (url, onFail) => loader.load(url, gltf => _onModelLoaded(entry, gltf), undefined, onFail);
    tryLoad(lod2, () => tryLoad(fallback, err => {
      if (status) status.textContent = 'unavailable';
      _runDiagram();
    }));
  }

  function _onModelLoaded(entry, gltf) {
    if (!_diagram || _diagram.key !== entry.glbKey) return;
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 4;
    const s = targetSize / maxDim;
    m.scale.setScalar(s);
    m.position.set(-center.x * s, -center.y * s, -center.z * s);
    _diagram.scene.add(m);
    _diagram.model = m;
    _diagram.camera.position.set(0, targetSize * 0.4, targetSize * 1.8);
    _diagram.camera.lookAt(0, 0, 0);
    const status = document.getElementById('sf-codex-diagram-status');
    if (status) status.textContent = entry.glbFile;
    _runDiagram();
  }

  function _runDiagram() {
    if (!_diagram) return;
    cancelAnimationFrame(_diagram.raf);
    _resizeDiagram();
    const tick = () => {
      if (!_open || !_diagram) return;
      _diagram.t += 0.008;
      if (_diagram.model) _diagram.model.rotation.y = _diagram.t;
      _diagram.renderer.render(_diagram.scene, _diagram.camera);
      _diagram.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function _stopDiagram() {
    if (!_diagram) return;
    cancelAnimationFrame(_diagram.raf);
    _diagram.raf = 0;
  }

  // ── Key bindings ────────────────────────────────────────────────────────

  function _bindKeys() {
    window.addEventListener('keydown', e => {
      const focused = document.activeElement;
      const inText = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.isContentEditable);
      if (inText) return;
      if (e.code === 'KeyI') {
        e.preventDefault();
        toggle();
      } else if (e.code === 'Escape' && _open) {
        e.preventDefault();
        close();
      } else if (e.code === 'KeyY' && !e.repeat) {
        setScanEnabled(!_scanEnabled);
      }
    }, { capture: true });
    window.addEventListener('resize', () => { if (_open) _resizeDiagram(); });
  }

  // ── Live target-scan card (reads window.Starfighter state) ──────────────

  function _startScanLoop() {
    let last = '';
    const tick = () => {
      _scanRaf = requestAnimationFrame(tick);
      if (!_scanEnabled || !_scanCard) return;
      const SF = window.Starfighter;
      if (!SF || !SF.getState) { _scanCard.style.display = 'none'; return; }
      const state = SF.getState();
      const tgt = state && state.player && state.player.lockedTarget;
      if (!tgt || !tgt.type) { _scanCard.style.display = 'none'; last = ''; return; }
      const entry = window.SFCodexData ? SFCodexData.byId(tgt.type) : null;
      const key = tgt.id + '|' + tgt.type;
      const pPos = state.player.position || { x: 0, y: 0, z: 0 };
      const tPos = tgt.position || { x: 0, y: 0, z: 0 };
      const dx = tPos.x - pPos.x, dy = tPos.y - pPos.y, dz = tPos.z - pPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const hp = (tgt.hp != null && tgt.maxHp) ? Math.max(0, tgt.hp / tgt.maxHp) : null;
      const sh = (tgt.shield != null && tgt.maxShield) ? Math.max(0, tgt.shield / tgt.maxShield) : null;

      if (key !== last) {
        last = key;
        const name = entry ? entry.designation : (tgt.type.toUpperCase());
        const klass = entry ? entry.class : 'Unknown classification';
        const threat = entry && entry.threatLevel ? '●'.repeat(entry.threatLevel) + '○'.repeat(5 - entry.threatLevel) : '';
        const vuln = entry && entry.vulnerabilities && entry.vulnerabilities[0] ? entry.vulnerabilities[0] : '';
        _scanCard.innerHTML = [
          '<div style="font-size:10px;letter-spacing:0.16em;opacity:0.7;color:#ffcc66">TARGET LOCK</div>',
          '<div style="font-size:13px;color:#ffe0a0;margin-top:2px">' + name + '</div>',
          '<div style="font-size:10px;opacity:0.7;margin-top:1px">' + klass + '</div>',
          threat ? '<div style="font-size:10px;color:#ff8866;letter-spacing:0.2em;margin-top:2px">' + threat + '</div>' : '',
          '<div id="sf-codex-scan-stats" style="margin-top:6px;font-size:11px;color:#cfeaff"></div>',
          vuln ? '<div style="margin-top:6px;font-size:10px;opacity:0.85;color:#a0e0a0">⚠ ' + vuln + '</div>' : '',
          '<div style="margin-top:6px;font-size:9px;opacity:0.5">[I] open codex · [Y] hide</div>',
        ].join('');
      }
      const stats = _scanCard.querySelector('#sf-codex-scan-stats');
      if (stats) {
        const bar = (frac, color) => {
          const w = Math.round(Math.max(0, Math.min(1, frac)) * 100);
          return '<div style="height:4px;background:rgba(255,255,255,0.1);margin:2px 0 4px"><div style="height:100%;width:' + w + '%;background:' + color + '"></div></div>';
        };
        stats.innerHTML = [
          'DIST  ' + (dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'),
          sh != null ? '<div style="margin-top:4px;font-size:9px;opacity:0.7">SHIELD</div>' + bar(sh, '#66ccff') : '',
          hp != null ? '<div style="font-size:9px;opacity:0.7">HULL</div>' + bar(hp, '#ff8866') : '',
        ].join('');
      }
      _scanCard.style.display = 'block';
    };
    tick();
  }

  return { init, open, close, toggle, isOpen, showEntry, setScanEnabled };
})();

if (typeof module !== 'undefined') module.exports = SFCodex;
if (typeof window !== 'undefined') {
  window.SFCodex = SFCodex;
  // Auto-init on DOM ready (overlay is hidden by default until KeyI)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SFCodex.init());
  } else {
    SFCodex.init();
  }
}
