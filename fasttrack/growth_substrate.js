/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 *
 * THE BUTTERFLY EFFECT PRINCIPLE:
 *   A single wing-beat creates a hurricane.
 *   Level 6 (WHOLE) becomes Level 0 (POTENTIAL) of the next spiral.
 *   A completed game must BECOME the seed of the next player.
 *
 * ============================================================
 * FASTTRACK GROWTH SUBSTRATE
 * ButterflyFX Manifold Pattern - Viral Spiral Engine
 * ============================================================
 *
 * This substrate ensures the game NEVER reaches a dead end.
 * Every game completion is a dimensional transition point where
 * the WHOLE (finished game) transforms into POTENTIAL (new player).
 *
 * Three growth vectors (tiny → big):
 *
 *   1. SHARE ON WIN — Victory emotion → one-tap share → new player
 *      The wing-beat: a 0.5s moment where the player feels triumph
 *      The hurricane: that share reaches 100-500 people on social
 *
 *   2. CHALLENGE LINK — "Beat my score" → personal URL → rivalry
 *      The wing-beat: competitive pride encoded in a URL
 *      The hurricane: recipients MUST play to respond
 *
 *   3. SPECTATOR HOOK — AI demo auto-generates shareable moments
 *      The wing-beat: an impressive capture or fast track play
 *      The hurricane: "watch this" content spreads organically
 *
 * USAGE:
 *   <script src="growth_substrate.js"></script>
 *   Then call GrowthSubstrate.showVictoryShare(winner, gameStats)
 *   from the game-over handler.
 */

'use strict';

const GrowthSubstrate = (() => {

    const VERSION = '1.0.0';
    const NAME = 'FastTrack Growth Substrate';
    const GAME_URL = 'https://kensgames.com/fasttrack/';
    const GAME_PLAY_URL = GAME_URL + '3d.html';
    const CHALLENGE_URL = GAME_URL + 'play.html';

    // ── Share Templates ───────────────────────────────────────
    // Short, emotional, shareable. The wing-beat.
    const SHARE_TEMPLATES = {
        win: [
            '🏆 I just won Fast Track in {turns} turns! Can you beat that?\n\n🎮 Play free: {url}',
            '⚡ Victory! Beat {opponents} opponents in Fast Track on the {theme} board.\n\n🎮 {url}',
            '🎉 {name} is the Fast Track champion! {turns} turns, {theme} theme.\n\nThink you can beat me? 🎮 {url}',
            '🔥 Just crushed it at Fast Track! {turns} turns on {theme}.\n\nFree 3D board game — try to beat my score: {url}'
        ],
        challenge: [
            '⚔️ I challenge you to Fast Track! I won in {turns} turns.\n\nBeat that → {url}',
            '🎯 {name} challenges you! Can you win in under {turns} turns?\n\n→ {url}'
        ],
        capture: [
            '😈 Just sent {victim} back to start in Fast Track! Savage.\n\n🎮 Play free: {url}'
        ],
        fasttrack: [
            '⚡ FAST TRACK! Skipped half the board in one move!\n\n🎮 Play this wild board game free: {url}'
        ]
    };

    // ── Generate Share Text ───────────────────────────────────
    function _generateShareText(type, data) {
        const templates = SHARE_TEMPLATES[type] || SHARE_TEMPLATES.win;
        const template = templates[Math.floor(Math.random() * templates.length)];

        return template
            .replace(/{name}/g, data.name || 'Player')
            .replace(/{turns}/g, data.turns || '??')
            .replace(/{theme}/g, data.theme || 'Cosmic')
            .replace(/{opponents}/g, data.opponents || '3')
            .replace(/{victim}/g, data.victim || 'opponent')
            .replace(/{url}/g, data.url || CHALLENGE_URL);
    }

    // ── Generate Challenge URL ────────────────────────────────
    // Encodes game stats into a shareable URL that shows the challenger's record
    function _generateChallengeURL(stats) {
        const params = new URLSearchParams({
            c: '1',                                          // challenge mode flag
            n: (stats.name || 'Champion').substring(0, 20),  // challenger name
            t: stats.turns || 0,                             // turns to win
            th: stats.theme || 'cosmic',                     // theme played
            p: stats.players || 4,                           // player count
            ts: Date.now().toString(36)                      // timestamp (obfuscated)
        });
        return CHALLENGE_URL + '?' + params.toString();
    }

    // ── Share via Web Share API / Fallback ─────────────────────
    async function _share(text, url, title) {
        // Track the share in analytics
        if (window.FTAnalytics) {
            FTAnalytics.share('web_share');
        }

        // Try native Web Share API (mobile)
        if (navigator.share) {
            try {
                await navigator.share({
                    title: title || 'Fast Track — Free Board Game',
                    text: text,
                    url: url
                });
                return 'shared';
            } catch (e) {
                if (e.name === 'AbortError') return 'cancelled';
                // Fall through to fallback
            }
        }

        // Fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(text);
            return 'copied';
        } catch (e) {
            // Final fallback: select text
            _showCopyFallback(text);
            return 'fallback';
        }
    }

    // ── Platform-Specific Share URLs ──────────────────────────
    function _shareTo(platform, text, url) {
        if (window.FTAnalytics) {
            FTAnalytics.share(platform);
        }

        const encodedText = encodeURIComponent(text);
        const encodedUrl = encodeURIComponent(url);

        const urls = {
            facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
            twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
            reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent('I just won Fast Track — free 3D board game!')}`,
            whatsapp: `https://wa.me/?text=${encodedText}`,
            telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
            messenger: `https://www.facebook.com/dialog/send?link=${encodedUrl}&app_id=0&redirect_uri=${encodedUrl}`
        };

        const shareUrl = urls[platform];
        if (shareUrl) {
            window.open(shareUrl, '_blank', 'width=600,height=400,noopener');
        }
    }

    // ── Copy Fallback UI ──────────────────────────────────────
    function _showCopyFallback(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;width:80%;height:100px;font-size:14px;padding:10px;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        setTimeout(() => ta.remove(), 3000);
    }

    // ── Create Share Button ───────────────────────────────────
    function _createShareBtn(emoji, label, color, onClick) {
        const btn = document.createElement('button');
        Object.assign(btn.style, {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: '700',
            fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
            background: color,
            border: 'none',
            borderRadius: '25px',
            color: '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
            minWidth: '0'
        });
        btn.innerHTML = `<span style="font-size:18px">${emoji}</span> ${label}`;
        btn.onmouseover = () => { btn.style.transform = 'scale(1.05)'; btn.style.filter = 'brightness(1.2)'; };
        btn.onmouseout = () => { btn.style.transform = 'scale(1)'; btn.style.filter = ''; };
        btn.onclick = onClick;
        return btn;
    }

    // ══════════════════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════════════════

    const api = {
        version: VERSION,
        name: NAME,

        /**
         * Show the victory share panel — injected into the game-over overlay.
         * This is the WHOLE → POTENTIAL transition point.
         *
         * @param {HTMLElement} container - Parent element to append share UI into
         * @param {Object} winner - { name, index, avatar, colorHex }
         * @param {Object} stats - { turns, theme, players, isAI }
         */
        injectVictoryShare: function(container, winner, stats) {
            if (!container) return;

            const challengeUrl = _generateChallengeURL({
                name: winner.name,
                turns: stats.turns,
                theme: stats.theme,
                players: stats.players
            });

            const shareText = _generateShareText('win', {
                name: winner.name,
                turns: stats.turns,
                theme: stats.theme,
                opponents: (stats.players || 4) - 1,
                url: challengeUrl
            });

            // ── Share Section Container ───────────────────────
            const shareSection = document.createElement('div');
            shareSection.id = 'growth-share-section';
            Object.assign(shareSection.style, {
                marginTop: '16px',
                padding: '16px',
                background: 'linear-gradient(135deg, rgba(255,107,53,0.15), rgba(0,212,255,0.1))',
                border: '1px solid rgba(255,107,53,0.3)',
                borderRadius: '12px',
                textAlign: 'center'
            });

            // ── "Share Your Victory" Header ───────────────────
            const header = document.createElement('div');
            Object.assign(header.style, {
                fontSize: '13px',
                fontWeight: '700',
                color: 'rgba(255,200,150,0.9)',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                marginBottom: '10px'
            });
            header.textContent = '🦋 Share Your Victory';
            shareSection.appendChild(header);

            // ── Challenge Badge ───────────────────────────────
            const badge = document.createElement('div');
            Object.assign(badge.style, {
                display: 'inline-block',
                padding: '6px 14px',
                background: 'rgba(255,215,0,0.15)',
                border: '1px solid rgba(255,215,0,0.3)',
                borderRadius: '20px',
                fontSize: '13px',
                color: '#ffd700',
                marginBottom: '12px'
            });
            badge.innerHTML = `🏆 Won in <strong>${stats.turns || '??'}</strong> turns on <strong>${stats.theme || 'Cosmic'}</strong>`;
            shareSection.appendChild(badge);

            // ── Share Buttons Row ─────────────────────────────
            const btnRow = document.createElement('div');
            Object.assign(btnRow.style, {
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '10px'
            });

            // Native Share (mobile) or Copy Link (desktop)
            if (navigator.share) {
                btnRow.appendChild(_createShareBtn('📤', 'Share', 'linear-gradient(135deg, #ff6b35, #ff8f65)', () => {
                    _share(shareText, challengeUrl, `${winner.name} won Fast Track!`);
                }));
            } else {
                btnRow.appendChild(_createShareBtn('📋', 'Copy Link', 'linear-gradient(135deg, #ff6b35, #ff8f65)', async () => {
                    const result = await _share(shareText, challengeUrl);
                    if (result === 'copied') {
                        const btn = btnRow.querySelector('button');
                        if (btn) { btn.innerHTML = '<span style="font-size:18px">✓</span> Copied!'; }
                    }
                }));
            }

            // Platform buttons
            btnRow.appendChild(_createShareBtn('📘', 'Facebook', '#1877F2', () => _shareTo('facebook', shareText, challengeUrl)));
            btnRow.appendChild(_createShareBtn('🐦', 'Twitter', '#1DA1F2', () => _shareTo('twitter', shareText, challengeUrl)));
            btnRow.appendChild(_createShareBtn('💬', 'WhatsApp', '#25D366', () => _shareTo('whatsapp', shareText, challengeUrl)));
            btnRow.appendChild(_createShareBtn('🔴', 'Reddit', '#FF4500', () => _shareTo('reddit', shareText, challengeUrl)));

            shareSection.appendChild(btnRow);

            // ── Challenge Link (compact, always visible) ──────
            const challengeRow = document.createElement('div');
            Object.assign(challengeRow.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '8px',
                fontSize: '11px',
                color: 'rgba(200,230,255,0.5)',
                overflow: 'hidden'
            });
            const linkText = document.createElement('span');
            linkText.style.cssText = 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:rgba(0,212,255,0.6);';
            linkText.textContent = challengeUrl;
            challengeRow.appendChild(linkText);

            const copySmall = document.createElement('button');
            Object.assign(copySmall.style, {
                padding: '3px 10px',
                fontSize: '11px',
                background: 'rgba(0,212,255,0.2)',
                border: '1px solid rgba(0,212,255,0.3)',
                borderRadius: '4px',
                color: '#00d4ff',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
            });
            copySmall.textContent = 'Copy';
            copySmall.onclick = async () => {
                await navigator.clipboard.writeText(challengeUrl);
                copySmall.textContent = '✓';
                setTimeout(() => { copySmall.textContent = 'Copy'; }, 2000);
            };
            challengeRow.appendChild(copySmall);
            shareSection.appendChild(challengeRow);

            container.appendChild(shareSection);
        },

        /**
         * Handle incoming challenge from URL params.
         * Shows the challenger's stats as motivation to beat them.
         *
         * @param {URLSearchParams} params - URL search params
         * @returns {Object|null} Challenge data or null
         */
        parseChallenge: function(params) {
            if (!params || params.get('c') !== '1') return null;

            return {
                isChallenge: true,
                challengerName: params.get('n') || 'Someone',
                challengerTurns: parseInt(params.get('t')) || 0,
                theme: params.get('th') || 'cosmic',
                players: parseInt(params.get('p')) || 4,
                timestamp: params.get('ts') || ''
            };
        },

        /**
         * Show challenge banner at top of screen.
         * "X beat this game in Y turns. Can you do better?"
         */
        showChallengeBanner: function(challenge) {
            if (!challenge || !challenge.isChallenge) return;

            const banner = document.createElement('div');
            banner.id = 'challenge-banner';
            Object.assign(banner.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                right: '0',
                zIndex: '60000',
                padding: '12px 20px',
                background: 'linear-gradient(135deg, rgba(255,107,53,0.95), rgba(255,60,0,0.9))',
                textAlign: 'center',
                fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
                fontSize: '15px',
                fontWeight: '700',
                color: '#fff',
                boxShadow: '0 4px 20px rgba(255,107,53,0.5)',
                animation: 'slideDown 0.5s ease-out'
            });
            banner.innerHTML = `
                ⚔️ <strong>${challenge.challengerName}</strong> beat this game in <strong>${challenge.challengerTurns} turns</strong>.
                Can you do better?
                <button onclick="this.parentElement.remove()" style="
                    margin-left:16px; padding:4px 12px; background:rgba(0,0,0,0.3);
                    border:1px solid rgba(255,255,255,0.3); border-radius:12px;
                    color:#fff; cursor:pointer; font-size:12px; font-weight:700;
                ">✕ Close</button>
            `;

            // Add slide animation
            const style = document.createElement('style');
            style.textContent = '@keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }';
            document.head.appendChild(style);

            document.body.appendChild(banner);
        },

        /**
         * Generate a share for mid-game moments (captures, fast tracks).
         * Called from game event handlers for real-time virality.
         */
        generateMomentShare: function(type, data) {
            return _generateShareText(type, data);
        },

        /** Direct share utility */
        share: _share,
        shareTo: _shareTo
    };

    console.log(`🦋 ${NAME} v${VERSION} loaded`);
    return api;
})();

// ── Global Export ─────────────────────────────────────────────
window.GrowthSubstrate = GrowthSubstrate;
