/**
 * ManifoldAI — Geometric Intelligence for FastTrack
 * ==================================================
 * ButterflyFX Dimensional Computing: AI players as points on mathematical surfaces.
 *
 * Instead of hardcoded bot configs, each AI player IS a manifold entity —
 * a point on a geometric surface whose properties generate decision-making.
 *
 * THE TWO CANONICAL SURFACES:
 *
 *   z = x·y      (Layer 3: Relation — the AND gate / truth table)
 *     • Saddle surface (hyperbolic paraboloid)
 *     • z > 0 when x,y same sign → both factors agree
 *     • z = 0 when either factor is 0 → no signal
 *     • Maps to: balanced, logical play — both opportunity AND safety must align
 *
 *   z = x·y²     (Layer 4: Form — the quadratic table)
 *     • Monkey saddle / cubic surface
 *     • Amplifies the y-dimension quadratically
 *     • Small y → subtle, Large y → explosive response
 *     • Maps to: aggressive, amplified play — opportunities are magnified
 *
 * FIBONACCI WEIGHT SPINE:
 *   1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89
 *   Each rule tier uses a Fibonacci weight as its base.
 *   The manifold position MODULATES these weights geometrically.
 *
 * HOW IT WORKS:
 *   1. An AI player is spawned at coordinates (θ, r) on the manifold
 *   2. θ (angle) determines personality archetype (aggressive, defensive, etc.)
 *   3. r (radius) determines intensity / commitment to strategy
 *   4. The surface value z at (x,y) derived from (θ,r) gives the decision weight
 *   5. Gradient ∇z gives the AI's "instinct" — which direction to push decisions
 *   6. Curvature κ gives risk tolerance — high curvature = risk-averse
 *
 * TRUTH TABLE (z=xy at integer points):
 *        y: -2   -1    0    1    2
 *   x:-2    4    2    0   -2   -4
 *   x:-1    2    1    0   -1   -2
 *   x: 0    0    0    0    0    0
 *   x: 1   -2   -1    0    1    2
 *   x: 2   -4   -2    0    2    4
 *
 *   Both positive → positive (AND-true)
 *   Mixed signs → negative (XOR/conflict)
 *   Zero → zero (no signal)
 *
 * QUADRATIC TABLE (z=xy² at integer points):
 *        y: -2   -1    0    1    2
 *   x:-2   -8   -2    0   -2   -8
 *   x:-1   -4   -1    0   -1   -4
 *   x: 0    0    0    0    0    0
 *   x: 1    4    1    0    1    4
 *   x: 2    8    2    0    2    8
 *
 *   Sign follows x (the "commander" axis)
 *   Magnitude amplified by y² (the "intensity" axis)
 *
 * Copyright (c) 2024-2026 Kenneth Bingham — ButterflyFX
 * Licensed under CC BY 4.0
 */

window.ManifoldAI = (function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // CONSTANTS — The Geometric Foundation
    // ═══════════════════════════════════════════════════════════════

    const PHI = (1 + Math.sqrt(5)) / 2;           // Golden ratio φ ≈ 1.618
    const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];  // Fibonacci spine

    // Fibonacci-aligned weight tiers for move evaluation
    const WEIGHT_TIERS = {
        existential: FIB[10],  // 89  — win condition
        strategic: FIB[9],   // 55  — safe zone progress
        tactical: FIB[8],   // 34  — cut opponent
        opportunistic: FIB[7],  // 21  — fasttrack / bullseye
        developmental: FIB[6],  // 13  — enter from holding
        positional: FIB[5],   // 8   — positioning advantage
        noise: FIB[4],   // 5   — random tiebreaker
    };

    // The two canonical manifold types
    const MANIFOLD_TYPE = {
        RELATION: 'z=xy',    // Layer 3 — balanced / logical
        FORM: 'z=xy2',   // Layer 4 — aggressive / amplified
    };

    // ═══════════════════════════════════════════════════════════════
    // MANIFOLD SURFACE — The Mathematical Core
    // ═══════════════════════════════════════════════════════════════

    /**
     * Evaluate a manifold surface at point (x, y)
     * @param {string} type - MANIFOLD_TYPE
     * @param {number} x - first coordinate
     * @param {number} y - second coordinate
     * @returns {number} z value on the surface
     */
    function evaluateSurface(type, x, y) {
        switch (type) {
            case MANIFOLD_TYPE.RELATION:
                return x * y * y;             // z = xy² (quadratic multiplier)
            case MANIFOLD_TYPE.FORM:
                return x * y * y;             // z = xy² (quadratic amplifier)
            default:
                return x * y * y;             // z = xy² — manifold primitive
        }
    }

    /**
     * Compute the gradient ∇z at point (x, y)
     * Gradient tells us the direction of steepest ascent — the AI's "instinct"
     */
    function gradient(type, x, y) {
        switch (type) {
            case MANIFOLD_TYPE.RELATION:
                // ∇(xy²) = (y², 2xy)
                return { dx: y * y, dy: 2 * x * y };
            case MANIFOLD_TYPE.FORM:
                // ∇(xy²) = (y², 2xy)
                return { dx: y * y, dy: 2 * x * y };
            default:
                return { dx: y * y, dy: 2 * x * y };
        }
    }

    /**
     * Compute Gaussian curvature κ at point (x, y)
     * High curvature = risk-averse (tight surface, unstable position)
     * Low curvature = risk-tolerant (flat surface, stable position)
     */
    function curvature(type, x, y) {
        switch (type) {
            case MANIFOLD_TYPE.RELATION: {
                // For z=xy², K = (fxx·fyy - fxy²) / (1 + fx² + fy²)²
                // fx=y², fy=2xy, fxx=0, fyy=2x, fxy=2y
                const fx = y * y, fy = 2 * x * y;
                const fxx = 0, fyy = 2 * x, fxy = 2 * y;
                const denom = (1 + fx * fx + fy * fy);
                return (fxx * fyy - fxy * fxy) / (denom * denom);
            }
            case MANIFOLD_TYPE.FORM: {
                // For z=xy², K involves second partials
                // fxx=0, fyy=2x, fxy=2y
                // K = (fxx*fyy - fxy²) / (1 + fx² + fy²)²
                const fx = y * y;
                const fy = 2 * x * y;
                const fxx = 0;
                const fyy = 2 * x;
                const fxy = 2 * y;
                const denom = (1 + fx * fx + fy * fy);
                return (fxx * fyy - fxy * fxy) / (denom * denom);
            }
            default:
                return 0;
        }
    }

    /**
     * Compute the gradient magnitude — ||∇z||
     * High magnitude = strong conviction in decisions
     * Low magnitude = more exploratory / uncertain
     */
    function gradientMagnitude(type, x, y) {
        const g = gradient(type, x, y);
        return Math.sqrt(g.dx * g.dx + g.dy * g.dy);
    }

    // ═══════════════════════════════════════════════════════════════
    // MANIFOLD ENTITY — An AI Player on the Surface
    // ═══════════════════════════════════════════════════════════════

    /**
     * Personality archetypes mapped to angular positions on the manifold.
     * The angle θ determines which sector of the surface the AI inhabits.
     *
     * Quadrant mapping (z=xy truth table):
     *   Q1 (0 < θ < π/2):     x>0, y>0 → z>0  = "Optimist" (both positive)
     *   Q2 (π/2 < θ < π):     x<0, y>0 → z<0  = "Contrarian" (mixed signals)
     *   Q3 (π < θ < 3π/2):    x<0, y<0 → z>0  = "Survivor" (both negative → positive)
     *   Q4 (3π/2 < θ < 2π):   x>0, y<0 → z<0  = "Gambler" (risky bets)
     */
    const ARCHETYPES = {
        // θ = π/6 — deep in Q1, strong positive z
        strategist: {
            name: 'Turing',
            theta: Math.PI / 6,
            radius: PHI,
            manifold: MANIFOLD_TYPE.RELATION,
            emoji: '🖥️',
            description: 'Balanced logical play. Evaluates AND of opportunity × safety.'
        },
        // θ = π/3 — Q1 near boundary, moderate z
        guardian: {
            name: 'Cortex',
            theta: Math.PI / 3,
            radius: 1.2,
            manifold: MANIFOLD_TYPE.RELATION,
            emoji: '🧠',
            description: 'Defensive manifold. High safety factor amplifies caution.'
        },
        // θ = 2π/3 — Q2, negative z from z=xy
        hunter: {
            name: 'Nexus',
            theta: 2 * Math.PI / 3,
            radius: PHI,
            manifold: MANIFOLD_TYPE.FORM,
            emoji: '🌐',
            description: 'Aggressive quadratic play. Opportunities amplified by y².'
        },
        // θ = 5π/6 — deep Q2, amplified negative
        blitz: {
            name: 'Flux',
            theta: 5 * Math.PI / 6,
            radius: PHI * PHI,
            emoji: '⚡',
            manifold: MANIFOLD_TYPE.FORM,
            description: 'Explosive quadratic bursts. Maximum amplification on the z=xy² surface.'
        },
        // θ = 7π/6 — Q3, both negative → z>0 for z=xy
        survivor: {
            name: 'Daemon',
            theta: 7 * Math.PI / 6,
            radius: 1.0,
            manifold: MANIFOLD_TYPE.RELATION,
            emoji: '👾',
            description: 'Resilient play. Turns adversity into advantage (neg×neg=pos).'
        },
    };

    // Archetype rotation pool — cycles through for each new AI player
    const ARCHETYPE_POOL = ['strategist', 'hunter', 'blitz', 'guardian', 'survivor'];

    /**
     * Create a ManifoldEntity — an AI player living on a geometric surface
     *
     * @param {number} playerIndex - Index in gameState.players[]
     * @param {string} archetypeKey - Key from ARCHETYPES
     * @param {string} difficulty - 'easy', 'intermediate', 'hard'
     * @returns {Object} ManifoldEntity
     */
    function createEntity(playerIndex, archetypeKey, difficulty = 'normal') {
        const archetype = ARCHETYPES[archetypeKey] || ARCHETYPES.strategist;
        const manifoldType = archetype.manifold;

        // Convert polar (θ, r) to Cartesian (x, y)
        const x = archetype.radius * Math.cos(archetype.theta);
        const y = archetype.radius * Math.sin(archetype.theta);

        // Evaluate surface properties at this point
        const z = evaluateSurface(manifoldType, x, y);
        const g = gradient(manifoldType, x, y);
        const gMag = gradientMagnitude(manifoldType, x, y);
        const K = curvature(manifoldType, x, y);

        // Difficulty modulates the radius (how far from origin = how extreme)
        const difficultyScale = { easy: 0.5, normal: 1.0, intermediate: 1.0, hard: 1.5 };
        const scale = difficultyScale[difficulty] || 1.0;

        // ─── Derive Strategy Weights from Geometry ───
        //
        // The key insight: each weight is the manifold surface evaluated
        // at a point that combines the base Fibonacci weight with the
        // entity's position on the surface.
        //
        // Rule weight = baseFibWeight × |z(x_rule, y_rule)| × difficultyScale
        //
        // Where (x_rule, y_rule) mixes the entity position with the rule's "axis":
        //   x_rule = entity.x × ruleAxisFactor
        //   y_rule = entity.y × ruleAxisFactor

        const absZ = Math.abs(z) || 0.5;  // Avoid zero
        const signZ = z >= 0 ? 1 : -1;

        // Gradient direction tells us offensive vs defensive lean
        // dx > 0 → leans toward opportunity (offensive)
        // dy > 0 → leans toward risk-taking
        const offensiveLean = Math.max(0.1, (g.dx + 1) / 2);  // Normalize to [0.1, 1]
        const riskTolerance = 1 / (1 + Math.abs(K));           // Flat surface → high tolerance

        // ─── Build the Weight Matrix (truth table rows) ───
        // Each row: evaluate z=xy or z=xy² with rule-specific inputs

        const weights = {};

        // Tier: Existential (win) — always maximum, not modulated
        weights.isWinnerHole = WEIGHT_TIERS.existential;

        // Tier: Strategic (safe zone) — modulated by gradient magnitude
        // High gradient = strong conviction about safe zone value
        weights.isSafeZoneMove = WEIGHT_TIERS.strategic * clamp(gMag * scale, 0.3, 2.0);

        // Tier: Tactical (cut) — z=xy truth table:
        // When z>0 (both factors agree) → inclined to cut
        // When z<0 (conflict) → avoids cutting
        // z=xy² amplifies this for FORM manifold
        const cutFactor = evaluateSurface(manifoldType,
            offensiveLean * scale,
            riskTolerance * scale
        );
        weights.isCutMove = WEIGHT_TIERS.tactical * clamp(cutFactor + 0.5, 0.05, 3.0);

        // Bullseye cut — amplified version of cut
        weights.isBullseyeCut = weights.isCutMove * 1.2;

        // Tier: Opportunistic (fasttrack/bullseye entry)
        // Gradient magnitude → how aggressively we pursue shortcuts
        const ftFactor = evaluateSurface(manifoldType,
            gMag * 0.5,
            riskTolerance
        );
        weights.isFastTrackEntry = WEIGHT_TIERS.opportunistic * clamp(ftFactor + 0.5, 0.3, 2.0);

        weights.isBullseyeEntry = weights.isFastTrackEntry * clamp(riskTolerance, 0.3, 1.5);

        // Tier: Developmental (enter from holding)
        // Curvature-sensitive — high curvature = prefers developing pieces
        weights.isEnterMove = WEIGHT_TIERS.developmental * clamp(1.0 + Math.abs(K) * 2, 0.5, 2.0);

        // Tier: Positional (backward 4-card strategy)
        const backwardFactor = evaluateSurface(manifoldType,
            (1 - offensiveLean) * scale,  // Less offensive → more strategic backward
            0.5
        );
        weights.isStrategicBackward = WEIGHT_TIERS.positional * clamp(backwardFactor + 0.5, 0.2, 2.0);

        // Defensive positioning — inverse of risk tolerance
        weights.defensivePositioning = -WEIGHT_TIERS.positional * clamp(1.5 - riskTolerance, 0.3, 3.0);

        // 4-card trap avoidance — curvature-sensitive
        weights.avoid4CardTrap = -(WEIGHT_TIERS.positional - 2) * clamp(1.0 + Math.abs(K), 0.3, 2.0);

        // Offensive positioning — directly from offensive lean
        weights.offensivePositioning = WEIGHT_TIERS.noise * clamp(offensiveLean * scale * 2, 0.1, 2.0);

        // Forward progress — baseline
        weights.forwardProgress = WEIGHT_TIERS.noise * clamp(scale, 0.3, 1.5);

        // Random tiebreaker — curvature modulates randomness
        // Flat surface (low K) = more random, curved surface = more deterministic
        weights.randomTiebreaker = FIB[2] * clamp(1.0 - Math.abs(K) * 5, 0.0, 1.0);

        // ─── Assemble the entity ───

        const entity = {
            // Identity
            playerIndex,
            archetypeKey,
            archetype: archetype.name,
            emoji: archetype.emoji,
            name: archetype.name,

            // Manifold position
            manifoldType,
            theta: archetype.theta,
            radius: archetype.radius * scale,
            x, y, z,

            // Geometric properties
            gradient: g,
            gradientMagnitude: gMag,
            curvature: K,

            // Derived personality
            offensiveLean,
            riskTolerance,
            difficulty,

            // Strategy weights (the truth table output)
            weights,

            // Thinking delay — inverse of gradient magnitude (strong conviction = faster)
            thinkingDelay: Math.round(400 + (1 / (gMag + 0.1)) * 300 * (1 / scale)),
            drawDelay: Math.round(200 + (1 / (gMag + 0.1)) * 200 * (1 / scale)),
        };

        console.log(`[ManifoldAI] Entity created: ${archetype.emoji} ${archetype.name} ` +
            `on ${manifoldType} at (${x.toFixed(2)}, ${y.toFixed(2)}) → z=${z.toFixed(2)}`);
        console.log(`  Gradient: (${g.dx.toFixed(2)}, ${g.dy.toFixed(2)}), |∇|=${gMag.toFixed(2)}, κ=${K.toFixed(4)}`);
        console.log(`  Personality: offensive=${offensiveLean.toFixed(2)}, risk=${riskTolerance.toFixed(2)}`);
        console.log(`  Weights:`, Object.fromEntries(
            Object.entries(weights).map(([k, v]) => [k, +v.toFixed(2)])
        ));

        return entity;
    }

    // ═══════════════════════════════════════════════════════════════
    // DECISION ENGINE — Manifold-Driven Move Evaluation
    // ═══════════════════════════════════════════════════════════════

    /**
     * Truth Table Evaluator
     * Maps game-state features to (x, y) coordinates, evaluates on the
     * entity's manifold surface, returns a decision score.
     *
     * For z=xy:  score = opportunity × safety (AND logic)
     * For z=xy²: score = opportunity × safety² (quadratic amplification)
     */
    function evaluateMove(entity, move, context, ruleEvaluators) {
        let totalScore = 0;
        const ruleScores = {};

        for (const [ruleName, evaluator] of Object.entries(ruleEvaluators)) {
            // Get the raw evaluation [0..1] from the rule
            const rawScore = evaluator(move, context);

            // Get the manifold-modulated weight for this rule
            const weight = entity.weights[ruleName];
            if (weight === undefined) continue;

            const weightedScore = rawScore * weight;
            ruleScores[ruleName] = { raw: rawScore, weight, weighted: weightedScore };
            totalScore += weightedScore;
        }

        return { totalScore, ruleScores };
    }

    /**
     * Select the best move for a manifold entity
     * Uses the entity's surface properties to weight all evaluation rules
     */
    function selectBestMove(entity, moves, player, currentCard, ruleEvaluators, gameHelpers) {
        if (!moves || moves.length === 0) return null;

        const playerBoardPos = player.boardPosition;
        const isBackwardCard = currentCard && currentCard.direction === 'backward';

        const scoredMoves = moves.map(move => {
            const peg = player.peg.find(p => p.id === move.pegId);
            const context = {
                player,
                peg,
                currentCard,
                playerBoardPos,
                isBackwardCard,
                ...gameHelpers
            };

            const { totalScore, ruleScores } = evaluateMove(entity, move, context, ruleEvaluators);

            return { move, score: totalScore, ruleScores };
        });

        // Sort by score descending
        scoredMoves.sort((a, b) => b.score - a.score);

        // Decision logging with manifold context
        const top = scoredMoves[0];
        if (top) {
            const topRules = Object.entries(top.ruleScores)
                .filter(([_, v]) => Math.abs(v.weighted) > 0.1)
                .sort((a, b) => Math.abs(b[1].weighted) - Math.abs(a[1].weighted))
                .slice(0, 4)
                .map(([name, v]) => `${name}:${v.weighted.toFixed(1)}`)
                .join(', ');

            console.log(
                `${entity.emoji} [${entity.archetype}|${entity.manifoldType}] ` +
                `Best: ${top.move.toHoleId} (${top.score.toFixed(1)}) [${topRules}]`
            );
        }

        return scoredMoves.length > 0 ? scoredMoves[0].move : null;
    }

    // ═══════════════════════════════════════════════════════════════
    // 7-CARD SPLIT — Manifold-Weighted Split Evaluation
    // ═══════════════════════════════════════════════════════════════

    /**
     * Evaluate 7-card split using manifold weights
     * The entity's surface position determines how it values split combinations
     */
    function evaluate7CardSplit(entity, player, ruleEvaluators, gameHelpers) {
        // Find active pegs
        const activePegs = player.peg.filter(p =>
            p.holeType !== 'holding' && !p.completedCircuit && p.holeId
        );

        if (activePegs.length < 2) return null;

        const splitRanges = [[1, 6], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]];
        const mockCard = { movement: 7, direction: 'clockwise', canSplit: true };
        const combinations = [];

        const calcMoves = gameHelpers.calculateMovesForPegRange;
        if (!calcMoves) return null;

        for (const peg1 of activePegs) {
            for (const peg2 of activePegs) {
                if (peg1.id === peg2.id) continue;

                for (const [steps1, steps2] of splitRanges) {
                    const dests1 = calcMoves(peg1, steps1, steps1);
                    const dests2 = calcMoves(peg2, steps2, steps2);
                    if (dests1.length === 0 || dests2.length === 0) continue;

                    for (const m1 of dests1) {
                        for (const m2 of dests2) {
                            const ctx1 = {
                                player, peg: peg1, currentCard: mockCard,
                                playerBoardPos: player.boardPosition, isBackwardCard: false,
                                ...gameHelpers
                            };
                            const ctx2 = {
                                player, peg: peg2, currentCard: mockCard,
                                playerBoardPos: player.boardPosition, isBackwardCard: false,
                                ...gameHelpers
                            };

                            const eval1 = evaluateMove(entity, m1, ctx1, ruleEvaluators);
                            const eval2 = evaluateMove(entity, m2, ctx2, ruleEvaluators);

                            // Manifold combination: use entity's surface to combine
                            // z=xy: score = eval1 × eval2 (both must be good)
                            // z=xy²: score = eval1 × eval2² (second move amplified)
                            const manifoldCombined = evaluateSurface(
                                entity.manifoldType,
                                Math.max(eval1.totalScore, 0.01),
                                Math.max(eval2.totalScore, 0.01)
                            );

                            // Also keep simple sum for fallback
                            const simpleSum = eval1.totalScore + eval2.totalScore;

                            combinations.push({
                                peg1, peg2, move1: m1, move2: m2,
                                steps1, steps2,
                                score1: eval1.totalScore,
                                score2: eval2.totalScore,
                                manifoldScore: manifoldCombined,
                                combinedScore: simpleSum + manifoldCombined * 0.1,
                                hasCut: gameHelpers.findCutTargetAtHole?.(m1.toHoleId) ||
                                    gameHelpers.findCutTargetAtHole?.(m2.toHoleId)
                            });
                        }
                    }
                }
            }
        }

        if (combinations.length === 0) return null;

        combinations.sort((a, b) => b.combinedScore - a.combinedScore);

        const best = combinations[0];
        console.log(
            `${entity.emoji} [${entity.archetype}] 7-Split: ` +
            `${best.steps1}+${best.steps2} = ${best.combinedScore.toFixed(1)} ` +
            `(manifold: ${best.manifoldScore.toFixed(2)}) ${best.hasCut ? '✂️' : ''}`
        );

        return best;
    }

    // ═══════════════════════════════════════════════════════════════
    // ENTITY REGISTRY — Manage Active AI Entities
    // ═══════════════════════════════════════════════════════════════

    const entities = new Map();  // playerIndex → ManifoldEntity

    /**
     * Spawn AI entities for a game session.
     * Each AI player gets a unique archetype from the rotation pool.
     *
     * @param {number[]} aiIndices - Player indices that are AI
     * @param {string} difficulty - Game difficulty
     * @returns {Map<number, Object>} Map of playerIndex → entity
     */
    function spawnEntities(aiIndices, difficulty = 'normal') {
        entities.clear();

        console.log('═══════════════════════════════════════════════');
        console.log(`[ManifoldAI] Spawning ${aiIndices.length} entities on geometric surfaces`);
        console.log(`  Difficulty: ${difficulty}`);
        console.log(`  Available manifolds: ${MANIFOLD_TYPE.RELATION}, ${MANIFOLD_TYPE.FORM}`);
        console.log('═══════════════════════════════════════════════');

        aiIndices.forEach((playerIdx, i) => {
            const archetypeKey = ARCHETYPE_POOL[i % ARCHETYPE_POOL.length];
            const entity = createEntity(playerIdx, archetypeKey, difficulty);
            entities.set(playerIdx, entity);
        });

        return entities;
    }

    /**
     * Get the entity for a player index
     */
    function getEntity(playerIndex) {
        return entities.get(playerIndex) || null;
    }

    /**
     * Get all active entities
     */
    function getAllEntities() {
        return entities;
    }

    /**
     * Dynamically adjust an entity's position based on game events.
     * After being cut, the entity shifts on its manifold surface —
     * simulating emotional / strategic adaptation.
     *
     * @param {number} playerIndex
     * @param {string} event - 'was_cut', 'made_cut', 'entered_safe', 'entered_fasttrack'
     */
    function adaptEntity(playerIndex, event) {
        const entity = entities.get(playerIndex);
        if (!entity) return;

        // Shift angle based on event (emotional adaptation on the manifold)
        const shifts = {
            'was_cut': Math.PI / 12,   // Rotate toward Q3 (survivor mode)
            'made_cut': -Math.PI / 12,   // Rotate toward Q1 (confidence)
            'entered_safe': -Math.PI / 8,    // Shift toward defensive
            'entered_fasttrack': Math.PI / 8,    // Shift toward aggressive
            'no_legal_moves': Math.PI / 6,    // Major frustration shift
        };

        const shift = shifts[event] || 0;
        if (shift === 0) return;

        entity.theta += shift;
        entity.x = entity.radius * Math.cos(entity.theta);
        entity.y = entity.radius * Math.sin(entity.theta);
        entity.z = evaluateSurface(entity.manifoldType, entity.x, entity.y);

        // Recalculate geometric properties
        const g = gradient(entity.manifoldType, entity.x, entity.y);
        const K = curvature(entity.manifoldType, entity.x, entity.y);
        entity.gradient = g;
        entity.gradientMagnitude = gradientMagnitude(entity.manifoldType, entity.x, entity.y);
        entity.curvature = K;
        entity.offensiveLean = Math.max(0.1, (g.dx + 1) / 2);
        entity.riskTolerance = 1 / (1 + Math.abs(K));

        // Recalculate key weights that are most affected by emotional shifts
        const scale = { easy: 0.5, normal: 1.0, intermediate: 1.0, hard: 1.5 }[entity.difficulty] || 1.0;
        const cutFactor = evaluateSurface(entity.manifoldType,
            entity.offensiveLean * scale,
            entity.riskTolerance * scale
        );
        entity.weights.isCutMove = WEIGHT_TIERS.tactical * clamp(cutFactor + 0.5, 0.05, 3.0);
        entity.weights.isBullseyeCut = entity.weights.isCutMove * 1.2;

        const ftFactor = evaluateSurface(entity.manifoldType,
            entity.gradientMagnitude * 0.5,
            entity.riskTolerance
        );
        entity.weights.isFastTrackEntry = WEIGHT_TIERS.opportunistic * clamp(ftFactor + 0.5, 0.3, 2.0);

        console.log(
            `${entity.emoji} [${entity.archetype}] Adapted after "${event}": ` +
            `θ=${entity.theta.toFixed(2)} → z=${entity.z.toFixed(2)}, ` +
            `offensive=${entity.offensiveLean.toFixed(2)}, risk=${entity.riskTolerance.toFixed(2)}`
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // UTILITY
    // ═══════════════════════════════════════════════════════════════

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    /**
     * Generate a truth table visualization for a manifold type
     * Useful for debugging / UI display
     */
    function truthTable(type, range = 3) {
        const table = [];
        for (let x = -range; x <= range; x++) {
            const row = [];
            for (let y = -range; y <= range; y++) {
                row.push(evaluateSurface(type, x, y));
            }
            table.push(row);
        }
        return table;
    }

    /**
     * Get a readable summary of an entity's manifold position
     */
    function entitySummary(playerIndex) {
        const e = entities.get(playerIndex);
        if (!e) return 'No entity';

        return [
            `${e.emoji} ${e.archetype} [Player ${playerIndex}]`,
            `Surface: ${e.manifoldType}`,
            `Position: (${e.x.toFixed(2)}, ${e.y.toFixed(2)}) → z = ${e.z.toFixed(2)}`,
            `Gradient: ∇z = (${e.gradient.dx.toFixed(2)}, ${e.gradient.dy.toFixed(2)}), |∇z| = ${e.gradientMagnitude.toFixed(2)}`,
            `Curvature: κ = ${e.curvature.toFixed(4)}`,
            `Personality: offensive=${e.offensiveLean.toFixed(2)}, risk=${e.riskTolerance.toFixed(2)}`,
            `Difficulty: ${e.difficulty}`
        ].join('\n');
    }

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════

    return {
        // Core
        createEntity,
        spawnEntities,
        getEntity,
        getAllEntities,
        adaptEntity,

        // Decision engine
        evaluateMove,
        selectBestMove,
        evaluate7CardSplit,

        // Manifold math (exposed for visualization / debugging)
        evaluateSurface,
        gradient,
        curvature,
        gradientMagnitude,
        truthTable,
        entitySummary,

        // Constants
        MANIFOLD_TYPE,
        ARCHETYPES,
        ARCHETYPE_POOL,
        WEIGHT_TIERS,
        FIB,
        PHI,
    };

})();

console.log('[ManifoldAI] Module loaded — geometric intelligence active');
console.log('[ManifoldAI] z=xy (truth table):', window.ManifoldAI.truthTable('z=xy', 2));
console.log('[ManifoldAI] z=xy² (quadratic):', window.ManifoldAI.truthTable('z=xy2', 2));
