/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 FAST TRACK — DIMENSIONAL-PROGRAMMING CORE (proof of concept)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is FastTrack expressed as a PURE manifold derivation, the doctrine of
 * docs/SUBSTRATES.md made literal:
 *
 *     x  — the seed / genesis (one per game; the immutable observer point)
 *     y  — the ordered action log (draws, moves, passes)
 *     z  — the manifested game state, ALWAYS derived on read via `derive`,
 *          never stored mutably and never materialised per-client
 *     m  — the rules manifold (board geometry + card matrix), pure constants
 *
 *     z = derive(x, y)        ← gather: fold the action log over the genesis
 *
 * Every legacy bug class (MP divergence, isBot flapping, turn-authority races,
 * snapshot clobber) is structurally impossible here: two observers holding the
 * same (seed, actions) derive the IDENTICAL z. There is nothing to reconcile.
 *
 * Purity contract:
 *   - No DOM, no clock, no Math.random. The only randomness is the seed-derived
 *     deterministic deck shuffle (ManifoldCodec.seededShuffle).
 *   - `derive`, `step`, and every lens are pure: same inputs → same output, on
 *     every surface (Node lobby, browser view), input never mutated.
 *
 * Scope (this PoC): holding/enter, clockwise perimeter travel, Card-4 backward,
 * circuit-completion eligibility, exact-landing safe-zone entry, win, turn
 * rotation + extra-turn, and forced pass on no legal move. The FastTrack ring,
 * bullseye, and 7-split are layered on as additional lenses (see LENS TODOs);
 * the architecture above does not change to add them.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

(function (root, factory) {
  const ManifoldCodec = (typeof require === 'function')
    ? require('../../js/manifold-codec.js')
    : (root.ManifoldCodec);
  const mod = factory(ManifoldCodec);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.FTManifold = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ManifoldCodec) {

  // ═══════════════════════════════════════════════════════════════════════════
  // m — THE RULES MANIFOLD (pure geometry + card matrix)
  // ═══════════════════════════════════════════════════════════════════════════

  const PEGS_PER_PLAYER = 5;
  const SAFE_ZONE_SIZE = 4;
  const PLAYER_COLORS = ['#FFC000', '#0050B5', '#CC0000', '#4B0082', '#A0522D', '#006400'];
  const PLAYER_NAMES = ['Yellow', 'Blue', 'Red', 'Purple', 'Orange', 'Green'];

  // The 84-hole ordered ring, identical topology to the legacy board: 14 holes
  // per wedge × 6 wedges. Clockwise index order within wedge p:
  //   ft-{p}, side-left-{p}-4..1, outer-{p}-0..3, home-{p}, side-right-{p}-1..4
  const TRACK = (() => {
    const t = [];
    for (let p = 0; p < 6; p++) {
      t.push(`ft-${p}`);
      for (let h = 4; h >= 1; h--) t.push(`side-left-${p}-${h}`);
      for (let h = 0; h < 4; h++) t.push(`outer-${p}-${h}`);
      t.push(`home-${p}`);
      for (let h = 1; h <= 4; h++) t.push(`side-right-${p}-${h}`);
    }
    return t; // 84
  })();
  const TRACK_INDEX = (() => {
    const m = Object.create(null);
    TRACK.forEach((h, i) => { m[h] = i; });
    return m;
  })();

  // Per-player landmarks, derived from board position (bp).
  const homeHole = (bp) => `home-${bp}`;
  const safeEntrance = (bp) => `outer-${bp}-2`;        // entrance hole on the rim
  const safeHole = (bp, k) => `safe-${bp}-${k}`;       // k = 1..4

  // Card matrix (the deck's rules), mirroring fasttrack.rules.json. `enter`
  // releases a peg from holding; `extra` grants the same player another turn.
  const CARD_DEFS = {
    A: { steps: 1, dir: 'cw', enter: true, extra: true },
    2: { steps: 2, dir: 'cw' },
    3: { steps: 3, dir: 'cw' },
    4: { steps: 4, dir: 'back' },
    5: { steps: 5, dir: 'cw' },
    6: { steps: 6, dir: 'cw', enter: true, extra: true },
    7: { steps: 7, dir: 'cw', split: true },
    8: { steps: 8, dir: 'cw' },
    9: { steps: 9, dir: 'cw' },
    10: { steps: 10, dir: 'cw' },
    J: { steps: 1, dir: 'cw', extra: true },
    Q: { steps: 1, dir: 'cw', extra: true },
    K: { steps: 1, dir: 'cw', extra: true },
    JOKER: { steps: 1, dir: 'cw', enter: true, extra: true },
  };
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = ['H', 'D', 'C', 'S'];

  // The 53-card deck (user_directive_2026-06-06): 52 standard + 1 joker. Order
  // here is canonical; each pass is shuffled by the manifold randomiser.
  function buildDeck() {
    const cards = [];
    for (const s of SUITS) for (const r of RANKS) cards.push(`${r}${s}`);
    cards.push('JOKER');               // single joker → 53 cards
    return cards;
  }
  const rankOf = (card) => card.startsWith('JOKER') ? 'JOKER' : card.slice(0, -1);

  // The card at a global draw index. Drawing is WITHOUT replacement within a
  // pass (a full 53-card permutation → no card repeats until the deck is
  // exhausted), and each exhaustion RESHUFFLES the whole deck with a fresh,
  // manifold-derived seed (`seed:pass`). The shuffle is the canonical manifold
  // randomiser (ManifoldCodec) — true-random given the genesis seed — yet the
  // whole thing stays a pure deterministic projection of (seed, drawCount), so
  // every observer still derives the identical card stream.
  function cardAt(g, drawCount) {
    const N = g.deck.length;
    const pass = Math.floor(drawCount / N);
    const pos = drawCount % N;
    if (pass === 0) return g.deck[pos];
    const reshuffled = (ManifoldCodec && ManifoldCodec.seededShuffle)
      ? ManifoldCodec.seededShuffle(buildDeck(), g.seed + ':' + pass)
      : g.deck;
    return reshuffled[pos];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // x — THE GENESIS (seed → immutable game start)
  // ═══════════════════════════════════════════════════════════════════════════

  // roster: [{ id, name?, isBot? }, ...]  (2..6 players)
  // The deck order is a pure projection of the seed, so every observer derives
  // the same cards in the same order — the cure for per-client shuffles.
  function genesis(seed, roster) {
    if (!Array.isArray(roster) || roster.length < 2 || roster.length > 6) {
      throw new Error('FTManifold: roster must have 2..6 players');
    }
    const count = roster.length;
    const seats = roster.map((p, i) => ({
      idx: i,
      id: p.id != null ? String(p.id) : `seat-${i}`,
      name: p.name || PLAYER_NAMES[balancedBp(i, count)],
      isBot: !!p.isBot,
      bp: balancedBp(i, count),
      color: PLAYER_COLORS[balancedBp(i, count)],
    }));
    const deck = ManifoldCodec && ManifoldCodec.seededShuffle
      ? ManifoldCodec.seededShuffle(buildDeck(), String(seed))
      : buildDeck();
    return Object.freeze({ seed: String(seed), seats, count, deck: Object.freeze(deck.slice()) });
  }

  function balancedBp(idx, count) {
    if (count === 2) return [0, 3][idx];
    if (count === 3) return [0, 2, 4][idx];
    if (count === 4) return [0, 1, 3, 4][idx];
    if (count === 5) return [0, 1, 2, 3, 4][idx];
    return idx;
  }

  // The z₀ projection of the genesis: 1 peg on home, 4 in holding, per player.
  function initialZ(g) {
    const pegs = {};
    for (const seat of g.seats) {
      for (let k = 0; k < PEGS_PER_PLAYER; k++) {
        const id = `p${seat.idx}-${k}`;
        pegs[id] = k === 0
          ? { hole: homeHole(seat.bp), eligible: false }  // the home peg starts un-circuited
          : { hole: 'holding', eligible: false };
      }
    }
    return {
      turnIdx: 0,          // index into g.seats — whose turn
      phase: 'draw',       // 'draw' → must draw; 'move' → must play/pass
      drawCount: 0,        // cards consumed from g.deck
      card: null,          // current drawn rank def, or null
      pegs,
      winner: null,        // seat idx, or null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // m (lens) — DERIVED LEGAL MOVES  (z → options, never stored)
  // ═══════════════════════════════════════════════════════════════════════════

  // Walk `steps` along the OUTER RING from startHole, honouring circuit
  // completion + exact-landing safe-zone entry. Pure. Returns {path,dest,eligible}
  // or null (blocked / illegal overshoot).
  function walkPerimeter(z, g, seat, startHole, steps, dir, startEligible) {
    const bp = seat.bp;
    let idx = TRACK_INDEX[startHole];
    if (idx == null) return null;
    if (steps === 0) return { path: [], dest: startHole, eligible: !!startEligible };
    const safeFull = pegsInSafe(z, seat) >= SAFE_ZONE_SIZE;
    const entrance = safeEntrance(bp);
    const path = [];
    let elig = !!startEligible;

    if (dir === 'back') {
      // Card-4: counter-clockwise. Passing the entrance confers eligibility,
      // but a peg cannot back INTO the safe zone.
      for (let s = 0; s < steps; s++) {
        idx = (idx - 1 + TRACK.length) % TRACK.length;
        const hole = TRACK[idx];
        if (occupiedBySelf(z, seat, hole) && s === steps - 1) return null;
        path.push(hole);
        if (hole === entrance) elig = true;
      }
      return { path, dest: path[path.length - 1], eligible: elig };
    }

    for (let s = 0; s < steps; s++) {
      const nextIdx = (idx + 1) % TRACK.length;
      const nextHole = TRACK[nextIdx];
      // An eligible peg reaching its own entrance peels off into the home stretch.
      if (nextHole === entrance && elig) {
        path.push(entrance);
        const remaining = steps - s - 1;
        if (!safeFull) {
          if (remaining > SAFE_ZONE_SIZE) return null;
          for (let h = 1; h <= remaining; h++) {
            const sh = safeHole(bp, h);
            if (occupiedBySelf(z, seat, sh)) return null;
            path.push(sh);
          }
          return { path, dest: path[path.length - 1], eligible: true };
        }
        if (remaining === 0) return { path, dest: entrance, eligible: true };
        if (remaining === 1) { path.push(`outer-${bp}-3`); return { path, dest: `outer-${bp}-3`, eligible: true }; }
        if (remaining === 2) { path.push(`outer-${bp}-3`, homeHole(bp)); return { path, dest: homeHole(bp), eligible: true }; }
        return null;
      }
      idx = nextIdx;
      if (occupiedBySelf(z, seat, nextHole) && s === steps - 1) return null;
      path.push(nextHole);
      if (nextHole === entrance) elig = true;
    }
    return { path, dest: path[path.length - 1], eligible: elig };
  }

  // FastTrack inner ring. A peg on ft-X may travel the inner ring
  // (ft-X → ft-(X+1) → …) and LEAVE at any hop k = 0..min(steps, D), where D is
  // the ring distance to the player's own ft-{bp}. For k < D it drops back onto
  // the rim at the foreign ft-(X+k) and continues steps-k there; for k = D it has
  // COMPLETED the fast track (now eligible) and continues down its home stretch.
  // (FT_EXIT_ANY_HOLE.) Own pegs on ring holes are passable; only landing on one
  // is blocked. Returns an array of {path, dest, eligible}. Pure.
  function ftRingOptions(z, g, seat, peg, steps) {
    const bp = seat.bp;
    const X = parseInt(peg.hole.slice(3), 10);
    if (!Number.isFinite(X)) return [];
    const D = (bp - X + 6) % 6;
    const opts = [];
    const kMax = Math.min(steps, D);
    for (let k = 0; k <= kMax; k++) {
      const ring = [];
      for (let i = 1; i <= k; i++) ring.push(`ft-${(X + i) % 6}`);
      const exitFt = `ft-${(X + k) % 6}`;
      const reachedOwn = k === D;
      const rest = steps - k;
      if (rest === 0) {
        if (occupiedBySelf(z, seat, exitFt)) continue;     // can't land on own peg
        opts.push({ path: ring.slice(), dest: exitFt, eligible: peg.eligible || reachedOwn });
        continue;
      }
      const cont = walkPerimeter(z, g, seat, exitFt, rest, 'cw', peg.eligible || reachedOwn);
      if (!cont) continue;
      opts.push({ path: ring.concat(cont.path), dest: cont.dest, eligible: cont.eligible });
    }
    return opts;
  }

  // Dispatch travel for a single peg (safe interior, or the outer ring).
  function walk(z, g, seat, peg, steps, dir) {
    if (peg.hole === 'holding') return null;
    const safeMatch = /^safe-(\d+)-(\d+)$/.exec(peg.hole);
    if (safeMatch) {
      if (dir !== 'cw') return null;
      const at = parseInt(safeMatch[2], 10);
      const target = at + steps;
      if (target > SAFE_ZONE_SIZE) return null;
      const path = [];
      for (let s = at + 1; s <= target; s++) path.push(safeHole(seat.bp, s));
      const dest = path[path.length - 1];
      return occupiedBySelf(z, seat, dest) ? null : { path, dest, eligible: peg.eligible };
    }
    return walkPerimeter(z, g, seat, peg.hole, steps, dir, peg.eligible);
  }

  // The lens: every legal move for the current seat under the drawn card.
  function legalMoves(z, g) {
    if (z.winner != null || z.phase !== 'move' || !z.card) return [];
    const seat = g.seats[z.turnIdx];
    const def = CARD_DEFS[z.card];
    if (!def) return [];
    const moves = [];

    for (let k = 0; k < PEGS_PER_PLAYER; k++) {
      const pegId = `p${seat.idx}-${k}`;
      const peg = z.pegs[pegId];
      if (!peg) continue;

      // Enter from holding onto the home hole (A / 6 / Joker).
      if (peg.hole === 'holding') {
        if (def.enter && !occupiedBySelf(z, seat, homeHole(seat.bp))) {
          moves.push({ pegId, dest: homeHole(seat.bp), path: [homeHole(seat.bp)], type: 'enter' });
        }
        continue;
      }
      // FastTrack inner ring (forward cards only): a peg ON an ft-* hole
      // traverses the ring with leave-at-k options. A Card-4 backward from an
      // ft hole falls through to the rim walk below.
      if (peg.hole.startsWith('ft-') && def.dir !== 'back') {
        for (const o of ftRingOptions(z, g, seat, peg, def.steps)) {
          moves.push({ pegId, dest: o.dest, path: o.path, type: 'ft', eligible: o.eligible });
        }
        continue;
      }
      // Outer-ring travel.
      const w = walk(z, g, seat, peg, def.steps, def.dir === 'back' ? 'back' : 'cw');
      if (w) moves.push({ pegId, dest: w.dest, path: w.path, type: 'move', eligible: w.eligible });
    }
    // (LENS TODO) bullseye entry + the Card-7 split slot in here as further
    // projections of the same z — no change to the derive/step machinery below.
    return moves;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // z — THE PURE STEP + DERIVE  (fold the action log over the genesis)
  // ═══════════════════════════════════════════════════════════════════════════

  // action: { type:'draw' } | { type:'move', pegId, dest } | { type:'pass' }
  function step(z, g, action) {
    if (z.winner != null) return z;

    if (action.type === 'draw') {
      if (z.phase !== 'draw') return z;
      const card = cardAt(g, z.drawCount);   // no repeats within a pass; reshuffles on exhaustion
      return { ...z, phase: 'move', card: rankOf(card), drawCount: z.drawCount + 1 };
    }

    if (action.type === 'move') {
      if (z.phase !== 'move' || !z.card) return z;
      const legal = legalMoves(z, g).find(m => m.pegId === action.pegId && m.dest === action.dest);
      if (!legal) return z;                                  // illegal → identity (purity guard)
      const seat = g.seats[z.turnIdx];
      const def = CARD_DEFS[z.card];
      const pegs = { ...z.pegs };
      const prev = pegs[action.pegId];
      // Circuit completion: passing the entrance (this move or before) sticks.
      const crossedEntrance = (legal.path || []).includes(safeEntrance(seat.bp));
      pegs[action.pegId] = {
        hole: legal.dest,
        eligible: prev.eligible || crossedEntrance || legal.eligible === true,
      };
      const winner = isWin(pegs, seat) ? seat.idx : null;
      const next = { ...z, pegs, card: null, phase: 'draw', winner };
      if (winner == null && !def.extra) next.turnIdx = (z.turnIdx + 1) % g.count;
      return next;
    }

    if (action.type === 'pass') {
      if (z.phase !== 'move') return z;
      return { ...z, card: null, phase: 'draw', turnIdx: (z.turnIdx + 1) % g.count };
    }

    return z;
  }

  // z = derive(x, y): the canonical projection. Recomputed from inputs every
  // call; nothing persisted between calls. This IS the manifold read.
  function derive(g, actions) {
    let z = initialZ(g);
    const log = Array.isArray(actions) ? actions : [];
    for (let i = 0; i < log.length; i++) z = step(z, g, log[i]);
    return z;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // small pure helpers
  // ═══════════════════════════════════════════════════════════════════════════
  function occupiedBySelf(z, seat, hole) {
    for (let k = 0; k < PEGS_PER_PLAYER; k++) {
      const p = z.pegs[`p${seat.idx}-${k}`];
      if (p && p.hole === hole) return true;
    }
    return false;
  }
  function pegsInSafe(z, seat) {
    let n = 0;
    for (let k = 0; k < PEGS_PER_PLAYER; k++) {
      const p = z.pegs[`p${seat.idx}-${k}`];
      if (p && /^safe-\d+-\d+$/.test(p.hole)) n++;
    }
    return n;
  }
  function isWin(pegs, seat) {
    let inSafe = 0, onHome = 0;
    for (let k = 0; k < PEGS_PER_PLAYER; k++) {
      const p = pegs[`p${seat.idx}-${k}`];
      if (!p) continue;
      if (/^safe-\d+-\d+$/.test(p.hole)) inSafe++;
      else if (p.hole === homeHole(seat.bp) && p.eligible) onHome++;
    }
    return inSafe >= SAFE_ZONE_SIZE && onHome > 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW lens — a flat, render-ready projection (what the 3D adapter reads)
  // ═══════════════════════════════════════════════════════════════════════════
  function view(z, g) {
    const seat = g.seats[z.turnIdx];
    return {
      seed: g.seed,
      players: g.seats.map(s => ({
        idx: s.idx, name: s.name, color: s.color, bp: s.bp, isBot: s.isBot,
        pegs: Array.from({ length: PEGS_PER_PLAYER }, (_, k) => {
          const p = z.pegs[`p${s.idx}-${k}`];
          return { id: `p${s.idx}-${k}`, hole: p.hole, eligible: p.eligible };
        }),
      })),
      current: z.turnIdx,
      currentSeatId: seat.id,
      phase: z.phase,
      card: z.card,
      winner: z.winner,
      legalMoves: legalMoves(z, g),
    };
  }

  return {
    // doctrine handles
    genesis, derive, step, view,
    // lenses
    legalMoves, isWin,
    // manifold constants (read-only)
    TRACK, CARD_DEFS, PEGS_PER_PLAYER, SAFE_ZONE_SIZE,
    homeHole, safeEntrance, safeHole, balancedBp, buildDeck, cardAt,
  };
});
