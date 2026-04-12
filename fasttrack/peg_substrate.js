/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * PARADIGM: Objects are dimensions containing points. Each point
 * is an object in a lower dimension containing its own points.
 * All properties, attributes, and behaviors exist as infinite
 * potentials — invoke only when needed. No pre-calculation,
 * no storage. Geometry IS information.
 * 
 * ============================================================
 * FASTTRACK PEG SUBSTRATE
 * ButterflyFX Manifold Pattern - Self-Aware Gladiator Pegs
 * ============================================================
 * 
 * Creates intelligent pegs that:
 * - Know their exact position and hole they occupy
 * - Count hops as they move and verify against card value
 * - Self-correct if initial path estimate was wrong
 * - Have personalities and LOVE sending opponents home
 * - Log all events to the Manifold for dimensional tracking
 */

'use strict';

const PegSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Smart Peg Substrate',
    
    // ============================================================
    // PEG REGISTRY & STATE
    // ============================================================
    pegs: new Map(),           // pegId → PegEntity
    manifoldLog: [],           // Event log for dimensional tracking
    personalities: new Map(),  // pegId → personality
    captureStats: new Map(),   // pegId → capture statistics
    
    // Callbacks
    onPegMoved: null,
    onPegCaptured: null,
    onPegVictory: null,
    onManifoldEvent: null,
    onCutscene: null,          // Callback for dramatic cutscenes
    
    // ============================================================
    // CROWD REACTIONS - The audience loves drama!
    // ============================================================
    crowdReactions: {
        CAPTURE: [
            "YAAAH!!!",
            "OHHHHH!!!",
            "THE CROWD GOES WILD!!!",
            "*thunderous applause*",
            "INCREDIBLE!!!",
            "DID YOU SEE THAT?!",
            "SPECTACULAR!!!",
            "UNBELIEVABLE!!!",
            "*standing ovation*",
            "HISTORY IN THE MAKING!!!"
        ],
        EPIC_CAPTURE: [  // For rivalry captures or multi-captures
            "🔥🔥🔥 THE ARENA ERUPTS!!! 🔥🔥🔥",
            "⚡ ABSOLUTE DEVASTATION!!! ⚡",
            "👑 A LEGENDARY MOMENT!!! 👑",
            "💥 THE CROWD IS ON THEIR FEET!!! 💥",
            "🌟 THIS WILL BE REMEMBERED FOREVER!!! 🌟"
        ],
        SOMERSAULT: [
            "*gasp* Look at that flip!",
            "Three rotations! INCREDIBLE!",
            "Perfect somersault technique!",
            "The aerial acrobatics!!",
            "Stick the landing... or not! 😂"
        ],
        LANDING: {
            GRACEFUL: ["Landed like a champion!", "What poise!", "10/10 landing!"],
            TUMBLE: ["Roll with it!", "Tumble and recover!", "Keep rolling!"],
            SPLAT: ["FACE PLANT! 😂", "Ooof! That's gotta hurt! (It doesn't)", "*crowd winces*"],
            BOUNCE: ["BOING! Spring back!", "Bouncy! Fun!", "Like a rubber ball!"],
            SUPERHERO: ["THREE POINT LANDING! 🦸", "HERO POSE!", "Absolute style!"],
            CRATER: ["💥 IMPACT CRATER!!!", "THE GROUND SHOOK!!!", "SEISMIC EVENT!!!"],
            ROLL_RECOVERY: ["Nice save!", "Smooth recovery roll!", "Parkour! 🤸"]
        }
    },
    
    // ============================================================
    // CAPTURE ANIMATION - Dramatic throw & somersault effects!
    // The crowd roars in approval! YAAAH!!!
    // ============================================================
    captureAnimations: {
        // Hunter capture styles - how they grab and throw the opponent
        throwStyles: {
            STOMP: { 
                name: 'The Stomp',
                description: 'Classic jump-on capture',
                height: 50, duration: 400, impact: 'heavy',
                animation: 'jump_stomp'
            },
            JAVELIN: { 
                name: 'The Javelin',
                description: 'Grabs opponent and hurls them like a javelin!',
                height: 60, duration: 800, impact: 'piercing',
                throwAngle: 35, spinType: 'none',
                animation: 'grab_throw_javelin'
            },
            SPIRAL_FOOTBALL: { 
                name: 'The Spiral',
                description: 'Winds up and throws a perfect spiral!',
                height: 70, duration: 900, impact: 'spiral',
                throwAngle: 45, spinType: 'spiral', rotationsPerSecond: 8,
                animation: 'grab_throw_spiral'
            },
            DROP_KICK: { 
                name: 'The Drop Kick',
                description: 'BOOT TO THE MOON!',
                height: 100, duration: 1200, impact: 'massive',
                throwAngle: 70, spinType: 'tumble',
                animation: 'grab_dropkick'
            },
            BODYSLAM: { 
                name: 'The Bodyslam',
                description: 'Full flying tackle!',
                height: 80, duration: 600, impact: 'crushing',
                animation: 'flying_bodyslam'
            },
            UPPERCUT: { 
                name: 'The Uppercut',
                description: 'POW! Right to the moon!',
                height: 90, duration: 500, impact: 'explosive',
                throwAngle: 85,
                animation: 'uppercut_launch'
            },
            CANNONBALL: { 
                name: 'The Cannonball',
                description: 'Maximum impact devastation!',
                height: 120, duration: 700, impact: 'devastating',
                animation: 'cannonball_crush'
            },
            SUPLEX: {
                name: 'The Suplex',
                description: 'Grab, lift, and SLAM!',
                height: 40, duration: 1000, impact: 'earthshaking',
                animation: 'grab_suplex'
            },
            YEET: {
                name: 'The YEET',
                description: 'YEEEEEET!!!',
                height: 150, duration: 600, impact: 'legendary',
                throwAngle: 60, spinType: 'chaotic',
                animation: 'grab_yeet'
            }
        },
        
        // Victim arc trajectories (somersault through the air!)
        arcTypes: [
            { name: 'classic', angle: 60, spins: 1, hangTime: 1200, style: 'graceful' },
            { name: 'dramatic', angle: 75, spins: 2, hangTime: 1800, style: 'theatrical' },
            { name: 'quick', angle: 45, spins: 0.5, hangTime: 600, style: 'snappy' },
            { name: 'epic', angle: 80, spins: 3, hangTime: 2500, style: 'legendary' },
            { name: 'stylish', angle: 55, spins: 1.5, hangTime: 1000, style: 'cool' },
            { name: 'spiral', angle: 50, spins: 4, hangTime: 1500, style: 'spinning', spiralRotations: 6 },
            { name: 'javelin', angle: 30, spins: 0, hangTime: 800, style: 'straight', wobble: true },
            { name: 'dropkick', angle: 85, spins: 2.5, hangTime: 2200, style: 'sky-high' }
        ],
        
        // Landing styles
        landings: ['GRACEFUL', 'TUMBLE', 'SPLAT', 'BOUNCE', 'SUPERHERO', 'CRATER', 'ROLL_RECOVERY'],
        
        // Victory dances after a capture!
        victoryDances: {
            WARRIOR: [
                { name: 'sword_salute', duration: 1500, description: 'Raises imaginary sword to sky' },
                { name: 'battle_cry', duration: 1000, description: 'Primal scream of victory' },
                { name: 'flex_pose', duration: 1200, description: 'Double bicep flex' }
            ],
            TRICKSTER: [
                { name: 'moonwalk', duration: 2000, description: 'Smooth criminal slides' },
                { name: 'magic_flourish', duration: 1500, description: 'Ta-da! *jazz hands*' },
                { name: 'backflip', duration: 800, description: 'Celebratory backflip' }
            ],
            GUARDIAN: [
                { name: 'shield_bash', duration: 1000, description: 'Pounds chest like shield' },
                { name: 'stoic_nod', duration: 600, description: 'Dignified acknowledgment' },
                { name: 'salute', duration: 800, description: 'Military salute' }
            ],
            SPEEDSTER: [
                { name: 'victory_lap', duration: 1500, description: 'Zooms in a circle' },
                { name: 'lightning_pose', duration: 800, description: 'Usain Bolt arrow pose' },
                { name: 'speed_blur', duration: 1000, description: 'Vibrates with excitement' }
            ],
            TACTICIAN: [
                { name: 'chess_checkmate', duration: 1200, description: 'Adjusts invisible glasses' },
                { name: 'finger_temple', duration: 800, description: 'Taps temple knowingly' },
                { name: 'slow_clap', duration: 2000, description: 'Sarcastic self-applause' }
            ],
            BERSERKER: [
                { name: 'rage_stomp', duration: 1500, description: 'Stomps ground repeatedly' },
                { name: 'primal_roar', duration: 1200, description: 'RAAAAWR!' },
                { name: 'ground_pound', duration: 1000, description: 'Fists slam the ground' },
                { name: 'fire_breath', duration: 1800, description: 'Breathes imaginary fire' }
            ]
        }
    },
    
    // ============================================================
    // PERSONALITY DEFINITIONS - Gladiator-themed
    // ============================================================
    personalityTypes: {
        WARRIOR: {
            id: 'warrior',
            name: 'The Warrior',
            emoji: '⚔️',
            captureChance: 0.9,  // Loves to capture
            tauntOnCapture: [
                "FALL BEFORE ME!",
                "Back to holding with you!",
                "Another one bites the dust!",
                "You thought you could pass ME?",
                "Tell them the Warrior sent you!"
            ],
            tauntOnCaptured: [
                "I'll be back...",
                "This isn't over!",
                "A temporary setback!",
                "You got lucky!"
            ],
            victoryPose: '🏆⚔️',
            moveStyle: 'aggressive'
        },
        TRICKSTER: {
            id: 'trickster',
            name: 'The Trickster',
            emoji: '🃏',
            captureChance: 0.7,
            tauntOnCapture: [
                "Surprise! Hehe!",
                "Didn't see that coming, did ya?",
                "Now you see me... bye bye!",
                "Tag! You're OUT!",
                "Gotcha! 😜"
            ],
            tauntOnCaptured: [
                "Okay, good one...",
                "I'll prank you back later!",
                "Just wait until next round!"
            ],
            victoryPose: '🎪🃏',
            moveStyle: 'sneaky'
        },
        GUARDIAN: {
            id: 'guardian',
            name: 'The Guardian',
            emoji: '🛡️',
            captureChance: 0.6,
            tauntOnCapture: [
                "None shall pass!",
                "Protected territory!",
                "Defending my lane!",
                "You triggered my trap card!",
                "Justice has been served!"
            ],
            tauntOnCaptured: [
                "My shield held... my position didn't.",
                "Retreat! Regroup!",
                "The wall shall rise again!"
            ],
            victoryPose: '🏰🛡️',
            moveStyle: 'defensive'
        },
        SPEEDSTER: {
            id: 'speedster',
            name: 'The Speedster',
            emoji: '⚡',
            captureChance: 0.8,
            tauntOnCapture: [
                "Zoom! Too slow!",
                "Can't catch what you can't see!",
                "Speed kills!",
                "Gotta go fast!",
                "Vroom vroom, bye bye!"
            ],
            tauntOnCaptured: [
                "Okay, ONE time you caught me...",
                "I blinked!",
                "Lag! That was lag!"
            ],
            victoryPose: '🏁⚡',
            moveStyle: 'fast'
        },
        TACTICIAN: {
            id: 'tactician',
            name: 'The Tactician',
            emoji: '🧠',
            captureChance: 0.75,
            tauntOnCapture: [
                "All according to plan.",
                "Calculated.",
                "Predictable move. Counter-executed.",
                "I saw this three turns ago.",
                "Chess, not checkers."
            ],
            tauntOnCaptured: [
                "Hmm. Unexpected variable.",
                "Recalculating...",
                "This changes nothing."
            ],
            victoryPose: '♟️🧠',
            moveStyle: 'calculated'
        },
        BERSERKER: {
            id: 'berserker',
            name: 'The Berserker',
            emoji: '🔥',
            captureChance: 0.95,  // Maximum aggression
            tauntOnCapture: [
                "RAAAAAGE!!!",
                "DESTRUCTION!!!",
                "NO MERCY!!!",
                "WITNESS MY FURY!!!",
                "BURN THEM ALL!!!"
            ],
            tauntOnCaptured: [
                "IMPOSSIBLE!!!",
                "MY RAGE ONLY GROWS!!!",
                "YOU'VE MADE A TERRIBLE MISTAKE!!!"
            ],
            victoryPose: '💀🔥',
            moveStyle: 'berserker'
        }
    },
    
    // ============================================================
    // PEG ENTITY - Self-aware gladiator peg
    // ============================================================
    createPegEntity(pegId, playerId, playerColor, initialHole = null) {
        const personalityKeys = Object.keys(this.personalityTypes);
        const randomPersonality = personalityKeys[Math.floor(Math.random() * personalityKeys.length)];
        
        const entity = {
            // Identity
            id: pegId,
            playerId: playerId,
            color: playerColor,
            name: this._generatePegName(playerId, pegId),
            
            // Position awareness
            currentHole: initialHole,
            previousHole: null,
            holeType: initialHole ? this._getHoleType(initialHole) : 'holding',
            
            // Movement state
            isMoving: false,
            targetHole: null,
            expectedHops: 0,
            actualHops: 0,
            movePath: [],
            
            // Personality
            personality: this.personalityTypes[randomPersonality],
            mood: 'ready',  // ready, hunting, retreating, celebrating, furious
            
            // Combat stats
            captureCount: 0,
            capturedCount: 0,
            lastCapture: null,
            lastCapturedBy: null,
            
            // Completion state
            completedCircuit: false,
            eligibleForSafeZone: false,
            lockedToSafeZone: false,
            onFasttrack: false,
            inBullseye: false,
            isFinished: false,
            
            // Methods
            getPersonalityEmoji: function() {
                return this.personality.emoji;
            },
            
            getMoodEmoji: function() {
                const moods = {
                    ready: '😤',
                    hunting: '👁️',
                    retreating: '😰',
                    celebrating: '🎉',
                    furious: '🤬'
                };
                return moods[this.mood] || '😐';
            }
        };
        
        this.pegs.set(pegId, entity);
        this.captureStats.set(pegId, { captures: 0, captured: 0, ratio: 0 });
        
        this._logManifold('PEG_CREATED', {
            pegId,
            playerId,
            playerColor,
            personality: entity.personality.id,
            name: entity.name
        });
        
        return entity;
    },
    
    // ============================================================
    // HOP-COUNTING MOVEMENT - Self-aware traversal
    // ============================================================
    
    /**
     * Begin a move - peg knows its target and will count hops
     */
    beginMove(pegId, targetHole, cardValue, path = []) {
        const peg = this.pegs.get(pegId);
        if (!peg) return null;
        
        peg.isMoving = true;
        peg.targetHole = targetHole;
        peg.expectedHops = cardValue;
        peg.actualHops = 0;
        peg.movePath = path.length > 0 ? [...path] : [peg.currentHole];
        peg.mood = 'hunting';
        
        this._logManifold('MOVE_BEGIN', {
            pegId,
            from: peg.currentHole,
            target: targetHole,
            expectedHops: cardValue,
            personality: peg.personality.id,
            mood: peg.mood
        });
        
        console.log(`${peg.personality.emoji} [${peg.name}] Beginning move: ${peg.currentHole} → ${targetHole} (${cardValue} hops expected)`);
        
        return {
            peg,
            from: peg.currentHole,
            target: targetHole,
            expectedHops: cardValue
        };
    },
    
    /**
     * Register a single hop - peg counts each hole it passes
     */
    registerHop(pegId, newHole) {
        const peg = this.pegs.get(pegId);
        if (!peg || !peg.isMoving) return null;
        
        peg.previousHole = peg.currentHole;
        peg.currentHole = newHole;
        peg.actualHops++;
        peg.movePath.push(newHole);
        peg.holeType = this._getHoleType(newHole);
        
        // Self-correction check
        if (peg.actualHops === peg.expectedHops && newHole !== peg.targetHole) {
            console.warn(`⚠️ [${peg.name}] HOP MISMATCH! Expected to reach ${peg.targetHole} but at ${newHole}`);
            console.warn(`⚠️ [${peg.name}] Adjusting target to actual landing position`);
            
            this._logManifold('MOVE_SELF_CORRECT', {
                pegId,
                expectedTarget: peg.targetHole,
                actualLanding: newHole,
                hops: peg.actualHops
            });
            
            // Self-correct: the peg stays where it actually landed
            peg.targetHole = newHole;
        }
        
        return {
            hop: peg.actualHops,
            position: newHole,
            remaining: peg.expectedHops - peg.actualHops,
            onTarget: newHole === peg.targetHole
        };
    },
    
    /**
     * Complete the move - verify hop count
     */
    completeMove(pegId) {
        const peg = this.pegs.get(pegId);
        if (!peg) return null;
        
        const result = {
            pegId,
            from: peg.movePath[0],
            to: peg.currentHole,
            expectedHops: peg.expectedHops,
            actualHops: peg.actualHops,
            path: [...peg.movePath],
            verified: peg.actualHops === peg.expectedHops,
            corrected: peg.currentHole !== peg.targetHole
        };
        
        if (!result.verified) {
            console.warn(`🚨 [${peg.name}] HOP COUNT VERIFICATION FAILED!`);
            console.warn(`   Expected: ${peg.expectedHops}, Actual: ${peg.actualHops}`);
            peg.mood = 'furious';
        } else {
            peg.mood = 'ready';
            console.log(`✅ [${peg.name}] Move verified: ${peg.actualHops} hops ✓`);
        }
        
        // Update state flags based on final position
        this._updatePegState(peg);
        
        peg.isMoving = false;
        peg.targetHole = null;
        
        this._logManifold('MOVE_COMPLETE', {
            ...result,
            personality: peg.personality.id,
            mood: peg.mood
        });
        
        if (this.onPegMoved) {
            this.onPegMoved(result);
        }
        
        return result;
    },
    
    // ============================================================
    // CAPTURE SYSTEM - Gladiator combat with DRAMATIC CUTSCENES
    // ============================================================
    
    /**
     * Execute a capture - the peg JUMPS on opponent, sending them flying!
     * Triggers a dramatic cutscene with crowd reactions.
     */
    executeCapture(capturerPegId, victimPegId, captureHole) {
        const capturer = this.pegs.get(capturerPegId);
        const victim = this.pegs.get(victimPegId);
        
        if (!capturer || !victim) return null;
        
        // Update stats
        capturer.captureCount++;
        capturer.lastCapture = { victimId: victimPegId, hole: captureHole, time: Date.now() };
        capturer.mood = 'celebrating';
        
        victim.capturedCount++;
        victim.lastCapturedBy = { capturerId: capturerPegId, hole: captureHole, time: Date.now() };
        victim.mood = 'furious';
        
        // Update capture stats
        const capturerStats = this.captureStats.get(capturerPegId);
        capturerStats.captures++;
        capturerStats.ratio = capturerStats.captures / Math.max(1, capturerStats.captured);
        
        const victimStats = this.captureStats.get(victimPegId);
        victimStats.captured++;
        victimStats.ratio = victimStats.captures / Math.max(1, victimStats.captured);
        
        // Generate taunts!
        const capturerTaunt = this._getRandomTaunt(capturer.personality.tauntOnCapture);
        const victimResponse = this._getRandomTaunt(victim.personality.tauntOnCaptured);
        
        // Is this a RIVALRY capture? Extra dramatic!
        const isRivalry = capturer.rivalPegId === victimPegId || victim.rivalPegId === capturerPegId;
        
        // Generate the DRAMATIC CUTSCENE
        const cutscene = this._generateCaptureCutscene(capturer, victim, captureHole, isRivalry);
        
        const captureEvent = {
            capturer: {
                id: capturerPegId,
                name: capturer.name,
                personality: capturer.personality.id,
                emoji: capturer.personality.emoji,
                taunt: capturerTaunt,
                totalCaptures: capturer.captureCount
            },
            victim: {
                id: victimPegId,
                name: victim.name,
                personality: victim.personality.id,
                emoji: victim.personality.emoji,
                response: victimResponse,
                timesCaptured: victim.capturedCount
            },
            hole: captureHole,
            timestamp: Date.now(),
            cutscene: cutscene,
            isRivalry: isRivalry
        };
        
        // Log the DRAMATIC cutscene to console
        this._playCutsceneInConsole(cutscene, capturer, victim, capturerTaunt, victimResponse);
        
        this._logManifold('CAPTURE', captureEvent);
        
        if (this.onPegCaptured) {
            this.onPegCaptured(captureEvent);
        }
        
        // Trigger cutscene callback for visual rendering
        if (this.onCutscene) {
            this.onCutscene(cutscene);
        }
        
        return captureEvent;
    },
    
    /**
     * Generate a dramatic capture cutscene
     */
    _generateCaptureCutscene(capturer, victim, captureHole, isRivalry) {
        // Pick throw style based on personality (escalates for rivalries!)
        const throwStyleKey = this._getJumpStyleForPersonality(capturer.personality.id, isRivalry);
        const throwStyle = this.captureAnimations.throwStyles[throwStyleKey];
        
        // Random arc for the victim's flight (pick matching arc for throw type)
        let arcOptions = this.captureAnimations.arcTypes;
        
        // Match arc to throw type for extra drama
        if (throwStyleKey === 'JAVELIN') {
            arcOptions = arcOptions.filter(a => a.name === 'javelin' || a.name === 'quick');
        } else if (throwStyleKey === 'SPIRAL_FOOTBALL') {
            arcOptions = arcOptions.filter(a => a.name === 'spiral' || a.name === 'stylish');
        } else if (throwStyleKey === 'DROP_KICK') {
            arcOptions = arcOptions.filter(a => a.name === 'dropkick' || a.name === 'epic');
        }
        if (arcOptions.length === 0) arcOptions = this.captureAnimations.arcTypes;
        
        const arc = arcOptions[Math.floor(Math.random() * arcOptions.length)];
        
        // Random landing style
        const landingStyle = this.captureAnimations.landings[
            Math.floor(Math.random() * this.captureAnimations.landings.length)
        ];
        
        // Get victory dance for the capturer!
        const victoryDance = this._getVictoryDance(capturer.personality.id);
        
        // Crowd reactions
        const crowdReactionPool = isRivalry ? this.crowdReactions.EPIC_CAPTURE : this.crowdReactions.CAPTURE;
        const crowdReaction = crowdReactionPool[Math.floor(Math.random() * crowdReactionPool.length)];
        const somersaultComment = this.crowdReactions.SOMERSAULT[
            Math.floor(Math.random() * this.crowdReactions.SOMERSAULT.length)
        ];
        const landingComment = this.crowdReactions.LANDING[landingStyle] ?
            this.crowdReactions.LANDING[landingStyle][
                Math.floor(Math.random() * this.crowdReactions.LANDING[landingStyle].length)
            ] : "What a landing!";
        
        // Calculate victim flight arc
        const impactMultiplier = isRivalry ? 1.5 : 1.0;
        const launchHeight = 50 + (throwStyle.height * impactMultiplier) + (Math.random() * 30);
        
        return {
            type: 'CAPTURE_CUTSCENE',
            duration: 3000 + arc.hangTime + victoryDance.duration, // Total cutscene duration
            isRivalry: isRivalry,
            
            // Phase 1: The Grab & Throw (hunter grabs and hurls victim)
            hunterThrow: {
                style: throwStyleKey,
                name: throwStyle.name,
                description: throwStyle.description,
                height: throwStyle.height,
                duration: throwStyle.duration,
                impact: throwStyle.impact,
                throwAngle: throwStyle.throwAngle || 45,
                spinType: throwStyle.spinType || 'none',
                animation: throwStyle.animation
            },
            
            // Phase 2: The Impact (moment of capture)
            impact: {
                location: captureHole,
                force: throwStyle.impact,
                shockwave: isRivalry || throwStyle.impact === 'massive' || throwStyle.impact === 'legendary',
                slowMotion: isRivalry,
                cameraShake: throwStyle.impact === 'massive' || throwStyle.impact === 'devastating' || throwStyle.impact === 'legendary'
            },
            
            // Phase 3: The Flight (victim springs/flies into the air)
            victimFlight: {
                trajectory: arc.name,
                style: arc.style,
                launchAngle: throwStyle.throwAngle || arc.angle,
                peakHeight: launchHeight,
                spinCount: arc.spins * impactMultiplier,
                spinAxis: Math.random() > 0.5 ? 'forward' : 'backward',
                spiralRotations: arc.spiralRotations || 0,
                wobble: arc.wobble || false,
                hangTime: arc.hangTime * impactMultiplier,
                expression: this._getVictimExpression()
            },
            
            // Phase 4: The Landing (victim lands in holding)
            victimLanding: {
                style: landingStyle,
                destination: `holding-${victim.playerId}`,
                bounceCount: landingStyle === 'BOUNCE' ? Math.floor(Math.random() * 3) + 1 : 0,
                dustCloud: landingStyle === 'SPLAT' || landingStyle === 'CRATER',
                craterSize: landingStyle === 'CRATER' ? 'large' : null
            },
            
            // Phase 5: Victory Dance!
            victoryDance: {
                name: victoryDance.name,
                duration: victoryDance.duration,
                description: victoryDance.description,
                personality: capturer.personality.id
            },
            
            // Crowd Reactions
            crowd: {
                mainReaction: crowdReaction,
                somersaultComment: somersaultComment,
                landingComment: landingComment,
                victoryDanceReaction: this._getVictoryDanceReaction(victoryDance.name),
                volume: isRivalry ? 'DEAFENING' : 'LOUD',
                waveEffect: isRivalry
            },
            
            // Audio cues
            soundEffects: [
                { time: 0, sound: 'crowd_anticipation' },
                { time: throwStyle.duration * 0.3, sound: 'grab_opponent' },
                { time: throwStyle.duration * 0.7, sound: `throw_${throwStyleKey.toLowerCase()}` },
                { time: throwStyle.duration, sound: 'launch_woosh' },
                { time: throwStyle.duration + 100, sound: 'spring_launch' },
                { time: throwStyle.duration + 200, sound: 'crowd_roar' },
                { time: throwStyle.duration + arc.hangTime, sound: 'landing_' + landingStyle.toLowerCase() },
                { time: throwStyle.duration + arc.hangTime + 200, sound: 'crowd_applause' },
                { time: throwStyle.duration + arc.hangTime + 300, sound: 'victory_dance_music' }
            ]
        };
    },
    
    /**
     * Get crowd reaction to victory dance
     */
    _getVictoryDanceReaction(danceName) {
        const reactions = {
            'sword_salute': "The crowd salutes back!",
            'battle_cry': "WARRIORS UNITE!!!",
            'flex_pose': "💪 LOOK AT THOSE MUSCLES!",
            'moonwalk': "🕺 SMOOTH CRIMINAL!",
            'magic_flourish': "✨ INCREDIBLE!",
            'backflip': "PERFECT FORM!",
            'shield_bash': "DEFENDER OF THE REALM!",
            'stoic_nod': "Respect.",
            'salute': "🎖️ HONOR!",
            'victory_lap': "ZOOM ZOOM ZOOM!",
            'lightning_pose': "⚡ LIKE A BOLT!",
            'speed_blur': "CAN'T EVEN SEE THEM!",
            'chess_checkmate': "CHECKMATE!",
            'finger_temple': "BIG BRAIN PLAY!",
            'slow_clap': "...clap...clap...clap...",
            'rage_stomp': "THE GROUND IS SHAKING!",
            'primal_roar': "RAAAAAAWR!!!",
            'ground_pound': "EARTHQUAKE!!!",
            'fire_breath': "🔥 HOT HOT HOT!"
        };
        return reactions[danceName] || "THE CROWD GOES WILD!!!";
    },
    
    /**
     * Play the cutscene in console (for debug/fun)
     * 🎬 DRAMATIC CAPTURE CUTSCENE with throws, somersaults, and victory dances!
     */
    _playCutsceneInConsole(cutscene, capturer, victim, capturerTaunt, victimResponse) {
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║           🎬 D R A M A T I C   C U T S C E N E 🎬            ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        
        if (cutscene.isRivalry) {
            console.log('║  ⚡⚡⚡ R I V A L R Y   M A T C H ! ⚡⚡⚡                     ║');
            console.log('╠══════════════════════════════════════════════════════════════╣');
        }
        
        // Phase 1: The Grab & Throw
        console.log(`║  🤜 ${capturer.name} GRABS ${victim.name}!`);
        console.log(`║     "${cutscene.hunterThrow.name}" - ${cutscene.hunterThrow.description}`);
        console.log('║');
        
        // Show throw type
        if (cutscene.hunterThrow.style === 'JAVELIN') {
            console.log('║     🎯 Winds up... JAVELIN THROW!');
            console.log('║     ────────═══════════════════════▶ 💨');
        } else if (cutscene.hunterThrow.style === 'SPIRAL_FOOTBALL') {
            console.log('║     🏈 Spins it up... PERFECT SPIRAL!');
            console.log('║     ~~~~◎~~~~◎~~~~◎~~~~◎~~~~▶ 🌀');
        } else if (cutscene.hunterThrow.style === 'DROP_KICK') {
            console.log('║     🦶 Sets up... DROP KICK!!!');
            console.log('║              🚀');
            console.log('║             ╱');
            console.log('║     👟====╱ BOOT TO THE MOON!!!');
        } else if (cutscene.hunterThrow.style === 'YEET') {
            console.log('║     💪 Grabs with both hands...');
            console.log('║     Y E E E E E E E T ! ! !');
            console.log('║     ════════════════════════════════════▶ 🌟');
        } else if (cutscene.hunterThrow.style === 'SUPLEX') {
            console.log('║     🤼 Grabs from behind... SUPLEX!');
            console.log('║        ╭─────╮');
            console.log('║        │ 💥  │ SLAM!');
            console.log('║        ╰─────╯');
        } else if (cutscene.hunterThrow.style === 'UPPERCUT') {
            console.log('║     👊 Winds up... UPPERCUT!');
            console.log('║                    🌟');
            console.log('║                  ╱');
            console.log('║     💥 POW! ══╱');
        } else {
            console.log(`║     💥 IMPACT! ${cutscene.impact.force.toUpperCase()} FORCE!`);
        }
        
        if (cutscene.impact.shockwave) console.log('║     ～～～ SHOCKWAVE ～～～');
        console.log('║');
        
        // Phase 2: The Flight
        console.log(`║  🌀 ${victim.name} FLIES through the air! ${cutscene.victimFlight.expression}`);
        console.log(`║     Trajectory: ${cutscene.victimFlight.style.toUpperCase()}!`);
        console.log(`║     Somersaults: ${cutscene.victimFlight.spinCount.toFixed(1)}!`);
        console.log(`║     Peak Height: ${cutscene.victimFlight.peakHeight.toFixed(0)}ft!`);
        if (cutscene.victimFlight.spiralRotations > 0) {
            console.log(`║     Spiral Spins: ${cutscene.victimFlight.spiralRotations}!`);
        }
        console.log('║');
        
        // Crowd reaction
        console.log(`║  👥 CROWD: ${cutscene.crowd.mainReaction}`);
        console.log(`║  👥 "${cutscene.crowd.somersaultComment}"`);
        console.log('║');
        
        // Phase 3: Landing
        console.log(`║  📍 LANDING: ${cutscene.victimLanding.style}!`);
        if (cutscene.victimLanding.dustCloud) console.log('║     💨 *DUST CLOUD*');
        if (cutscene.victimLanding.craterSize) console.log('║     🕳️ *CREATES A CRATER*');
        console.log(`║  👥 "${cutscene.crowd.landingComment}"`);
        console.log('║');
        
        // Phase 4: Victory Dance!
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log(`║  💃 VICTORY DANCE: ${cutscene.victoryDance.name.replace(/_/g, ' ').toUpperCase()}!`);
        console.log(`║     ${cutscene.victoryDance.description}`);
        console.log(`║  👥 "${cutscene.crowd.victoryDanceReaction}"`);
        console.log('║');
        
        // Taunts
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log(`║  ${capturer.personality.emoji} ${capturer.name}: "${capturerTaunt}"`);
        console.log(`║  ${victim.personality.emoji} ${victim.name}: "${victimResponse}"`);
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('\n');
    },
    
    /**
     * Get throw style based on personality
     * Each personality has their signature throw!
     */
    _getJumpStyleForPersonality(personalityId, isRivalry = false) {
        // Normal throws - personality signatures
        const normalStyles = {
            'warrior': 'STOMP',
            'trickster': 'SPIRAL_FOOTBALL',  // Tricksters love the spiral!
            'guardian': 'SUPLEX',            // Guardians use grappling
            'speedster': 'UPPERCUT',         // Fast and explosive
            'tactician': 'JAVELIN',          // Precise and calculated
            'berserker': 'CANNONBALL'        // Maximum destruction
        };
        
        // Rivalry throws - even MORE dramatic!
        const rivalryStyles = {
            'warrior': 'DROP_KICK',          // BOOT TO THE MOON!
            'trickster': 'YEET',             // YEEEEEET!!!
            'guardian': 'BODYSLAM',          // Full power tackle
            'speedster': 'UPPERCUT',         // Lightning fast
            'tactician': 'JAVELIN',          // Precise execution
            'berserker': 'YEET'              // MAXIMUM YEET!
        };
        
        const styles = isRivalry ? rivalryStyles : normalStyles;
        return styles[personalityId] || 'STOMP';
    },
    
    /**
     * Get a victory dance for a personality
     */
    _getVictoryDance(personalityId) {
        const dances = this.captureAnimations.victoryDances[personalityId.toUpperCase()];
        if (!dances || dances.length === 0) {
            return { name: 'generic_celebration', duration: 1000, description: 'Happy dance!' };
        }
        return dances[Math.floor(Math.random() * dances.length)];
    },
    
    /**
     * Get a random victim expression
     */
    _getVictimExpression() {
        const expressions = ['😲', '😵', '🤣', '😤', '🎭', '😱', '🤯', '😅'];
        return expressions[Math.floor(Math.random() * expressions.length)];
    },
    
    /**
     * Check if a peg wants to take a capture opportunity
     * Based on personality
     */
    wantsToCapture(pegId) {
        const peg = this.pegs.get(pegId);
        if (!peg) return false;
        
        // Personality-based capture decision
        const roll = Math.random();
        const wants = roll < peg.personality.captureChance;
        
        if (wants) {
            peg.mood = 'hunting';
            console.log(`${peg.personality.emoji} [${peg.name}] spots prey... (${(peg.personality.captureChance * 100).toFixed(0)}% capture chance)`);
        }
        
        return wants;
    },
    
    // ============================================================
    // VICTORY & FINISHING
    // ============================================================
    
    /**
     * Peg reaches the winner hole
     */
    declareVictory(pegId) {
        const peg = this.pegs.get(pegId);
        if (!peg) return null;
        
        peg.isFinished = true;
        peg.mood = 'celebrating';
        
        const victoryEvent = {
            pegId,
            name: peg.name,
            personality: peg.personality.id,
            emoji: peg.personality.emoji,
            victoryPose: peg.personality.victoryPose,
            captures: peg.captureCount,
            captured: peg.capturedCount,
            timestamp: Date.now()
        };
        
        console.log(`\n${'🏆'.repeat(20)}`);
        console.log(`${peg.personality.victoryPose} ${peg.name} HAS REACHED THE WINNER HOLE! ${peg.personality.victoryPose}`);
        console.log(`   Captures: ${peg.captureCount} | Times Captured: ${peg.capturedCount}`);
        console.log(`${'🏆'.repeat(20)}\n`);
        
        this._logManifold('VICTORY', victoryEvent);
        
        if (this.onPegVictory) {
            this.onPegVictory(victoryEvent);
        }
        
        return victoryEvent;
    },
    
    // ============================================================
    // UTILITY METHODS
    // ============================================================
    
    getPeg(pegId) {
        return this.pegs.get(pegId);
    },
    
    getPlayerPegs(playerId) {
        return Array.from(this.pegs.values()).filter(p => p.playerId === playerId);
    },
    
    getPegPosition(pegId) {
        const peg = this.pegs.get(pegId);
        return peg ? peg.currentHole : null;
    },
    
    updatePegPosition(pegId, newHole) {
        const peg = this.pegs.get(pegId);
        if (!peg) return;
        
        peg.previousHole = peg.currentHole;
        peg.currentHole = newHole;
        peg.holeType = this._getHoleType(newHole);
        this._updatePegState(peg);
    },
    
    setPersonality(pegId, personalityType) {
        const peg = this.pegs.get(pegId);
        if (!peg || !this.personalityTypes[personalityType]) return false;
        
        peg.personality = this.personalityTypes[personalityType];
        return true;
    },
    
    getCaptureLeaderboard() {
        return Array.from(this.captureStats.entries())
            .map(([pegId, stats]) => ({
                pegId,
                peg: this.pegs.get(pegId),
                ...stats
            }))
            .sort((a, b) => b.captures - a.captures);
    },
    
    // ============================================================
    // INTERNAL HELPERS
    // ============================================================
    
    _generatePegName(playerId, pegId) {
        const gladiatorNames = [
            'Maximus', 'Spartacus', 'Achilles', 'Leonidas', 'Boudicca',
            'Crixus', 'Gannicus', 'Oenomaus', 'Flamma', 'Tetraites',
            'Priscus', 'Verus', 'Commodus', 'Tigris', 'Narcissus',
            'Spiculus', 'Carpophorus', 'Hermes', 'Andabata', 'Rex'
        ];
        
        const index = parseInt(pegId.replace(/\D/g, '')) || 0;
        const baseIndex = (playerId * 5 + index) % gladiatorNames.length;
        
        return gladiatorNames[baseIndex];
    },
    
    _getHoleType(holeId) {
        if (!holeId) return 'unknown';
        if (holeId.startsWith('hold-')) return 'holding';
        if (holeId.startsWith('safe-')) return 'safezone';
        if (holeId.startsWith('home-')) return 'home';
        if (holeId.startsWith('ft-')) return 'fasttrack';
        if (holeId === 'center') return 'center';
        return 'track';
    },
    
    _updatePegState(peg) {
        const hole = peg.currentHole;
        
        if (hole.startsWith('safe-')) {
            peg.eligibleForSafeZone = true;
            peg.lockedToSafeZone = true;
            peg.onFasttrack = false;
            peg.inBullseye = false;
        } else if (hole.startsWith('ft-')) {
            // NOTE: Do NOT set peg.onFasttrack here!
            // game_engine.js handles FastTrack state correctly:
            // - Sets onFasttrack=true when entering FastTrack intentionally
            // - Sets onFasttrack=false when landing on own ft-* via perimeter
            // Overwriting it here would cause bugs where pegs on their own
            // FastTrack exit hole have no legal moves because they're
            // incorrectly marked as "in FastTrack mode"
            peg.inBullseye = false;
        } else if (hole === 'center') {
            peg.inBullseye = true;
            peg.onFasttrack = false;
        } else if (hole.startsWith('home-')) {
            peg.isFinished = true;
        } else if (hole.startsWith('hold-')) {
            peg.eligibleForSafeZone = false;
            peg.lockedToSafeZone = false;
            peg.onFasttrack = false;
            peg.inBullseye = false;
            peg.completedCircuit = false;
        } else {
            peg.inBullseye = false;
            // Track positions - keep existing safe zone eligibility
        }
    },
    
    _getRandomTaunt(taunts) {
        if (!taunts || taunts.length === 0) return '';
        return taunts[Math.floor(Math.random() * taunts.length)];
    },
    
    _logManifold(eventType, data) {
        const event = {
            id: `peg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: eventType,
            timestamp: Date.now(),
            dimension: 'PEG_SUBSTRATE',
            data
        };
        
        this.manifoldLog.push(event);
        
        // Keep log at reasonable size
        if (this.manifoldLog.length > 500) {
            this.manifoldLog = this.manifoldLog.slice(-300);
        }
        
        if (this.onManifoldEvent) {
            this.onManifoldEvent(event);
        }
        
        return event;
    },
    
    // ============================================================
    // MANIFOLD QUERIES
    // ============================================================
    
    getManifoldLog(options = {}) {
        let log = [...this.manifoldLog];
        
        if (options.type) {
            log = log.filter(e => e.type === options.type);
        }
        if (options.pegId) {
            log = log.filter(e => e.data?.pegId === options.pegId || 
                                  e.data?.capturerPegId === options.pegId ||
                                  e.data?.victimPegId === options.pegId);
        }
        if (options.since) {
            log = log.filter(e => e.timestamp >= options.since);
        }
        if (options.limit) {
            log = log.slice(-options.limit);
        }
        
        return log;
    },
    
    getManifoldStats() {
        const stats = {
            totalEvents: this.manifoldLog.length,
            totalPegs: this.pegs.size,
            totalCaptures: 0,
            eventsByType: {}
        };
        
        for (const event of this.manifoldLog) {
            stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
            if (event.type === 'CAPTURE') {
                stats.totalCaptures++;
            }
        }
        
        return stats;
    },
    
    // ============================================================
    // RESET
    // ============================================================
    
    reset() {
        this.pegs.clear();
        this.manifoldLog = [];
        this.personalities.clear();
        this.captureStats.clear();
        console.log('🔄 [PegSubstrate] Reset complete');
    }
};

// Make globally available
if (typeof window !== 'undefined') {
    window.PegSubstrate = PegSubstrate;
}

console.log('🎭 [PegSubstrate] Gladiator Peg System loaded - Let the games begin!');
