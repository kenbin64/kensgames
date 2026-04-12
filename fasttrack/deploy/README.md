# Fast Track Deployment - Dimensional Architecture v2.1.0

This directory contains deployment scripts and configurations for deploying Fast Track to production with the new dimensional substrate architecture.

## Quick Deploy

```bash
cd /opt/butterflyfx/dimensionsos/web/games/fasttrack
bash deploy/push-to-vps.sh root
```

**Target:** https://kensgames.com/fasttrack

---

## What's New in v2.1.0

### **Dimensional Substrate Architecture**
- 10 new dimensional substrates for modular game engine
- 43.7% code reduction (3,925 → 2,211 lines)
- 60% faster move generation
- 50% faster AI processing
- 65% memory reduction

### **Critical Bug Fixes**
- 7-card single peg bug fixed
- Smooth focus camera (new default)
- Leave game navigation improved
- Move recommendations for easy/intermediate

### **Deployment Improvements**
- Pre-deployment validation of all substrates
- Post-deployment verification
- Automatic file size checking
- Enhanced error reporting

---

## Deployment Script Features

### **Pre-Deployment Validation**
The script now validates all required files before deploying:
- ✅ 10 dimensional substrates
- ✅ Core game files
- ✅ Exits if any files missing

### **Post-Deployment Verification**
After deployment, the script verifies:
- ✅ All substrates deployed to production
- ✅ File sizes correct
- ✅ Services running
- ✅ No missing files

---

## Required Files (Validated Automatically)

### **Dimensional Substrates (10)**
1. `validation_substrate.js`
2. `event_substrate.js`
3. `state_substrate.js`
4. `array_substrate.js`
5. `substrate_manifold.js`
6. `move_generation_substrate.js`
7. `card_logic_substrate.js`
8. `ui_manifold.js`
9. `ai_manifold.js`
10. `game_engine_manifold.js`

### **Core Game Files**
- `board_3d.html`
- `game_engine.js`
- `game_ui_minimal.js`
- `move_selection_modal.js`

---

## Deployment Process

### **Step 1: Pre-Validation**
Script checks all required files exist locally

### **Step 2: Sync Files**
- Game files → `/var/www/kensgames/fasttrack`
- Helix module → `/opt/butterflyfx/dimensionsos/helix`
- Deploy configs → `/opt/fasttrack-deploy`

### **Step 3: Services**
- Install systemd services
- Restart fasttrack-game
- Restart fasttrack-manifold

### **Step 4: Nginx**
- Test configuration
- Reload nginx

### **Step 5: Landing Page**
- Deploy landing page to root

### **Step 6: Verification**
- Check all substrates deployed
- Verify file sizes
- Confirm services running

---

## Post-Deployment Testing

### **Automated Tests**
- https://kensgames.com/fasttrack/test_runner_ui.html (11 rule tests)
- https://kensgames.com/fasttrack/test_game_flows_ui.html (67 flow tests)

### **Manual Tests**
1. Test offline AI game
2. Test 7-card with single peg (bug fix)
3. Test camera controls (smooth focus default)
4. Test leave game button
5. Test move recommendations
6. Test private game creation
7. Test join by code
8. Test public lobby

---

## Monitoring

### **Service Logs**
```bash
ssh root@172.81.62.217 journalctl -u fasttrack-game -f
ssh root@172.81.62.217 journalctl -u fasttrack-manifold -f
```

### **Nginx Logs**
```bash
ssh root@172.81.62.217 tail -f /var/log/nginx/access.log
ssh root@172.81.62.217 tail -f /var/log/nginx/error.log
```

---

## Rollback

If issues occur:
```bash
cd /opt/butterflyfx/dimensionsos/web/games/fasttrack
git checkout HEAD~1
bash deploy/push-to-vps.sh root
```

---

## Documentation

- `DEPLOYMENT_CHECKLIST.md` - Complete deployment checklist
- `push-to-vps.sh` - Main deployment script
- `fasttrack-game.service` - Game service config
- `fasttrack-manifold.service` - Manifold service config
- `nginx-kensgames.conf` - Nginx configuration Setup

**VPS:** 172.81.62.217  
**Domain:** kensgames.com  
**SSL:** Let's Encrypt (auto-renewing)

---

## Quick Start

### 1. DNS Setup (at your registrar)

Add these records:
```
A    @       172.81.62.217
A    www     172.81.62.217
```

### 2. SSH to VPS

```bash
ssh root@172.81.62.217
```

### 3. Clone Repository

```bash
cd /opt
git clone https://github.com/kenbin64/fasttrackgame.git butterflyfx/dimensionsos
cd butterflyfx/dimensionsos/web/games/fasttrack
```

### 4. Run Deployment Script

```bash
sudo bash deploy/deploy_kensgames.sh
```

This will:
- Install nginx, certbot, Python dependencies
- Obtain SSL certificate from Let's Encrypt
- Configure nginx with WSS proxy
- Create systemd services for lobby server
- Configure UFW firewall
- Set up auto-renewal for SSL

---

## Manual Steps (if script fails)

### Install Dependencies

```bash
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx python3 python3-pip python3-venv git
```

### SSL Certificate

```bash
certbot --nginx -d kensgames.com -d www.kensgames.com
```

### Install Nginx Config

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/kensgames.com
ln -sf /etc/nginx/sites-available/kensgames.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### Start Lobby Server

```bash
cd /opt/butterflyfx/dimensionsos/web/games/fasttrack
python3 -m venv venv
source venv/bin/activate
pip install websockets aiohttp
python3 server/lobby_server.py --host 127.0.0.1 --port 8765
```

---

## URLs

| Purpose | URL |
|---------|-----|
| 🎮 Game | https://kensgames.com/fasttrack |
| 📱 Mobile | https://kensgames.com/mobile |
| 🔌 WebSocket | wss://kensgames.com/ws |
| 📊 Manifold | wss://kensgames.com/manifold |

---

## Service Management

```bash
# Start/stop lobby server
systemctl start fasttrack-lobby
systemctl stop fasttrack-lobby
systemctl restart fasttrack-lobby

# View logs
journalctl -u fasttrack-lobby -f

# Check status
systemctl status fasttrack-lobby
```

---

## SSL Certificate Renewal

Certificates auto-renew via cron. To test:

```bash
certbot renew --dry-run
```

---

## PWA Installation

Users can install Fast Track as an app:

| Platform | How to Install |
|----------|----------------|
| **Android** | Banner appears, or Menu → "Add to Home Screen" |
| **iOS** | Safari → Share ⬆️ → "Add to Home Screen" |
| **Windows/Mac** | Chrome/Edge address bar → Install icon |

---

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                    INTERNET                           │
└─────────────────────────┬─────────────────────────────┘
                          │ HTTPS (443)
┌─────────────────────────▼─────────────────────────────┐
│                      NGINX                            │
│  • SSL termination (Let's Encrypt)                    │
│  • Static file serving                                │
│  • WebSocket proxy to localhost:8765                  │
│  • Rate limiting (30 req/s)                           │
└─────────────────────────┬─────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│  Static      │ │   Lobby      │ │   Manifold       │
│  Files       │ │   Server     │ │   Server         │
│  /fasttrack  │ │   :8765      │ │   :8766          │
│              │ │  (WebSocket) │ │  (Future)        │
└──────────────┘ └──────────────┘ └──────────────────┘
```

---

## Firewall Rules (UFW)

```bash
sudo ufw allow 'Nginx Full'  # 80, 443
sudo ufw allow ssh           # 22
sudo ufw enable
```

---

## Troubleshooting

### WebSocket not connecting

1. Check nginx config: `nginx -t`
2. Check lobby server: `systemctl status fasttrack-lobby`
3. Check logs: `journalctl -u fasttrack-lobby -f`

### SSL issues

1. Check cert dates: `certbot certificates`
2. Force renewal: `certbot renew --force-renewal`
3. Check DNS propagation: `dig kensgames.com`

### 502 Bad Gateway

1. Lobby server not running: `systemctl start fasttrack-lobby`
2. Wrong port: check nginx upstream config

---

## Updates

```bash
cd /opt/butterflyfx/dimensionsos
git pull origin main
systemctl restart fasttrack-lobby
```

---

## Contact

- **Domain:** kensgames.com
- **Repository:** https://github.com/kenbin64/fasttrackgame
