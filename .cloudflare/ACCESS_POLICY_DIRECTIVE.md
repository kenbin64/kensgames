# Cloudflare Access & Routing Directive — kensgames.com
# AI Agent Instruction: Apply these policies permanently to the kensgames.com zone.

---

## CONTEXT

Site: kensgames.com
Origin: VPS at 172.81.62.217 (proxied via Cloudflare)
Auth: JWT-based (`kg_token` in localStorage), managed by Node.js server on port 3000.

**Auth model:** The application manages its own login. Cloudflare Access is used ONLY to
hard-gate `/admin*`. All other login enforcement is handled by the app's own profile_gate.js
substrate — Cloudflare simply proxies those pages without any Access policy.

---

## 1. PATH POLICY TABLE

| Path | Public? | Who can access | Enforced by |
|------|---------|----------------|-------------|
| `/` | ✅ Public | Everyone | — |
| `/index.html` | ✅ Public | Everyone | — |
| `/lounge.html` | ✅ Public | Everyone | — |
| `/discover.html` | ✅ Public | Everyone | — |
| `/showcase.html` | ✅ Public | Everyone | — |
| `/arcade.css`, `/arcade.js`, `/gyroid.js` | ✅ Public | Everyone | — |
| `/css/*`, `/js/*`, `/lib/*` | ✅ Public | Everyone | — |
| `/login/*` | ✅ Public | Everyone | — |
| `/register/*` | ✅ Public | Everyone | — |
| `/forgot-password/*` | ✅ Public | Everyone | — |
| `/reset-password/*` | ✅ Public | Everyone | — |
| `/verify-email/*` | ✅ Public | Everyone | — |
| `/invite/*` | ✅ Public | Everyone (guests use invite code) | — |
| `/fasttrack/index.html` | ✅ Public | Everyone (landing/splash) | — |
| `/brickbreaker3d/index.html` | ✅ Public | Everyone (landing/splash) | — |
| `/starfighter/index.html` | ✅ Public | Everyone (landing/splash) | — |
| `/4dconnect/index.html` | ✅ Public | Everyone (landing/splash) | — |
| `/assemble/index.html` | ✅ Public | Everyone (landing/splash) | — |
| `/fasttrack/assets/*` | ✅ Public | Everyone | — |
| `/starfighter/assets/*` | ✅ Public | Everyone | — |
| `/brickbreaker3d/assets/*` | ✅ Public | Everyone | — |
| `/api/*` | ✅ Public (no CF gate) | API callers — auth checked by server | Node.js JWT |
| `/fasttrack/portal.html` | 🔒 Login required | Must have `kg_token` + profileSetup | profile_gate.js |
| `/fasttrack/lobby.html` | 🔒 Login required | Must have `kg_token` + profileSetup | profile_gate.js |
| `/brickbreaker3d/lobby.html` | 🔒 Login required | Must have `kg_token` + profileSetup | profile_gate.js |
| `/brickbreaker3d/game.html` | 🔒 Login or guest | `kg_token` OR `kg_guest_token` (invite) | profile_gate.js |
| `/starfighter/lobby.html` | 🔒 Login required | Must have `kg_token` + profileSetup | profile_gate.js |
| `/4dconnect/lobby.html` | 🔒 Login required | Must have `kg_token` + profileSetup | profile_gate.js |
| `/4dconnect/game.html` | 🔒 Login or guest | `kg_token` OR `kg_guest_token` (invite) | profile_gate.js |
| `/assemble/lobby.html` | 🔒 Login required | Must have `kg_token` + profileSetup | profile_gate.js |
| `/assemble/game.html` | 🔒 Login or guest | `kg_token` OR `kg_guest_token` (invite) | profile_gate.js |
| `/player/*` | 🔒 Login required | Must have `kg_token` + profileSetup | profile_gate.js |
| `/social/*` | 🔒 Login required | Must have `kg_token` + profileSetup | profile_gate.js |
| `/lobby/*` | 🔒 Login required | Must have `kg_token` + profileSetup | profile_gate.js |
| `/admin*` | 🛡️ Admin only | `kenetics.art@gmail.com`, `ken.bingham64@gmail.com` | **Cloudflare Access** |

---

## 2. CLOUDFLARE ACCESS — Admin Gate Only

Create ONE Cloudflare Access Self-Hosted Application:

- **Name**: `KensGames Admin`
- **Domain/Path**: `kensgames.com/admin*`
- **Session duration**: `24h`
- **Policy — Allow**:
  - Rule type: Emails
  - Value:
    - `kenetics.art@gmail.com`
    - `ken.bingham64@gmail.com`
- **Policy — Block all others**:
  - Rule type: Everyone
  - Action: Block

> Do NOT create Access policies for any other path. The app handles its own auth.

---

## 3. CACHE RULES

| Pattern | Cache Level | Edge TTL |
|---------|-------------|----------|
| `kensgames.com/api/*` | Bypass | — |
| `kensgames.com/*.html` | Standard | 4 hours |
| `kensgames.com/js/*` | Aggressive | 7 days |
| `kensgames.com/css/*` | Aggressive | 7 days |

---

## 4. HTTPS & SECURITY

- **SSL/TLS**: Full (Strict)
- **Always HTTPS**: ON
- **HSTS**: max-age=31536000, includeSubDomains, Preload
- **Min TLS**: 1.2
- **WAF Rate limits**:
  - `/api/auth/login` and `/api/auth/register` → 10 req/min/IP, block 60s
  - `/api/sessions/create` → 20 req/min/IP, block 30s

---

*kensgames.com — Last updated: 2026-04-18*
