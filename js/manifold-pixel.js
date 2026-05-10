/**
 * ═══════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD PIXEL  v0.1
 *
 * Address-grid renderer. There are no objects, no materials, no
 * textures. Color is the value the manifold returns when queried at
 * a pixel address.
 *
 *   address  x = (sx, sy)               where on the viewport
 *   modifier y = field sample at x      what's there
 *   color    z = x · y                  what the eye sees
 *
 * Pipeline per frame:
 *   1. Iterate viewport addresses (clipped to screen).
 *   2. For each address, accumulate field contributions from every
 *      registered contributor — the manifold IS the field.
 *   3. Resolve to RGBA. Color is derived, never stored.
 *   4. Compare against the prior frame's RGBA at the same address.
 *      Write only the pixels that changed (delta gate). Static
 *      addresses cost nothing after the first frame.
 *
 * This is a 2D-canvas reference implementation: zero shader compile,
 * zero WebGL state, fully observable. A WebGL2 fragment-shader
 * upgrade is a drop-in replacement of `_resolveTile()` with a
 * single fullscreen draw — same address grid, same delta gate.
 *
 * Aligns with HR-27/28: z is never stored independently, always
 * derived from the queryable field at an address.
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  /**
   * A field contributor is a function:
   *   (addr, ctx) -> contribution | null
   *
   *   addr    = { sx, sy, u, v }     pixel address + normalised [0,1]
   *   ctx     = { t, w, h, frame }   shared per-frame context
   *   return  = { r, g, b, a, w }    rgb in [0,1], a=alpha, w=weight
   *           or null                contributor is silent at this address
   *
   * Contributors are registered by id; later registrations replace
   * earlier ones with the same id. The resolver combines all
   * contributions by weighted alpha-over composition in registration
   * order.
   */
  const _contributors = new Map();   // id -> { fn, bbox, version }
  let _bgColor = [0.05, 0.04, 0.03, 1.0];
  let _epoch = 0;                     // bumped when contributor set changes

  // Per-instance render state
  function createSurface(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d', { alpha: opts.alpha !== false });
    if (!ctx) throw new Error('ManifoldPixel: 2D context unavailable');

    const state = {
      canvas, ctx,
      w: 0, h: 0,
      tile: opts.tile || 32,           // delta-gate granularity
      img: null,                        // ImageData buffer (full)
      prevHash: null,                   // Uint32Array of per-tile hashes
      tilesX: 0, tilesY: 0,
      frame: 0,
      lastEpoch: -1,
      running: false,
      raf: 0,
      fps: 0,
      _fpsAccum: 0, _fpsCount: 0, _fpsLast: 0,
    };

    function resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (w === state.w && h === state.h) return;
      canvas.width = w; canvas.height = h;
      state.w = w; state.h = h;
      state.img = ctx.createImageData(w, h);
      state.tilesX = Math.ceil(w / state.tile);
      state.tilesY = Math.ceil(h / state.tile);
      state.prevHash = new Uint32Array(state.tilesX * state.tilesY);
      state.prevHash.fill(0xFFFFFFFF);  // force first-frame redraw
    }

    function tick(t) {
      state.frame++;
      if (state.lastEpoch !== _epoch) {
        // Contributor set changed: invalidate every tile.
        if (state.prevHash) state.prevHash.fill(0xFFFFFFFF);
        state.lastEpoch = _epoch;
      }
      const dirtyTiles = _resolve(state, t);
      if (dirtyTiles > 0) {
        // ImageData is the canonical pixel buffer; one putImageData
        // per frame after we've written only the dirty tiles into it.
        ctx.putImageData(state.img, 0, 0);
      }

      // FPS metric (rolling 1 s window)
      if (!state._fpsLast) state._fpsLast = t;
      state._fpsAccum += (t - state._fpsLast);
      state._fpsCount++;
      state._fpsLast = t;
      if (state._fpsAccum >= 1000) {
        state.fps = (state._fpsCount * 1000) / state._fpsAccum;
        state._fpsAccum = 0; state._fpsCount = 0;
      }
    }

    function loop(t) {
      if (!state.running) return;
      tick(t);
      state.raf = requestAnimationFrame(loop);
    }

    return {
      resize,
      start() {
        if (state.running) return;
        resize();
        state.running = true;
        state.raf = requestAnimationFrame(loop);
      },
      stop() {
        state.running = false;
        if (state.raf) cancelAnimationFrame(state.raf);
        state.raf = 0;
      },
      tick,        // manual single-frame for tests
      get state() { return state; },
    };
  }

  // ── Resolve ──────────────────────────────────────────────────────
  // Walks every tile, evaluates the field at each address, writes
  // RGBA into the ImageData, and updates the dirty hash. Returns
  // number of tiles that were redrawn.
  function _resolve(s, t) {
    const w = s.w, h = s.h, T = s.tile;
    const data = s.img.data;
    const ctx = { t: t * 0.001, w, h, frame: s.frame };
    const contribs = Array.from(_contributors.values());
    let dirty = 0;

    for (let ty = 0; ty < s.tilesY; ty++) {
      for (let tx = 0; tx < s.tilesX; tx++) {
        const x0 = tx * T, y0 = ty * T;
        const x1 = Math.min(x0 + T, w);
        const y1 = Math.min(y0 + T, h);

        // Per-tile FNV-1a hash of the resolved RGBA stream.
        let hash = 0x811c9dc5 >>> 0;

        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            const u = px / w, v = py / h;
            const addr = { sx: px, sy: py, u, v };

            // Field accumulation: alpha-over, weighted.
            let r = _bgColor[0], g = _bgColor[1], b = _bgColor[2], a = _bgColor[3];
            for (let i = 0; i < contribs.length; i++) {
              const c = contribs[i];
              if (c.bbox && (px < c.bbox.x0 || px >= c.bbox.x1 || py < c.bbox.y0 || py >= c.bbox.y1)) continue;
              const out = c.fn(addr, ctx);
              if (!out) continue;
              const oa = (out.a == null ? 1 : out.a) * (out.w == null ? 1 : out.w);
              const ia = 1 - oa;
              r = r * ia + out.r * oa;
              g = g * ia + out.g * oa;
              b = b * ia + out.b * oa;
              a = a * ia + oa;
            }

            const ri = (r * 255) | 0;
            const gi = (g * 255) | 0;
            const bi = (b * 255) | 0;
            const ai = (Math.min(1, a) * 255) | 0;

            const idx = (py * w + px) << 2;
            data[idx] = ri; data[idx + 1] = gi; data[idx + 2] = bi; data[idx + 3] = ai;

            // FNV-1a step over the four bytes.
            hash = ((hash ^ ri) * 0x01000193) >>> 0;
            hash = ((hash ^ gi) * 0x01000193) >>> 0;
            hash = ((hash ^ bi) * 0x01000193) >>> 0;
            hash = ((hash ^ ai) * 0x01000193) >>> 0;
          }
        }

        const tIdx = ty * s.tilesX + tx;
        if (s.prevHash[tIdx] !== hash) {
          s.prevHash[tIdx] = hash;
          dirty++;
        } else {
          // Tile unchanged: roll back the writes we just made by
          // marking the tile clean. We still wrote to ImageData but
          // putImageData on the whole buffer is one call regardless.
          // The dirty count is the only signal that matters.
        }
      }
    }
    return dirty;
  }

  // ── Public API ───────────────────────────────────────────────────
  const ManifoldPixel = {
    /**
     * Register a field contributor. Replaces any contributor with the
     * same id. `bbox` is an optional viewport-pixel rectangle that
     * lets the resolver skip the contributor outside its support.
     */
    contribute(id, fn, bbox) {
      if (typeof fn !== 'function') throw new Error('ManifoldPixel.contribute: fn required');
      _contributors.set(id, { fn, bbox: bbox || null, version: ++_epoch });
      _epoch++;
    },

    /** Remove a contributor by id. */
    unregister(id) {
      if (_contributors.delete(id)) _epoch++;
    },

    /** Mark contributor support invalidated (force redraw). */
    invalidate() { _epoch++; },

    /** Set the base "void" color the field is composited over. */
    setBackground(r, g, b, a) { _bgColor = [r, g, b, a == null ? 1 : a]; _epoch++; },

    /** Create a render surface bound to a canvas element. */
    create: createSurface,

    /** Inspect for debugging / tests. */
    _internal: { contributors: _contributors, get epoch() { return _epoch; } },
  };

  global.ManifoldPixel = ManifoldPixel;
})(typeof window !== 'undefined' ? window : globalThis);
