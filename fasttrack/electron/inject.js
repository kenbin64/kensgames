'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DESKTOP PAGE INJECTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Builds the <script> the loopback server injects into every desktop page,
 * before the page's own scripts run. Pure and testable: given the desktop config
 * and the current login (token + user), it returns the snippet string. It:
 *   1. sets desktop globals (relay URL, platform, API base, ...),
 *   2. exposes the current auth token/user to pages that want them,
 *   3. seeds the login into the localStorage keys the multiplayer client
 *      (`user_token`) and lobby panels (`username`/`display_name`/`kg_avatar`)
 *      read, or clears them when logged out,
 *   4. forwards the legacy v1 board (3d.html) to the fixed v2 engine.
 */

const IDENTITY_KEYS = ['user_token', 'user_id', 'username', 'display_name', 'kg_avatar'];
const GUEST_KEYS = ['kg_guest_token', 'kg_guest_id'];

function buildInjectSnippet({ config = {}, token = null, user = null } = {}) {
  const assigns = Object.entries(config)
    .map(([k, v]) => `window.${k}=${JSON.stringify(v === undefined ? null : v)};`)
    .join('');

  const authGlobals =
    `window.__KG_AUTH_TOKEN__=${JSON.stringify(token || null)};` +
    `window.__KG_AUTH_USER__=${JSON.stringify(user || null)};`;

  let seed;
  if (token) {
    const u = user || {};
    // kg_avatar follows the web convention: a JSON string {emoji,name}. Accept an
    // avatar object, a raw string, or an existing kg_avatar passthrough.
    let kgAvatar = '';
    if (u.avatar && typeof u.avatar === 'object') kgAvatar = JSON.stringify(u.avatar);
    else if (typeof u.avatar === 'string' && u.avatar) kgAvatar = u.avatar;
    else if (u.kg_avatar) kgAvatar = typeof u.kg_avatar === 'string' ? u.kg_avatar : JSON.stringify(u.kg_avatar);
    const kv = {
      user_token: token,
      user_id: String(u.id || u.user_id || u.account_id || ''),
      username: String(u.username || ''),
      display_name: String(u.display_name || u.displayName || u.username || ''),
      kg_avatar: kgAvatar,
    };
    // Only set non-empty values; leaves anything unknown untouched.
    seed = `try{var s=${JSON.stringify(kv)};for(var k in s){if(s[k])localStorage.setItem(k,s[k]);}}catch(e){}`;
  } else {
    // Logged out: purge any lingering identity + guest keys so no stale player
    // leaks into a login-required build.
    const purge = JSON.stringify(IDENTITY_KEYS.concat(GUEST_KEYS));
    seed = `try{${purge}.forEach(function(k){localStorage.removeItem(k);});}catch(e){}`;
  }

  // Desktop plays the fixed v2 engine (no turn-skip). Any landing on the legacy
  // v1 page is forwarded to 3d-v2.html, preserving query + hash.
  const toV2 = "if(location.pathname.replace(/\\/+$/,'').endsWith('/3d.html')){location.replace('3d-v2.html'+location.search+location.hash);}";

  return `<script>${assigns}${authGlobals}${seed}${toV2}</script>`;
}

module.exports = { buildInjectSnippet, IDENTITY_KEYS, GUEST_KEYS };
