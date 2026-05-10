// Kens Games — Version Badge
// Renders a small, unobtrusive version chip in the upper-left corner.
// Reads /version.json and shows "v<version>" with the build channel as a tooltip.
(function () {
  if (typeof document === 'undefined') return;
  if (document.getElementById('kg-version-badge')) return;

  function mount(version, info) {
    var el = document.createElement('a');
    el.id = 'kg-version-badge';
    el.href = '/version.json';
    el.target = '_blank';
    el.rel = 'noopener';
    el.textContent = 'v' + version;
    el.title = (info && info.release_channel ? info.release_channel + ' • ' : '') +
      (info && info.build_sha ? info.build_sha : '');
    el.style.cssText = [
      'position:fixed', 'top:8px', 'left:10px', 'z-index:99999',
      'font:600 11px/1 "Orbitron","Segoe UI",sans-serif',
      'letter-spacing:0.06em', 'text-transform:uppercase',
      'color:#9be9ff', 'background:rgba(4,8,24,0.72)',
      'border:1px solid rgba(0,200,255,0.35)', 'border-radius:6px',
      'padding:5px 9px', 'text-decoration:none',
      'box-shadow:0 0 10px rgba(0,160,255,0.18)',
      'pointer-events:auto', 'user-select:none',
      'backdrop-filter:blur(4px)', '-webkit-backdrop-filter:blur(4px)'
    ].join(';');
    (document.body || document.documentElement).appendChild(el);
  }

  function load() {
    fetch('/version.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.version) return;
        if (document.body) mount(j.version, j);
        else document.addEventListener('DOMContentLoaded', function () { mount(j.version, j); });
      })
      .catch(function () { /* silent */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
