/**
 * Processor-backed asset manifest route.
 *
 * Goal: treat asset metadata as manifold points so the frontend can resolve
 * HTML/CSS/JS/models/textures/cut-scenes through processor contracts.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const AuthHandler = require('../auth-handler');
const TetracubeClient = require('../tetracube-client');

const router = express.Router();
const authHandler = new AuthHandler();

const manifests = {};

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const decoded = authHandler.verifyToken(token);
  if (decoded.error) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  req.userId = decoded.userId;
  next();
}

function digest(v) {
  return crypto.createHash('sha256').update(JSON.stringify(v || {})).digest('hex');
}

function ensureManifest(appId) {
  const key = String(appId || 'portal').toLowerCase();
  if (!manifests[key]) {
    manifests[key] = {
      appId: key,
      version: 1,
      updatedAt: Date.now(),
      assets: [],
    };
  }
  return manifests[key];
}

function mirrorManifest(appId, manifest, eventName, actorId) {
  TetracubeClient.dualWriteRecord({
    table: 'asset_manifest',
    row: String(appId),
    col: 'snapshot',
    value: manifest,
    dim: {
      level: 6,
      x: Math.max(1, manifest.assets.length),
      y: 1,
      z_axis: 1,
      plane: Math.max(1, manifest.assets.length),
      volume: Math.max(1, manifest.assets.length),
      mass: Math.max(1, manifest.assets.length),
      theta_deg: 540,
      fib_scale: 8,
    },
    key: `asset_manifest:${appId}`,
    meta: {
      event: eventName,
      actor: actorId || 'system',
    },
  }).catch((err) => {
    console.warn('[assets-manifest] tetracube dual-write failed:', err.message);
  });
}

router.get('/manifest/:appId', async (req, res) => {
  const appId = String(req.params.appId || 'portal').toLowerCase();

  if (TetracubeClient.isEnabled()) {
    try {
      const remote = await TetracubeClient.fetchRemoteRecord('asset_manifest', appId, 'snapshot');
      const remoteValue = remote && (remote.value || remote.record) ? (remote.value || remote.record) : null;
      if (remoteValue) {
        return res.json({ success: true, source: 'remote', manifest: remoteValue });
      }
    } catch {
      // fallback below
    }
  }

  const shadow = TetracubeClient.getShadowByKey(`asset_manifest:${appId}`);
  if (shadow && shadow.value) {
    return res.json({ success: true, source: 'shadow', manifest: shadow.value });
  }

  return res.json({ success: true, source: 'memory', manifest: ensureManifest(appId) });
});

router.post('/manifest/:appId/register', requireAuth, (req, res) => {
  const appId = String(req.params.appId || 'portal').toLowerCase();
  const { assets } = req.body || {};

  if (!Array.isArray(assets) || assets.length === 0) {
    return res.status(400).json({ success: false, error: 'assets array required' });
  }

  const manifest = ensureManifest(appId);
  const now = Date.now();

  for (const item of assets) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '').trim();
    const path = String(item.path || '').trim();
    const type = String(item.type || '').trim();
    if (!id || !path || !type) continue;

    const existing = manifest.assets.find((a) => a.id === id);
    const record = {
      id,
      type,
      path,
      checksum: item.checksum || null,
      dimLevel: Number(item.dimLevel) || 1,
      fibScale: Number(item.fibScale) || 1,
      updatedAt: now,
    };

    if (existing) {
      Object.assign(existing, record);
    } else {
      manifest.assets.push(record);
    }
  }

  manifest.version += 1;
  manifest.updatedAt = now;

  mirrorManifest(appId, manifest, 'asset-manifest:register', String(req.userId));

  return res.json({
    success: true,
    appId,
    version: manifest.version,
    assetCount: manifest.assets.length,
    digest: digest(manifest),
  });
});

router.get('/manifest/:appId/parity', requireAuth, async (req, res) => {
  const appId = String(req.params.appId || 'portal').toLowerCase();
  const memory = ensureManifest(appId);
  const shadow = TetracubeClient.getShadowByKey(`asset_manifest:${appId}`);
  const writeStatus = TetracubeClient.getWriteStatus(`asset_manifest:${appId}`);

  let remote = null;
  let remoteError = null;
  if (TetracubeClient.isEnabled()) {
    try {
      remote = await TetracubeClient.fetchRemoteRecord('asset_manifest', appId, 'snapshot');
    } catch (e) {
      remoteError = String(e.message || e);
    }
  }

  const memoryHash = digest(memory);
  const shadowHash = shadow && shadow.value ? digest(shadow.value) : null;
  const remoteValue = remote && (remote.value || remote.record) ? (remote.value || remote.record) : null;
  const remoteHash = remoteValue ? digest(remoteValue) : null;

  return res.json({
    success: true,
    appId,
    writeStatus,
    remoteError,
    parity: {
      memoryHash,
      shadowHash,
      remoteHash,
      memoryVsShadow: memoryHash && shadowHash ? memoryHash === shadowHash : null,
      shadowVsRemote: shadowHash && remoteHash ? shadowHash === remoteHash : null,
    },
  });
});

module.exports = router;
