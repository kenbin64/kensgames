# Vendor Library Manifest
**ButterflyFX — Shared Third-Party Libraries**

All libraries in `web/lib/` are self-hosted copies of public open-source packages.
No CDN dependency. Works offline. Safe from CSP restrictions inside Service Workers.

Pristine originals (byte-for-byte copies of CDN downloads) are archived in `web/lib/.originals/`.
To roll back any library: copy from `.originals/` back to the working directory.

---

## Libraries

### Three.js r128
| Field | Value |
|---|---|
| **File** | `three/three.min.js` |
| **Version** | r128 (0.128.0) |
| **CDN source** | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` |
| **Size** | 603,445 bytes |
| **SHA256** | `9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2` |

### Three.js OrbitControls r128
| Field | Value |
|---|---|
| **File** | `three/OrbitControls.js` |
| **Version** | 0.128.0 |
| **CDN source** | `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js` |
| **Size** | 26,375 bytes |
| **SHA256** | `02bb4ade710f3e607329e37a21f098bc3ac70eb6e33daf8a65e79f4db785e7b2` |

### Font Awesome CSS
| Field | Value |
|---|---|
| **File** | `fontawesome/css/all.min.css` |
| **Version** | 6.5.1 |
| **CDN source** | `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css` |
| **Size** | 102,641 bytes |
| **SHA256** | `c22cfb6520a7fdbb738632834019acf47c78b1279462c0eb4cb83bae83ecb5a7` |

### Font Awesome Webfonts
| File | SHA256 |
|---|---|
| `fontawesome/webfonts/fa-brands-400.woff2` | `3a8924cd5203a28628716aedb5cef0943da4c3b44e3ffcee90ab06387b41c490` |
| `fontawesome/webfonts/fa-regular-400.woff2` | `2bccecf0bc7e96cd5ce4003abeb3ae9ee4a3d19158c4e6edfd2df32d2f0d5721` |
| `fontawesome/webfonts/fa-solid-900.woff2` | `9fc85f3a4544ab0d570c7f8f9bbb88db8d92c359b2707580ea8b07c75673eae2` |
| `fontawesome/webfonts/fa-v4compatibility.woff2` | `4d4a2d7fd1c6684845cb174fdd7fc073bd64cb741286fb247f8b76c2b7b852c4` |

### Chart.js
| Field | Value |
|---|---|
| **File** | `chartjs/chart.min.js` |
| **Version** | 4.4.6 |
| **CDN source** | `https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js` |
| **Size** | 205,889 bytes |
| **SHA256** | `9653a0813db743bbe78332a3896e28c7bc7546e4fff51e7e979e908d1f0471d1` |

### jQuery
| Field | Value |
|---|---|
| **File** | `jquery/jquery.min.js` |
| **Version** | 3.7.1 |
| **CDN source** | `https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js` |
| **Size** | 87,533 bytes |
| **SHA256** | `fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a` |

### Bootstrap CSS
| Field | Value |
|---|---|
| **File** | `bootstrap/css/bootstrap.min.css` |
| **Version** | 5.3.3 |
| **CDN source** | `https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/css/bootstrap.min.css` |
| **Size** | 232,803 bytes |
| **SHA256** | `3c8f27e6009ccfd710a905e6dcf12d0ee3c6f2ac7da05b0572d3e0d12e736fc8` |

### Bootstrap JS Bundle (includes Popper)
| Field | Value |
|---|---|
| **File** | `bootstrap/js/bootstrap.bundle.min.js` |
| **Version** | 5.3.3 |
| **CDN source** | `https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/js/bootstrap.bundle.min.js` |
| **Size** | 80,721 bytes |
| **SHA256** | `0833b2e9c3a26c258476c46266e6877fc75218625162e0460be9a3a098a61c6c` |

---

## How to use from any app

Use relative paths based on your file's location relative to `web/`:

| Your file is in... | Three.js path |
|---|---|
| `web/*.html` | `lib/three/three.min.js` |
| `web/apps/*.html` | `../lib/three/three.min.js` |
| `web/demos/*.html` | `../lib/three/three.min.js` |
| `web/games/fasttrack/*.html` | `../../lib/three/three.min.js` |
| `web/games/fasttrack/landing/*.html` | `../../../lib/three/three.min.js` |
| `web/templates/*.html` | `../lib/three/three.min.js` |

---

## Rollback instructions

To restore a library to its pristine CDN state:
```bash
cp web/lib/.originals/three/three.min.js web/lib/three/three.min.js
```

To verify integrity against known-good checksum:
```bash
sha256sum web/lib/three/three.min.js
# Expected: 9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2
```

---

*Downloaded: 2026-03-01 | ButterflyFX — Kenneth Bingham*

