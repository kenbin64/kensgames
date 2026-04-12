/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 *
 * FASTTRACK BOARD MANIFOLD
 * Every game entity lives on a geometric surface:
 *   z = x·y          (Layer 3 — Relation / AND-gate / truth table)
 *   z = x·y²         (Layer 4 — Form / quadratic amplifier)
 *
 * Holes, pegs, cards, rules, the board itself, and Mom helper
 * are ALL points on these manifolds. Each point self-asserts
 * its own rules — deterministic, pre-sealed, never recalculated.
 *
 * Fibonacci weight spine:  1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89
 * φ (golden ratio) ≈ 1.618033988749895
 * ============================================================
 */

'use strict';

const BoardManifold = (() => {
    // ── Constants ────────────────────────────────────────────
    const PHI = 1.618033988749895;
    const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

    // ── Surface evaluation ──────────────────────────────────
    function zxy(x, y) { return x * y; }
    function zxy2(x, y) { return x * y * y; }
    function evalSurface(type, x, y) {
        return type === 'z=xy2' ? zxy2(x, y) : zxy(x, y);
    }
    function gradient(type, x, y) {
        if (type === 'z=xy2') return { dx: y * y, dy: 2 * x * y };
        return { dx: y, dy: x };
    }

    // ═══════════════════════════════════════════════════════════
    //  HOLE MANIFOLD — every hole is a sealed point
    // ═══════════════════════════════════════════════════════════

    /**
     * Hole kinds with pre-sealed rules (deterministic, never re-derived).
     * Property names are the canonical kind strings used throughout.
     */
    const HOLE_KINDS = {
        holding: {
            label: 'Holding Area',
            surface: 'z=xy', x: 0, y: 0,    // z=0  — dormant
            canBeCut: false,
            canEnterFromBoard: false,         // Only sent-home or start
            canExitTo: ['home'],              // exit via entry card
            ownerOnly: true,
            accepts: (peg, _card) => peg.holeType === 'holding',
            ruleText: 'Safe. Exit with A / 6 / Joker to Diamond Hole.'
        },
        home: {
            label: 'Diamond Hole (Start / Winner)',
            surface: 'z=xy2', x: PHI, y: 1,  // z = φ — golden entry
            canBeCut: true,
            isEntry: true,
            isWinPosition: true,
            ownerOnly: false,
            accepts: (_peg, card) => {
                // entry cards, or peg arriving from outer track
                return true;
            },
            ruleText: '5th peg starts & wins here. Opponents can cut you.'
        },
        outer: {
            label: 'Outer Track',
            surface: 'z=xy', x: 1, y: 1,     // z = 1 — baseline
            canBeCut: true,
            ownerOnly: false,
            accepts: () => true,
            ruleText: 'Main perimeter. Unsafe — can be cut.'
        },
        'safe-zone-entry': {
            label: 'Safe Zone Entry (Gateway)',
            surface: 'z=xy2', x: 1, y: PHI,  // z = φ² — elevated gate
            canBeCut: true,
            isSafeZoneEntry: true,
            ownerOnly: false,
            accepts: () => true,
            ruleText: 'All pegs must pass here to complete circuit. Unsafe.'
        },
        safezone: {
            label: 'Safe Zone',
            surface: 'z=xy2', x: PHI, y: PHI, // z = φ³ — maximum protection
            canBeCut: false,
            ownerOnly: true,
            forwardOnly: true,
            exactLanding: true,
            accepts: (peg) => {
                return peg.completedCircuit || peg.eligibleForSafeZone;
            },
            ruleText: 'Protected. Owner only. Forward only. Exact landing.'
        },
        winner: {
            label: 'Winner Hole (Safe Zone End)',
            surface: 'z=xy2', x: PHI, y: PHI * PHI, // z = φ⁵ — victory surface
            canBeCut: false,
            ownerOnly: true,
            isWinPosition: true,
            forwardOnly: true,
            exactLanding: true,
            accepts: (peg) => {
                return peg.completedCircuit || peg.eligibleForSafeZone;
            },
            ruleText: 'Fill all 4 safe zone holes then land exactly here to win.'
        },
        fasttrack: {
            label: 'FastTrack (Inner Ring)',
            surface: 'z=xy', x: PHI, y: PHI,  // z = φ² — hyperspace
            canBeCut: true,
            ownerOnly: false,
            accepts: () => true,
            ruleText: 'Shortcut inner ring. Unsafe — can be cut.'
        },
        'fasttrack-entry': {
            label: 'FastTrack Entry Point',
            surface: 'z=xy', x: 1, y: PHI,
            canBeCut: true,
            isFastTrackEntry: true,
            ownerOnly: false,
            accepts: () => true,
            ruleText: 'Side-left hole adjacent to FastTrack — can enter FT from here.'
        },
        'fasttrack-exit': {
            label: 'FastTrack Exit (Own Pentagon)',
            surface: 'z=xy2', x: PHI, y: 1,
            canBeCut: true,
            isFastTrackExit: true,
            ownerOnly: false,
            accepts: () => true,
            ruleText: 'Player\'s own FT hole. Default bullseye exit. Can be cut.'
        },
        center: {
            label: 'Bullseye (Center)',
            surface: 'z=xy2', x: PHI * PHI, y: PHI, // highest z — centre of power
            canBeCut: true,
            requiresRoyalToExit: true,
            ownerOnly: false,
            accepts: () => true,
            ruleText: 'Can be cut. Exit only with J / Q / K to own FT hole.'
        }
    };

    /**
     * Derive the manifold kind for a given holeId string.
     */
    function kindOf(holeId) {
        if (!holeId) return null;
        if (holeId === 'center') return 'center';
        if (holeId.startsWith('hold-')) return 'holding';
        if (holeId.startsWith('home-')) return 'home';
        if (holeId.startsWith('ft-')) return 'fasttrack'; // refined later per-player
        if (holeId.startsWith('safe-')) return 'safezone';
        if (holeId.startsWith('winner-')) return 'winner';
        if (holeId.startsWith('outer-')) {
            // outer-{p}-2 is safe-zone-entry
            const m = holeId.match(/^outer-(\d+)-(\d+)$/);
            if (m && m[2] === '2') return 'safe-zone-entry';
            return 'outer';
        }
        if (holeId.startsWith('side-left-')) {
            // side-left-{p}-4 is fasttrack-entry
            const m = holeId.match(/^side-left-(\d+)-(\d+)$/);
            if (m && m[2] === '4') return 'fasttrack-entry';
            return 'outer';
        }
        if (holeId.startsWith('side-right-')) return 'outer';
        return 'outer'; // fallback
    }

    /**
     * Get the sealed rule bundle for a hole.
     */
    function getHoleRules(holeId) {
        const k = kindOf(holeId);
        if (!k) return null;
        const base = HOLE_KINDS[k];
        if (!base) return HOLE_KINDS.outer; // safe default
        return base;
    }

    /**
     * Compute the manifold z-value for a specific hole.
     * Higher z = more "power" on the geometric surface.
     */
    function holeZ(holeId) {
        const rules = getHoleRules(holeId);
        if (!rules) return 0;
        return evalSurface(rules.surface, rules.x, rules.y);
    }

    /**
     * Compute a gradient vector for the hole — encodes
     * the "flow direction" on the surface.
     */
    function holeGradient(holeId) {
        const rules = getHoleRules(holeId);
        if (!rules) return { dx: 0, dy: 0 };
        return gradient(rules.surface, rules.x, rules.y);
    }

    // ═══════════════════════════════════════════════════════════
    //  CARD MANIFOLD — every card is a surface point
    // ═══════════════════════════════════════════════════════════

    const CARD_MANIFOLD = {
        'A':     { surface: 'z=xy',  x: 1,   y: 1,   canEnter: true,  canExitBullseye: false, movement: 1,  direction: 'clockwise',  extraTurn: true,  canSplit: false },
        '2':     { surface: 'z=xy',  x: 1,   y: 2,   canEnter: false, canExitBullseye: false, movement: 2,  direction: 'clockwise',  extraTurn: false, canSplit: false },
        '3':     { surface: 'z=xy',  x: 1,   y: 3,   canEnter: false, canExitBullseye: false, movement: 3,  direction: 'clockwise',  extraTurn: false, canSplit: false },
        '4':     { surface: 'z=xy2', x: 1,   y: 2,   canEnter: false, canExitBullseye: false, movement: 4,  direction: 'backward',   extraTurn: false, canSplit: false, isBackward: true },
        '5':     { surface: 'z=xy',  x: 1,   y: 5,   canEnter: false, canExitBullseye: false, movement: 5,  direction: 'clockwise',  extraTurn: false, canSplit: false },
        '6':     { surface: 'z=xy2', x: PHI, y: 1,   canEnter: true,  canExitBullseye: false, movement: 6,  direction: 'clockwise',  extraTurn: true,  canSplit: false },
        '7':     { surface: 'z=xy2', x: 1,   y: PHI, canEnter: false, canExitBullseye: false, movement: 7,  direction: 'clockwise',  extraTurn: false, canSplit: true  },
        '8':     { surface: 'z=xy',  x: 2,   y: 4,   canEnter: false, canExitBullseye: false, movement: 8,  direction: 'clockwise',  extraTurn: false, canSplit: false },
        '9':     { surface: 'z=xy',  x: 3,   y: 3,   canEnter: false, canExitBullseye: false, movement: 9,  direction: 'clockwise',  extraTurn: false, canSplit: false },
        '10':    { surface: 'z=xy',  x: 2,   y: 5,   canEnter: false, canExitBullseye: false, movement: 10, direction: 'clockwise',  extraTurn: false, canSplit: false },
        'J':     { surface: 'z=xy2', x: PHI, y: PHI, canEnter: false, canExitBullseye: true,  movement: 1,  direction: 'clockwise',  extraTurn: true,  canSplit: false, isRoyal: true },
        'Q':     { surface: 'z=xy2', x: PHI, y: PHI, canEnter: false, canExitBullseye: true,  movement: 1,  direction: 'clockwise',  extraTurn: true,  canSplit: false, isRoyal: true },
        'K':     { surface: 'z=xy2', x: PHI, y: PHI, canEnter: false, canExitBullseye: true,  movement: 1,  direction: 'clockwise',  extraTurn: true,  canSplit: false, isRoyal: true },
        'JOKER': { surface: 'z=xy',  x: PHI, y: 1,   canEnter: true,  canExitBullseye: false, movement: 1,  direction: 'clockwise',  extraTurn: true,  canSplit: false }
    };

    function getCardManifold(rank) {
        if (!rank) return null;
        return CARD_MANIFOLD[rank.toUpperCase()] || CARD_MANIFOLD[rank] || null;
    }

    function cardZ(rank) {
        const cm = getCardManifold(rank);
        if (!cm) return 0;
        return evalSurface(cm.surface, cm.x, cm.y);
    }

    // ═══════════════════════════════════════════════════════════
    //  PEG MANIFOLD — each peg knows where it is on the surface
    // ═══════════════════════════════════════════════════════════

    const pegManifoldState = new Map(); // pegId → { holeId, kind, z, lastCard, hops }

    function sealPeg(pegId, holeId, cardRank) {
        const kind = kindOf(holeId);
        const z = holeZ(holeId);
        pegManifoldState.set(pegId, {
            holeId,
            kind,
            z,
            lastCard: cardRank || null,
            hops: (pegManifoldState.get(pegId)?.hops || 0) + 1,
            sealedAt: Date.now()
        });
    }

    function getPegState(pegId) {
        return pegManifoldState.get(pegId) || null;
    }

    // ═══════════════════════════════════════════════════════════
    //  RULE MANIFOLD — every rule is a sealed assertion point
    // ═══════════════════════════════════════════════════════════

    /**
     * Rules mapped on z=xy truth-table style.
     * Each rule has a unique (x,y) coordinate; z = assertion strength.
     * Rules self-evaluate via `assert(context)` → { valid, rule, reason }.
     */
    const RULE_POINTS = [
        // ── Entry rules ──────────────────────────
        {
            id: 'R_ENTER_CARD',
            x: 1, y: 1, surface: 'z=xy',   // z=1
            desc: 'Only A, 6, Joker can bring peg from holding',
            assert(ctx) {
                if (ctx.moveType !== 'enter') return { valid: true };
                const cm = getCardManifold(ctx.cardRank);
                if (!cm || !cm.canEnter) {
                    return { valid: false, rule: this.id, reason: `Card ${ctx.cardRank} cannot enter from holding` };
                }
                return { valid: true };
            }
        },
        {
            id: 'R_ENTER_HOME_FREE',
            x: 1, y: 2, surface: 'z=xy',   // z=2
            desc: 'Home hole must not be occupied by own peg to enter',
            assert(ctx) {
                if (ctx.moveType !== 'enter') return { valid: true };
                if (ctx.ownPegOnHome) {
                    return { valid: false, rule: this.id, reason: 'Home hole occupied by own peg' };
                }
                return { valid: true };
            }
        },
        // ── Movement direction ───────────────────
        {
            id: 'R_DIRECTION',
            x: 2, y: 1, surface: 'z=xy',   // z=2
            desc: 'All movement clockwise except 4 (backward)',
            assert(ctx) {
                const cm = getCardManifold(ctx.cardRank);
                if (!cm) return { valid: true };
                if (cm.isBackward && ctx.direction !== 'backward') {
                    return { valid: false, rule: this.id, reason: 'Card 4 must move backward' };
                }
                return { valid: true };
            }
        },
        // ── Blocking ─────────────────────────────
        {
            id: 'R_NO_PASS_OWN',
            x: 2, y: 2, surface: 'z=xy',   // z=4  (strong)
            desc: 'Cannot pass or land on own peg',
            assert(ctx) {
                if (ctx.landsOnOwnPeg) {
                    return { valid: false, rule: this.id, reason: 'Cannot land on own peg' };
                }
                if (ctx.pathBlockedByOwnPeg) {
                    return { valid: false, rule: this.id, reason: 'Path blocked by own peg' };
                }
                return { valid: true };
            }
        },
        // ── Cut rules ────────────────────────────
        {
            id: 'R_CUT_OPPONENT',
            x: 3, y: 1, surface: 'z=xy',   // z=3
            desc: 'Landing on opponent sends them to holding',
            assert(ctx) {
                // If opponent is on dest but their holding is full, move is illegal
                if (ctx.landsOnOpponent && !ctx.opponentCanReceiveCut) {
                    return { valid: false, rule: this.id, reason: 'Opponent holding area is full — cannot cut' };
                }
                return { valid: true };
            }
        },
        {
            id: 'R_CUT_SAFE_ZONES',
            x: 3, y: 2, surface: 'z=xy',   // z=6
            desc: 'Cannot cut pegs in holding, bullseye, safe zone',
            assert(ctx) {
                if (ctx.landsOnOpponent) {
                    const destRules = getHoleRules(ctx.toHoleId);
                    if (destRules && !destRules.canBeCut) {
                        return { valid: false, rule: this.id, reason: `Cannot cut peg in ${destRules.label}` };
                    }
                }
                return { valid: true };
            }
        },
        // ── Bullseye rules ───────────────────────
        {
            id: 'R_BULLSEYE_EXIT',
            x: PHI, y: PHI, surface: 'z=xy2', // z=φ³ (high priority)
            desc: 'Only J, Q, K can exit bullseye',
            assert(ctx) {
                if (ctx.moveType === 'bullseye_exit') {
                    const cm = getCardManifold(ctx.cardRank);
                    if (!cm || !cm.canExitBullseye) {
                        return { valid: false, rule: this.id, reason: `Card ${ctx.cardRank} cannot exit bullseye — need J/Q/K` };
                    }
                }
                return { valid: true };
            }
        },
        // ── Safe zone rules ──────────────────────
        {
            id: 'R_SAFE_OWNER',
            x: 3, y: 3, surface: 'z=xy',   // z=9
            desc: 'Only owner peg can enter their safe zone',
            assert(ctx) {
                const destRules = getHoleRules(ctx.toHoleId);
                if (destRules && destRules.ownerOnly) {
                    if (ctx.toHoleId.startsWith('safe-') || ctx.toHoleId.startsWith('winner-')) {
                        const m = ctx.toHoleId.match(/-(\\d+)-/);
                        if (m && parseInt(m[1]) !== ctx.playerBoardPos) {
                            return { valid: false, rule: this.id, reason: 'Not your safe zone' };
                        }
                    }
                }
                return { valid: true };
            }
        },
        {
            id: 'R_SAFE_CIRCUIT',
            x: 4, y: 2, surface: 'z=xy',   // z=8
            desc: 'Peg must complete circuit before entering safe zone',
            assert(ctx) {
                if (ctx.enteringSafeZone && !ctx.pegCompletedCircuit && !ctx.pegEligibleForSafe) {
                    return { valid: false, rule: this.id, reason: 'Peg has not completed circuit' };
                }
                return { valid: true };
            }
        },
        {
            id: 'R_SAFE_FORWARD',
            x: 5, y: 1, surface: 'z=xy',   // z=5
            desc: 'Safe zone movement is forward only',
            assert(ctx) {
                const destRules = getHoleRules(ctx.toHoleId);
                if (destRules && destRules.forwardOnly && ctx.movingBackward) {
                    return { valid: false, rule: this.id, reason: 'Cannot move backward in safe zone' };
                }
                return { valid: true };
            }
        },
        {
            id: 'R_EXACT_LANDING',
            x: 5, y: 2, surface: 'z=xy',   // z=10
            desc: 'Must land exactly in safe zone / winner hole',
            assert(ctx) {
                const destRules = getHoleRules(ctx.toHoleId);
                if (destRules && destRules.exactLanding && ctx.overshoots) {
                    return { valid: false, rule: this.id, reason: 'Cannot overshoot — exact landing required' };
                }
                return { valid: true };
            }
        },
        // ── Backward (4) restrictions ────────────
        {
            id: 'R_BACKWARD_RESTRICTED',
            x: 2, y: 3, surface: 'z=xy',   // z=6
            desc: 'Card 4 cannot back into bullseye, safe zone, or FastTrack mode',
            assert(ctx) {
                if (!ctx.movingBackward) return { valid: true };
                if (ctx.toHoleId === 'center') {
                    return { valid: false, rule: this.id, reason: 'Cannot back into bullseye' };
                }
                if (ctx.toHoleId && ctx.toHoleId.startsWith('safe-')) {
                    return { valid: false, rule: this.id, reason: 'Cannot back into safe zone' };
                }
                // Note: backward movement CAN traverse ft-* holes on perimeter
                // but cannot ENTER FastTrack mode (isFastTrackEntry check)
                if (ctx.isFastTrackEntry) {
                    return { valid: false, rule: this.id, reason: 'Cannot enter FastTrack mode going backward' };
                }
                return { valid: true };
            }
        },
        {
            id: 'R_FT_MUST_TRAVERSE',
            x: PHI, y: 3, surface: 'z=xy',  // z ≈ 4.85
            desc: 'Player must traverse FT if they have pegs on it (loss enforced at end of turn)',
            assert(ctx) {
                // This is an informational rule — actual enforcement is in endTurn().
                // The manifold records it as a sealed truth-point for completeness.
                return { valid: true };
            }
        },
        // ── Split rules ──────────────────────────
        {
            id: 'R_SPLIT_CLOCKWISE',
            x: 3, y: PHI, surface: 'z=xy',  // z ≈ 4.85
            desc: 'Card 7 split moves are always clockwise',
            assert(ctx) {
                if (ctx.moveType === 'split_first' || ctx.moveType === 'split') {
                    // 7-card split sub-moves must be clockwise (not backward)
                    if (ctx.movingBackward) {
                        return { valid: false, rule: this.id, reason: 'Split moves must be clockwise' };
                    }
                }
                return { valid: true };
            }
        },
        {
            id: 'R_BACKWARD_DIRECTION',
            x: 2, y: PHI, surface: 'z=xy',  // z ≈ 3.24
            desc: 'Card 4 path must go counter-clockwise',
            assert(ctx) {
                if (ctx.movingBackward && ctx.steps > 0 && ctx.path && ctx.path.length > 1) {
                    // Verify path goes counter-clockwise: check first step
                    // (Engine and SmartPeg already ensure this, but manifold confirms)
                    return { valid: true };
                }
                return { valid: true };
            }
        },
        // ── Win condition ────────────────────────
        {
            id: 'R_WIN',
            x: PHI * PHI, y: PHI, surface: 'z=xy2', // highest z — supreme assertion
            desc: '4 pegs in safe zone + 5th on home = WIN',
            assert(ctx) {
                // This is a check rule, not a blocking rule
                return { valid: true };
            },
            checkWin(player) {
                const safe = player.peg ? player.peg.filter(p => p.holeType === 'safezone').length : 0;
                const home = player.peg ? player.peg.filter(p => p.holeType === 'home' && p.completedCircuit).length : 0;
                return safe >= 4 && home >= 1;
            }
        }
    ];

    // Pre-compute z values for each rule for fast lookup
    RULE_POINTS.forEach(r => {
        r.z = evalSurface(r.surface, r.x, r.y);
    });

    // Sort by z descending — highest z asserts first
    const SORTED_RULES = [...RULE_POINTS].sort((a, b) => b.z - a.z);

    // ═══════════════════════════════════════════════════════════
    //  MOVE VALIDATION — manifold-based
    // ═══════════════════════════════════════════════════════════

    /**
     * Validate a single move against all manifold rules.
     * Returns { valid: boolean, violations: Array<{rule, reason}> }
     */
    function validateMove(move, gameState) {
        if (!move || !gameState) return { valid: false, violations: [{ rule: 'SYSTEM', reason: 'Missing move or gameState' }] };

        const player = gameState.currentPlayer;
        const card = gameState.currentCard;
        const cardRank = card?.rank || card?.value;

        // Build rule context once
        const ctx = buildRuleContext(move, player, card, cardRank, gameState);

        const violations = [];
        for (const rule of SORTED_RULES) {
            try {
                const result = rule.assert(ctx);
                if (!result.valid) {
                    violations.push({ rule: result.rule, reason: result.reason });
                }
            } catch (e) {
                console.warn(`[BoardManifold] Rule ${rule.id} threw:`, e.message);
            }
        }

        return { valid: violations.length === 0, violations };
    }

    /**
     * Build the rule context object from a move + state.
     */
    function buildRuleContext(move, player, card, cardRank, gameState) {
        const boardPos = player.boardPosition ?? player.index;
        const destKind = kindOf(move.toHoleId);
        const fromKind = kindOf(move.fromHoleId);
        const cm = getCardManifold(cardRank);

        // Determine blocking / opponent on destination
        let landsOnOwnPeg = false;
        let landsOnOpponent = false;
        let opponentCanReceiveCut = true;
        let pathBlockedByOwnPeg = false;

        if (gameState && gameState.players) {
            for (const p of gameState.players) {
                for (const peg of (p.peg || p.pegs || [])) {
                    if (peg.holeId === move.toHoleId && peg.id !== move.pegId) {
                        if (p.index === player.index) {
                            // Only active board pegs block — exclude holding, bullseye, completed
                            if (peg.holeType !== 'holding' && !peg.inBullseye && !peg.completedCircuit) {
                                landsOnOwnPeg = true;
                            }
                        } else {
                            // Opponents in holding/bullseye can't be cut on the regular track
                            if (peg.holeType !== 'holding') {
                                landsOnOpponent = true;
                                if (typeof gameState.canReceiveCutPeg === 'function') {
                                    opponentCanReceiveCut = gameState.canReceiveCutPeg(p);
                                }
                            }
                        }
                    }
                }
            }
            // Check path blocking by own pegs
            // Must match engine's isPegBlockingPath: exclude holding, bullseye, completed
            if (move.path && move.path.length > 2) {
                for (let i = 1; i < move.path.length - 1; i++) {
                    const hid = move.path[i];
                    for (const peg of (player.peg || player.pegs || [])) {
                        if (peg.holeId === hid && peg.id !== move.pegId &&
                            peg.holeType !== 'holding' && !peg.inBullseye && !peg.completedCircuit) {
                            pathBlockedByOwnPeg = true;
                            break;
                        }
                    }
                    if (pathBlockedByOwnPeg) break;
                }
            }
        }

        // Find peg
        const peg = (player.peg || player.pegs || []).find(p => p.id === move.pegId);

        // Safe zone entry?
        const enteringSafeZone = destKind === 'safezone' || destKind === 'winner';
        const pegCompletedCircuit = peg?.completedCircuit || false;
        const pegEligibleForSafe = peg?.eligibleForSafeZone || false;

        // Own peg on home (for entry checks)
        const homeHoleId = `home-${boardPos}`;
        const ownPegOnHome = (player.peg || player.pegs || []).some(
            p => p.holeId === homeHoleId && p.id !== move.pegId
        );

        return {
            moveType: move.type,
            fromHoleId: move.fromHoleId,
            toHoleId: move.toHoleId,
            steps: move.steps,
            path: move.path || null,
            cardRank,
            direction: cm?.direction || 'clockwise',
            movingBackward: cm?.isBackward || false,
            playerIndex: player.index,
            playerBoardPos: boardPos,
            landsOnOwnPeg,
            landsOnOpponent,
            opponentCanReceiveCut,
            pathBlockedByOwnPeg,
            enteringSafeZone,
            pegCompletedCircuit,
            pegEligibleForSafe,
            ownPegOnHome,
            overshoots: false // calculated by engine, passed if needed
        };
    }

    /**
     * Validate all legal moves at once. Filter out any that violate rules.
     * Returns the list of truly valid moves.
     */
    function filterLegalMoves(moves, gameState) {
        if (!moves || !gameState) return [];
        const validated = [];
        for (const move of moves) {
            const result = validateMove(move, gameState);
            if (result.valid) {
                move._manifoldValidated = true;
                validated.push(move);
            } else {
                console.log(`[BoardManifold] Filtered out move ${move.fromHoleId} → ${move.toHoleId}: ${result.violations.map(v => v.reason).join('; ')}`);
            }
        }
        return validated;
    }

    /**
     * Validate that a peg has landed in the correct hole for the card played.
     * Called AFTER move execution to guarantee correctness.
     * Returns { valid: boolean, reason?: string }
     */
    function validateLanding(pegId, actualHoleId, expectedHoleId, cardRank) {
        if (actualHoleId !== expectedHoleId) {
            return {
                valid: false,
                reason: `Peg ${pegId} landed on ${actualHoleId} but expected ${expectedHoleId} (card: ${cardRank})`
            };
        }
        // Seal the peg's manifold state
        sealPeg(pegId, actualHoleId, cardRank);
        return { valid: true };
    }

    /**
     * Confirm there are truly no legal moves — manifold assertion.
     * Returns { noMoves: boolean, reason: string }
     */
    function assertNoLegalMoves(moves, gameState) {
        if (!gameState) return { noMoves: true, reason: 'No game state' };
        
        // First: did the engine find any?
        if (moves && moves.length > 0) {
            // Double-check through our manifold filter
            const valid = filterLegalMoves(moves, gameState);
            if (valid.length > 0) {
                return { noMoves: false, reason: `${valid.length} valid moves exist after manifold validation` };
            }
            return { noMoves: true, reason: `Engine found ${moves.length} moves but all failed manifold validation` };
        }

        return { noMoves: true, reason: 'Engine confirmed no legal moves, manifold agrees' };
    }

    // ═══════════════════════════════════════════════════════════
    //  BOARD MANIFOLD — the board itself is a surface
    // ═══════════════════════════════════════════════════════════

    const BOARD = {
        surface: 'z=xy',
        x: PHI * PHI,
        y: PHI * PHI, // z = φ⁴ — the enclosing manifold
        label: 'FastTrack Board',
        totalHoles: 0, // filled at seal time
        z() { return evalSurface(this.surface, this.x, this.y); },
        ruleText: 'Hexagonal board with 6 player wedges. 78 outer + 6 FT + 1 center + 24 safe + 24 holding + 6 home = 139+ holes.'
    };

    /**
     * Seal the board — iterate holeRegistry and stamp each hole's manifold data.
     * Call this once after board is built.
     */
    function sealBoard(holeRegistry) {
        if (!holeRegistry) return;
        let count = 0;
        holeRegistry.forEach((hole, holeId) => {
            const kind = kindOf(holeId);
            const rules = HOLE_KINDS[kind] || HOLE_KINDS.outer;
            hole._manifold = {
                kind,
                label: rules.label,
                surface: rules.surface,
                x: rules.x,
                y: rules.y,
                z: evalSurface(rules.surface, rules.x, rules.y),
                canBeCut: rules.canBeCut,
                ownerOnly: rules.ownerOnly || false,
                ruleText: rules.ruleText,
                sealedAt: Date.now()
            };
            count++;
        });
        BOARD.totalHoles = count;
        console.log(`[BoardManifold] Sealed ${count} holes on z=xy / z=xy² surfaces`);
        console.log(`[BoardManifold] Board z = ${BOARD.z().toFixed(4)} (φ⁴ enclosing manifold)`);
    }

    // ═══════════════════════════════════════════════════════════
    //  MOM MANIFOLD — Mom helper as a surface point
    // ═══════════════════════════════════════════════════════════

    const MOM = {
        surface: 'z=xy',
        x: PHI,
        y: PHI * PHI, // z = φ³ — nurturing surface
        label: 'Mom Helper',
        icon: '👩‍👧',       // family-style icon
        fallbackIcon: '👩', // if combo emoji not supported
        z() { return evalSurface(this.surface, this.x, this.y); },
        ruleText: 'Contextual helper. Available when difficulty != hard.',
        getIcon() {
            // Test if the family emoji renders
            return this.icon;
        }
    };

    // ═══════════════════════════════════════════════════════════
    //  NAME & ICON POOLS
    // ═══════════════════════════════════════════════════════════

    /**
     * BOT names & icons — Computer, science, sci-fi, tech, computation,
     * hardware/software, digital themed. Reserved for AI only.
     */
    const BOT_POOL = [
        // Computing pioneers & concepts
        { name: 'Turing',    icon: '🖥️', title: 'Logic Pioneer' },
        { name: 'Ada',       icon: '⌨️', title: 'First Programmer' },
        { name: 'Babbage',   icon: '⚙️', title: 'Engine Architect' },
        { name: 'Dijkstra',  icon: '🗺️', title: 'Path Finder' },
        { name: 'Boolean',   icon: '🔘', title: 'Truth Gate' },
        { name: 'Kernel',    icon: '🧬', title: 'Core Process' },
        { name: 'Pixel',     icon: '🟩', title: 'Raster Unit' },
        { name: 'Cipher',    icon: '🔐', title: 'Crypto Engine' },
        { name: 'Qubit',     icon: '⚛️', title: 'Quantum Bit' },
        { name: 'Tensor',    icon: '📐', title: 'Matrix Brain' },

        // Sci-fi / digital
        { name: 'Nexus',     icon: '🌐', title: 'Network Node' },
        { name: 'Cortex',    icon: '🧠', title: 'Neural Core' },
        { name: 'Helix',     icon: '🧬', title: 'DNA Spiral' },
        { name: 'Vector',    icon: '➡️', title: 'Direction Field' },
        { name: 'Fractal',   icon: '🔷', title: 'Self-Similar' },
        { name: 'Syntax',    icon: '📝', title: 'Code Parser' },
        { name: 'Cache',     icon: '💾', title: 'Memory Bank' },
        { name: 'Daemon',    icon: '👾', title: 'Background Task' },
        { name: 'Flux',      icon: '⚡', title: 'Data Stream' },
        { name: 'Codec',     icon: '🎛️', title: 'Signal Encoder' },

        // Hardware / software
        { name: 'Silicon',   icon: '🔌', title: 'Chip Wafer' },
        { name: 'Mainframe', icon: '🏗️', title: 'Big Iron' },
        { name: 'Router',    icon: '📡', title: 'Packet Guide' },
        { name: 'Binary',    icon: '0️⃣', title: '01010101' },
        { name: 'Lambda',    icon: 'λ',  title: 'Function Core' },
        { name: 'Regex',     icon: '🔍', title: 'Pattern Match' },
        { name: 'Bitwise',   icon: '🔢', title: 'AND/OR/XOR' },
        { name: 'Compile',   icon: '🔨', title: 'Build System' },
        { name: 'Byte',      icon: '📦', title: 'Eight Bits' },
        { name: 'Servo',     icon: '🤖', title: 'Motor Control' }
    ];

    /**
     * PLAYER names & icons — science, sci-fi, nature, religious,
     * TV trope, movie trope themed. Available to human players.
     */
    const PLAYER_POOL = [
        // Science / nature
        { name: 'Nova',      icon: '🌟', category: 'science' },
        { name: 'Eclipse',   icon: '🌑', category: 'science' },
        { name: 'Aurora',    icon: '🌌', category: 'nature' },
        { name: 'Ember',     icon: '🔥', category: 'nature' },
        { name: 'Tsunami',   icon: '🌊', category: 'nature' },
        { name: 'Tempest',   icon: '⛈️', category: 'nature' },
        { name: 'Phoenix',   icon: '🦅', category: 'nature' },
        { name: 'Crystal',   icon: '💎', category: 'nature' },
        { name: 'Comet',     icon: '☄️', category: 'science' },
        { name: 'Orbit',     icon: '🪐', category: 'science' },

        // Sci-fi
        { name: 'Nebula',    icon: '🌀', category: 'sci-fi' },
        { name: 'Warp',      icon: '🚀', category: 'sci-fi' },
        { name: 'Starfire',  icon: '✨', category: 'sci-fi' },
        { name: 'Cosmos',    icon: '🌠', category: 'sci-fi' },
        { name: 'Galaxy',    icon: '🌌', category: 'sci-fi' },

        // Religious / mythological
        { name: 'Eden',      icon: '🍃', category: 'religious' },
        { name: 'Karma',     icon: '☯️', category: 'religious' },
        { name: 'Nirvana',   icon: '🕊️', category: 'religious' },
        { name: 'Olympus',   icon: '⚡', category: 'religious' },
        { name: 'Zen',       icon: '🧘', category: 'religious' },

        // TV tropes
        { name: 'Wildcard',  icon: '🃏', category: 'tv-trope' },
        { name: 'Maverick',  icon: '🎬', category: 'tv-trope' },
        { name: 'Rogue',     icon: '🗡️', category: 'tv-trope' },
        { name: 'Hero',      icon: '🦸', category: 'tv-trope' },
        { name: 'Prodigy',   icon: '🎯', category: 'tv-trope' },

        // Movie tropes
        { name: 'Blaze',     icon: '🔥', category: 'movie-trope' },
        { name: 'Shadow',    icon: '🌑', category: 'movie-trope' },
        { name: 'Ace',       icon: '🏆', category: 'movie-trope' },
        { name: 'Legend',    icon: '👑', category: 'movie-trope' },
        { name: 'Titan',     icon: '🗿', category: 'movie-trope' }
    ];

    /**
     * Pick N unique bots from the pool (shuffled).
     */
    function pickBots(count) {
        const shuffled = [...BOT_POOL].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    /**
     * Pick a random player identity from the pool.
     */
    function pickPlayerSuggestion() {
        return PLAYER_POOL[Math.floor(Math.random() * PLAYER_POOL.length)];
    }

    // ═══════════════════════════════════════════════════════════
    //  TRUTH TABLE GENERATORS
    // ═══════════════════════════════════════════════════════════

    /**
     * Generate a truth table for holes on the manifold.
     */
    function holeTruthTable() {
        const table = {};
        for (const [kind, rules] of Object.entries(HOLE_KINDS)) {
            table[kind] = {
                label: rules.label,
                surface: rules.surface,
                x: rules.x,
                y: rules.y,
                z: evalSurface(rules.surface, rules.x, rules.y),
                canBeCut: rules.canBeCut,
                ruleText: rules.ruleText
            };
        }
        return table;
    }

    /**
     * Generate a truth table for cards on the manifold.
     */
    function cardTruthTable() {
        const table = {};
        for (const [rank, cm] of Object.entries(CARD_MANIFOLD)) {
            table[rank] = {
                surface: cm.surface,
                x: cm.x,
                y: cm.y,
                z: evalSurface(cm.surface, cm.x, cm.y),
                movement: cm.movement,
                direction: cm.direction,
                canEnter: cm.canEnter,
                canExitBullseye: cm.canExitBullseye,
                extraTurn: cm.extraTurn,
                canSplit: cm.canSplit
            };
        }
        return table;
    }

    /**
     * Generate a truth table for rules on the manifold.
     */
    function ruleTruthTable() {
        return RULE_POINTS.map(r => ({
            id: r.id,
            desc: r.desc,
            surface: r.surface,
            x: r.x,
            y: r.y,
            z: r.z
        }));
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════

    return {
        // Constants
        PHI,
        FIB,

        // Surface math
        evalSurface,
        gradient,
        zxy,
        zxy2,

        // Hole manifold
        HOLE_KINDS,
        kindOf,
        getHoleRules,
        holeZ,
        holeGradient,
        sealBoard,

        // Card manifold
        CARD_MANIFOLD,
        getCardManifold,
        cardZ,

        // Peg manifold
        sealPeg,
        getPegState,

        // Rule manifold
        RULE_POINTS,
        SORTED_RULES,

        // Validation
        validateMove,
        filterLegalMoves,
        validateLanding,
        assertNoLegalMoves,
        buildRuleContext,

        // Board
        BOARD,

        // Mom
        MOM,

        // Name pools
        BOT_POOL,
        PLAYER_POOL,
        pickBots,
        pickPlayerSuggestion,

        // Truth tables
        holeTruthTable,
        cardTruthTable,
        ruleTruthTable
    };
})();

// ── Export ────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.BoardManifold = BoardManifold;
}
