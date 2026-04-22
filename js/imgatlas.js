/*
  Client-side renderer for tools/analyze_png_bilinear.js atlases.

  Goal: replace heavyweight PNG thumbnails with a small JSON "image atlas" that
  can be fetched quickly and painted into a <canvas>.

  Usage (HTML):
    <img data-imgatlas="auto" data-pngsrc="/assets/images/foo.png" src="data:..." alt="...">

  The atlas URL is inferred as:
    /tools/output/manifold + <png path> + .imgatlas.json

  Fallback:
    If atlas fetch/render fails, the original PNG is loaded from data-pngsrc.
*/

(() => {
  'use strict';

  const PLACEHOLDER_1PX =
    'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function getDevicePixelRatio() {
    try {
      return window.devicePixelRatio || 1;
    } catch {
      return 1;
    }
  }

  function stripQueryAndHash(url) {
    const q = url.indexOf('?');
    const h = url.indexOf('#');
    const cut = (q === -1 ? h : (h === -1 ? q : Math.min(q, h)));
    return cut === -1 ? url : url.slice(0, cut);
  }

  function isAutoModeEnabled() {
    try {
      const p = new URLSearchParams(window.location.search);
      const q = (p.get('imgatlas') || '').trim().toLowerCase();
      if (q === '1' || q === 'true' || q === 'on' || q === 'yes') return true;
    } catch {
      // ignore
    }

    try {
      const v = (localStorage.getItem('kg_imgatlas') || '').trim().toLowerCase();
      return v === '1' || v === 'true' || v === 'on' || v === 'yes';
    } catch {
      return false;
    }
  }

  function inferAtlasUrlFromPngUrl(pngUrl) {
    const clean = stripQueryAndHash(pngUrl || '');
    if (!clean.startsWith('/')) return null;
    if (!clean.toLowerCase().endsWith('.png')) return null;
    // Preserve full relative path (including subfolders like /4dconnect/...)
    return `/tools/output/manifold${clean}.imgatlas.json`;
  }

  function decodeCornersBase64ToBuf(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }

  function decodeBase64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }

  function decodeLeavesB64ToU16(leavesB64) {
    const bytes = decodeBase64ToBytes(leavesB64);
    // bytes.buffer is aligned; interpret as Uint16LE (platform is little-endian in browsers).
    return new Uint16Array(bytes.buffer);
  }

  function yieldToEventLoop() {
    // requestAnimationFrame can be throttled/paused in background contexts;
    // always provide a timer fallback so rendering never stalls.
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      setTimeout(finish, 0);
      if (typeof requestAnimationFrame === 'function') {
        try {
          requestAnimationFrame(finish);
        } catch {
          // ignore
        }
      }
    });
  }

  function buildTileMap(leaves, srcW, srcH, tileSize) {
    const ts = Math.max(1, tileSize | 0);
    const tilesX = Math.ceil(srcW / ts);
    const tilesY = Math.ceil(srcH / ts);
    const map = new Int32Array(tilesX * tilesY);
    map.fill(-1);

    const isPackedU16 = leaves && leaves._kind === 'u16';
    const isCompact = !isPackedU16 && Array.isArray(leaves[0]);

    for (let i = 0; i < leaves.length; i++) {
      const lf = leaves[i];
      const x0 = (isPackedU16 ? leaves.u16[i * 4 + 0] : (isCompact ? lf[0] : lf.x)) | 0;
      const y0 = (isPackedU16 ? leaves.u16[i * 4 + 1] : (isCompact ? lf[1] : lf.y)) | 0;
      const ww = (isPackedU16 ? leaves.u16[i * 4 + 2] : (isCompact ? lf[2] : lf.w)) | 0;
      const hh = (isPackedU16 ? leaves.u16[i * 4 + 3] : (isCompact ? lf[3] : lf.h)) | 0;
      const x1 = x0 + ww - 1;
      const y1 = y0 + hh - 1;
      const tx0 = Math.floor(x0 / ts);
      const ty0 = Math.floor(y0 / ts);
      const tx1 = Math.floor(x1 / ts);
      const ty1 = Math.floor(y1 / ts);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const idx = ty * tilesX + tx;
          // It should be a quadtree tiling, so overlaps are not expected; last-wins is fine.
          map[idx] = i;
        }
      }
    }

    return { map, tilesX, tilesY, tileSize: ts };
  }

  function bilerpCorners(corners16, tx, ty) {
    // corners16 layout: c00,c10,c01,c11 each RGBA
    const out = new Uint8ClampedArray(4);
    const t0 = 1 - tx;
    const u0 = 1 - ty;

    for (let k = 0; k < 4; k++) {
      const c00 = corners16[k];
      const c10 = corners16[4 + k];
      const c01 = corners16[8 + k];
      const c11 = corners16[12 + k];
      const a = c00 * t0 + c10 * tx;
      const b = c01 * t0 + c11 * tx;
      out[k] = (a * u0 + b * ty) | 0;
    }
    return out;
  }

  function renderAtlasToImageData(atlas, outW, outH) {
    const srcW = atlas.width | 0;
    const srcH = atlas.height | 0;
    let leaves = Array.isArray(atlas.leaves) ? atlas.leaves : [];
    let leavesCompact = Array.isArray(leaves[0]);

    if (atlas.leavesB64 && typeof atlas.leavesB64 === 'string') {
      const u16 = decodeLeavesB64ToU16(atlas.leavesB64);
      // Wrap so we can keep using length-based loops.
      leaves = { _kind: 'u16', u16, length: Math.floor(u16.length / 4) };
      leavesCompact = false;
    }

    const tileSize = (atlas.settings && atlas.settings.minBlock) ? (atlas.settings.minBlock | 0) : 16;
    const { map: tileMap, tilesX, tileSize: ts } = buildTileMap(leaves, srcW, srcH, tileSize);

    // Decode corners into a flat buffer for speed.
    // Preferred: atlas.cornersB64 (single base64 blob, 16 bytes/leaf).
    // Back-compat: leaves[i].c (per-leaf base64 string).
    let cornersFlat;
    if (atlas.cornersB64 && typeof atlas.cornersB64 === 'string') {
      cornersFlat = decodeBase64ToBytes(atlas.cornersB64);
    } else {
      cornersFlat = new Uint8Array(leaves.length * 16);
      for (let i = 0; i < leaves.length; i++) {
        const c = decodeCornersBase64ToBuf(leaves[i].c);
        cornersFlat.set(c, i * 16);
      }
    }

    const img = new ImageData(outW, outH);
    const dst = img.data;

    const denomX = Math.max(1, outW - 1);
    const denomY = Math.max(1, outH - 1);

    for (let y = 0; y < outH; y++) {
      const sy = Math.floor((y * (srcH - 1)) / denomY);
      const tyTile = Math.floor(sy / ts);
      const v = (srcH <= 1) ? 0 : sy / (srcH - 1);

      for (let x = 0; x < outW; x++) {
        const sx = Math.floor((x * (srcW - 1)) / denomX);
        const txTile = Math.floor(sx / ts);
        const u = (srcW <= 1) ? 0 : sx / (srcW - 1);

        const tileIdx = tyTile * tilesX + txTile;
        const leafIdx = tileMap[tileIdx];

        let r = 0, g = 0, b = 0, a = 255;

        if (leafIdx >= 0) {
          const lf = leaves[leafIdx];
          const leavesPackedU16 = leaves && leaves._kind === 'u16';
          const lx0 = (leavesPackedU16 ? leaves.u16[leafIdx * 4 + 0] : (leavesCompact ? lf[0] : lf.x)) | 0;
          const ly0 = (leavesPackedU16 ? leaves.u16[leafIdx * 4 + 1] : (leavesCompact ? lf[1] : lf.y)) | 0;
          const lw = (leavesPackedU16 ? leaves.u16[leafIdx * 4 + 2] : (leavesCompact ? lf[2] : lf.w)) | 0;
          const lh = (leavesPackedU16 ? leaves.u16[leafIdx * 4 + 3] : (leavesCompact ? lf[3] : lf.h)) | 0;
          const tx = lw <= 1 ? 0 : clamp((sx - lx0) / (lw - 1), 0, 1);
          const ty = lh <= 1 ? 0 : clamp((sy - ly0) / (lh - 1), 0, 1);

          const base = leafIdx * 16;
          const c00r = cornersFlat[base + 0];
          const c00g = cornersFlat[base + 1];
          const c00b = cornersFlat[base + 2];
          const c00a = cornersFlat[base + 3];
          const c10r = cornersFlat[base + 4];
          const c10g = cornersFlat[base + 5];
          const c10b = cornersFlat[base + 6];
          const c10a = cornersFlat[base + 7];
          const c01r = cornersFlat[base + 8];
          const c01g = cornersFlat[base + 9];
          const c01b = cornersFlat[base + 10];
          const c01a = cornersFlat[base + 11];
          const c11r = cornersFlat[base + 12];
          const c11g = cornersFlat[base + 13];
          const c11b = cornersFlat[base + 14];
          const c11a = cornersFlat[base + 15];

          const t0 = 1 - tx;
          const u0 = 1 - ty;

          const ar = (c00r * t0 + c10r * tx);
          const br = (c01r * t0 + c11r * tx);
          r = (ar * u0 + br * ty) | 0;

          const ag = (c00g * t0 + c10g * tx);
          const bg = (c01g * t0 + c11g * tx);
          g = (ag * u0 + bg * ty) | 0;

          const ab = (c00b * t0 + c10b * tx);
          const bb = (c01b * t0 + c11b * tx);
          b = (ab * u0 + bb * ty) | 0;

          const aa = (c00a * t0 + c10a * tx);
          const ba = (c01a * t0 + c11a * tx);
          a = (aa * u0 + ba * ty) | 0;
        } else {
          // Fallback: simple gradient by UV so the box isn't empty.
          r = (u * 255) | 0;
          g = (v * 255) | 0;
          b = 30;
          a = 255;
        }

        const di = (y * outW + x) * 4;
        dst[di] = r;
        dst[di + 1] = g;
        dst[di + 2] = b;
        dst[di + 3] = a;
      }
    }

    return img;
  }

  async function fetchJson(url) {
    // Revalidate atlases so updates take effect (important during iteration).
    // This still allows the browser to use cached responses when valid.
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
    return res.json();
  }

  function replaceImgWithCanvas(img, canvas) {
    // Preserve layout-sensitive bits
    canvas.className = img.className;
    canvas.style.cssText = img.style.cssText;
    canvas.style.display = getComputedStyle(img).display === 'inline' ? 'inline-block' : getComputedStyle(img).display;
    canvas.style.width = img.style.width || '100%';
    canvas.style.height = img.style.height || '100%';

    const br = getComputedStyle(img).borderRadius;
    if (br) canvas.style.borderRadius = br;

    canvas.setAttribute('role', 'img');
    const label = img.getAttribute('alt') || img.getAttribute('aria-label') || '';
    if (label) canvas.setAttribute('aria-label', label);

    img.replaceWith(canvas);
  }

  async function applyToImg(img) {
    const pngSrc = img.getAttribute('data-pngsrc') || img.getAttribute('src') || '';
    const atlasMode = (img.getAttribute('data-imgatlas') || '').trim().toLowerCase();
    if (!atlasMode) return;

    // Default behavior should be to show real images.
    // "auto" is an optimization mode and is opt-in.
    if (atlasMode === 'auto' && !isAutoModeEnabled()) return;

    const isManifoldOnly = atlasMode === 'manifold' || atlasMode === 'only' || atlasMode === 'manifold-only';

    const atlasUrl = img.getAttribute('data-imgatlas-url') || inferAtlasUrlFromPngUrl(pngSrc);
    if (!atlasUrl) return;

    // Avoid double work
    if (img.getAttribute('data-imgatlas-applied') === '1') return;
    img.setAttribute('data-imgatlas-applied', '1');

    // Determine target render size from layout
    const dpr = getDevicePixelRatio();
    const rect = img.getBoundingClientRect();

    const maxDim = clamp(parseInt(img.getAttribute('data-imgatlas-maxdim') || '768', 10) || 768, 64, 2048);
    let outW = Math.round((rect.width || 0) * dpr);
    let outH = Math.round((rect.height || 0) * dpr);

    try {
      const atlas = await fetchJson(atlasUrl);

      // If not laid out yet, choose a reasonable size
      if (!(outW > 0 && outH > 0)) {
        outW = atlas.width;
        outH = atlas.height;
      }

      const scale = Math.min(1, maxDim / Math.max(outW, outH));
      outW = Math.max(2, Math.round(outW * scale));
      outH = Math.max(2, Math.round(outH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;

      // Paint off the critical path (let the browser breathe)
      await yieldToEventLoop();

      const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
      const imgData = renderAtlasToImageData(atlas, outW, outH);
      ctx.putImageData(imgData, 0, 0);

      replaceImgWithCanvas(img, canvas);
    } catch (e) {
      // Atlas failed.
      // - In manifold-only mode, keep the placeholder so the page never relies on PNGs.
      // - Otherwise (e.g. data-imgatlas="auto"), fall back to the original PNG so images
      //   don't appear "missing".
      img.removeAttribute('data-imgatlas-applied');

      if (!isManifoldOnly) {
        if (pngSrc && img.getAttribute('src') !== pngSrc) {
          img.setAttribute('src', pngSrc);
        }
        // Prevent repeated failing atlas attempts on subsequent KGImgAtlas.apply() calls.
        img.removeAttribute('data-imgatlas');
        img.removeAttribute('data-imgatlas-url');
        img.removeAttribute('data-imgatlas-maxdim');
      }
    }
  }

  async function apply(root = document) {
    const imgs = Array.from(root.querySelectorAll('img[data-imgatlas]'));
    // Stagger a bit to keep interaction snappy
    for (let i = 0; i < imgs.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await applyToImg(imgs[i]);
      if (i % 2 === 1) {
        // eslint-disable-next-line no-await-in-loop
        await yieldToEventLoop();
      }
    }
  }

  window.KGImgAtlas = {
    PLACEHOLDER_1PX,
    inferAtlasUrlFromPngUrl,
    apply,
  };
})();
