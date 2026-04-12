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
 * FASTTRACK GAME SOUND EFFECTS (SFX)
 * Theme-Aware Procedural Sound Generation
 * ============================================================
 * 
 * Sound events:
 * - step: Peg moving through holes (traversal)
 * - arrive: Peg reaching destination
 * - fasttrack: Entering FastTrack lane
 * - bullseye: Entering center bullseye
 * - safezone: Entering safe/home zone
 * - boot: Cutting opponent's peg (send home)
 * - victory: Winning the game
 * - drawCard: Drawing a card
 * - extraTurn: Getting an extra turn (6 card)
 * 
 * All sounds procedurally generated - 100% original!
 */

'use strict';

const GameSFX = {
    version: '1.0.0',
    name: 'FastTrack Sound Effects',
    
    // Audio context (shared with MusicSubstrate)
    audioContext: null,
    masterGain: null,
    
    // Volume settings
    volume: 0.6,
    enabled: true,
    
    // Current theme affects sound character
    currentTheme: 'DEFAULT',
    
    // ============================================================
    // THEME SOUND PROFILES
    // Each theme has different sound characteristics
    // ============================================================
    themeProfiles: {
        DEFAULT: {
            stepWave: 'triangle',
            stepBaseFreq: 440,
            arriveChord: [523.25, 659.25, 783.99],  // C major chord
            fasttrackSweep: { start: 300, end: 1200 },
            bullseyeTone: 880,
            safezoneTone: 392,
            bootWave: 'sawtooth',
            victoryScale: [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5]
        },
        SPACE_ACE: {
            stepWave: 'sine',
            stepBaseFreq: 330,
            arriveChord: [329.63, 440, 523.25],  // E minor-ish
            fasttrackSweep: { start: 200, end: 1500 },
            bullseyeTone: 660,
            safezoneTone: 293.66,
            bootWave: 'square',
            victoryScale: [329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 659.25]
        },
        UNDERSEA: {
            stepWave: 'sine',
            stepBaseFreq: 220,
            arriveChord: [261.63, 329.63, 392],  // C major underwater
            fasttrackSweep: { start: 150, end: 800 },
            bullseyeTone: 440,
            safezoneTone: 246.94,
            bootWave: 'triangle',
            victoryScale: [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25]
        },
        ROMAN_COLISEUM: {
            stepWave: 'square',
            stepBaseFreq: 392,
            arriveChord: [392, 493.88, 587.33],  // G major fanfare
            fasttrackSweep: { start: 250, end: 1000 },
            bullseyeTone: 783.99,
            safezoneTone: 349.23,
            bootWave: 'sawtooth',
            victoryScale: [392, 440, 493.88, 523.25, 587.33, 659.25, 739.99, 783.99]
        },
        // Fibonacci theme: frequencies based on golden ratio and Fibonacci sequence
        // Scale uses Fibonacci semitone intervals from A4 (440Hz)
        FIBONACCI: {
            stepWave: 'sine',
            stepBaseFreq: 440,  // A4 - base of Fibonacci scale
            // Chord built from Fibonacci intervals: root, +3 semitones, +8 semitones
            arriveChord: [440, 523.25, 698.46],
            // Sweep uses golden ratio relationship
            fasttrackSweep: { start: 272, end: 1127 },  // 440/φ to 440*2.56 (φ squared)
            bullseyeTone: 712,  // 440 * φ ≈ 712 Hz
            safezoneTone: 272,  // 440 / φ ≈ 272 Hz
            bootWave: 'triangle',
            // Victory scale uses Fibonacci semitone intervals from 440Hz
            victoryScale: [
                440,                                    // Root (0)
                440 * Math.pow(2, 1/12),               // +1 semitone
                440 * Math.pow(2, 2/12),               // +2 semitones
                440 * Math.pow(2, 3/12),               // +3 semitones
                440 * Math.pow(2, 5/12),               // +5 semitones
                440 * Math.pow(2, 8/12),               // +8 semitones
                440 * Math.pow(2, 13/12),              // +13 semitones
                440 * Math.pow(2, 21/12)               // +21 semitones
            ]
        }
    },
    
    // ============================================================
    // INITIALIZATION
    // ============================================================
    
    init() {
        console.log('🔊 [GameSFX] Initialized - awaiting user interaction');
    },
    
    /**
     * Activate audio context (called from user interaction)
     */
    activate() {
        // Share context with MusicSubstrate if available
        if (!this.audioContext && typeof MusicSubstrate !== 'undefined' && MusicSubstrate.audioContext) {
            this.audioContext = MusicSubstrate.audioContext;
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.audioContext.destination);
            console.log('🔊 [GameSFX] Using shared audio context from MusicSubstrate');
            return true;
        }
        
        if (this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            return true;
        }
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.audioContext.destination);
            console.log('🔊 [GameSFX] Audio context activated');
            return true;
        } catch (e) {
            console.error('Could not create audio context:', e);
            return false;
        }
    },
    
    /**
     * Set current theme (affects sound character)
     */
    setTheme(themeName) {
        this.currentTheme = themeName || 'DEFAULT';
        console.log(`🔊 [GameSFX] Theme set to: ${this.currentTheme}`);
    },
    
    /**
     * Get current theme profile
     */
    getProfile() {
        return this.themeProfiles[this.currentTheme] || this.themeProfiles.DEFAULT;
    },
    
    /**
     * Set volume (0-1)
     */
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.masterGain) {
            this.masterGain.gain.value = this.volume;
        }
    },
    
    /**
     * Enable/disable SFX
     */
    toggle() {
        this.enabled = !this.enabled;
        console.log(`🔊 [GameSFX] ${this.enabled ? 'Enabled' : 'Disabled'}`);
        return this.enabled;
    },
    
    // ============================================================
    // SOUND EFFECTS
    // ============================================================
    
    /**
     * STEP SOUND - Peg moving through each hole during traversal
     * Theme-specific: Roman=march drums+trumpet, Undersea=calypso steel drum,
     * Space=laser beam sweep, Default=simple tone
     * @param {number} stepIndex - Current step in the path (0-N)
     * @param {number} totalSteps - Total steps in move
     */
    playStep(stepIndex = 0, totalSteps = 1) {
        if (!this.enabled || !this.activate()) return;
        
        const theme = this.currentTheme;
        const now = this.audioContext.currentTime;
        const progress = totalSteps > 1 ? stepIndex / (totalSteps - 1) : 0;
        
        switch (theme) {
            case 'ROMAN_COLISEUM':
                this._playStepRoman(now, progress, stepIndex);
                break;
            case 'UNDERSEA':
                this._playStepUndersea(now, progress, stepIndex);
                break;
            case 'SPACE_ACE':
                this._playStepSpace(now, progress, stepIndex);
                break;
            default:
                this._playStepDefault(now, progress);
                break;
        }
    },
    
    /**
     * Roman step: alternating march drums (left/right foot) + trumpet stab
     */
    _playStepRoman(now, progress, stepIndex) {
        const ctx = this.audioContext;
        const vol = this.volume;
        
        // Alternating left-right march: kick on even steps, tom on odd
        if (stepIndex % 2 === 0) {
            // Left foot: kick drum
            const kickOsc = ctx.createOscillator();
            const kickGain = ctx.createGain();
            kickOsc.type = 'sine';
            kickOsc.frequency.setValueAtTime(100, now);
            kickOsc.frequency.exponentialRampToValueAtTime(45, now + 0.08);
            kickGain.gain.setValueAtTime(vol * 0.25, now);
            kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            kickOsc.connect(kickGain);
            kickGain.connect(this.masterGain);
            kickOsc.start(now);
            kickOsc.stop(now + 0.15);
        } else {
            // Right foot: tom
            const tomOsc = ctx.createOscillator();
            const tomGain = ctx.createGain();
            tomOsc.type = 'sine';
            tomOsc.frequency.setValueAtTime(85, now);
            tomOsc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
            tomGain.gain.setValueAtTime(vol * 0.20, now);
            tomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            tomOsc.connect(tomGain);
            tomGain.connect(this.masterGain);
            tomOsc.start(now);
            tomOsc.stop(now + 0.15);
        }
        
        // Trumpet stab — pitch rises with progress through move
        const freq = 330 * (1 + progress * 0.5); // G4 rising to ~C5
        const trumpetOsc = ctx.createOscillator();
        const trumpetFilter = ctx.createBiquadFilter();
        const trumpetGain = ctx.createGain();
        trumpetOsc.type = 'sawtooth';
        trumpetOsc.frequency.value = freq;
        trumpetFilter.type = 'lowpass';
        trumpetFilter.frequency.value = 1200;
        trumpetGain.gain.setValueAtTime(0, now);
        trumpetGain.gain.linearRampToValueAtTime(vol * 0.08, now + 0.01);
        trumpetGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        trumpetOsc.connect(trumpetFilter);
        trumpetFilter.connect(trumpetGain);
        trumpetGain.connect(this.masterGain);
        trumpetOsc.start(now);
        trumpetOsc.stop(now + 0.08);
    },
    
    /**
     * Undersea step: calypso steel drum ping + occasional bubble pop
     */
    _playStepUndersea(now, progress, stepIndex) {
        const ctx = this.audioContext;
        const vol = this.volume;
        
        // Steel drum pentatonic scale — bouncy calypso feel
        const pentatonic = [392, 440, 493.88, 587.33, 659.25]; // G4 A4 B4 D5 E5
        const noteIdx = stepIndex % pentatonic.length;
        const freq = pentatonic[noteIdx] * (1 + progress * 0.2);
        
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = 3000;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol * 0.15, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
        
        // Bubble pop on every other step
        if (stepIndex % 2 === 0) {
            const bubbleOsc = ctx.createOscillator();
            const bubbleGain = ctx.createGain();
            bubbleOsc.type = 'sine';
            const bFreq = 800 + Math.random() * 400;
            bubbleOsc.frequency.setValueAtTime(bFreq, now + 0.02);
            bubbleOsc.frequency.exponentialRampToValueAtTime(bFreq + 400, now + 0.05);
            bubbleGain.gain.setValueAtTime(vol * 0.06, now + 0.02);
            bubbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            bubbleOsc.connect(bubbleGain);
            bubbleGain.connect(this.masterGain);
            bubbleOsc.start(now + 0.02);
            bubbleOsc.stop(now + 0.1);
        }
    },
    
    /**
     * Space Ace step: laser beam frequency sweep + secondary whirl
     */
    _playStepSpace(now, progress, stepIndex) {
        const ctx = this.audioContext;
        const vol = this.volume;
        
        // Primary laser beam: fast descending frequency sweep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const startFreq = 1200 + progress * 800;
        const endFreq = 200 + progress * 200;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol * 0.12, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.12);
        
        // Secondary whirl: counter-sweep for sci-fi texture
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(endFreq, now + 0.02);
        osc2.frequency.exponentialRampToValueAtTime(Math.max(startFreq * 0.5, 50), now + 0.06);
        gain2.gain.setValueAtTime(vol * 0.05, now + 0.02);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start(now + 0.02);
        osc2.stop(now + 0.1);
    },
    
    /**
     * Default step: simple tonal click (used by DEFAULT, FIBONACCI, COSMIC)
     */
    _playStepDefault(now, progress) {
        const profile = this.getProfile();
        const freq = profile.stepBaseFreq * (1 + progress * 0.3);
        
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.type = profile.stepWave;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.15, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    },
    
    /**
     * ARRIVE SOUND - Peg reaching final destination
     * Satisfying chord resolution
     */
    playArrive() {
        if (!this.enabled || !this.activate()) return;
        
        const profile = this.getProfile();
        const now = this.audioContext.currentTime;
        
        // Play a nice resolving chord
        profile.arriveChord.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = 'triangle';
            osc.frequency.value = freq;
            
            // Staggered attack for richness
            const attackDelay = i * 0.02;
            gain.gain.setValueAtTime(0, now + attackDelay);
            gain.gain.linearRampToValueAtTime(this.volume * 0.2, now + attackDelay + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(now + attackDelay);
            osc.stop(now + 0.5);
        });
        
        console.log('🔊 [GameSFX] Arrive!');
    },
    
    /**
     * FASTTRACK ENTRY - Exciting rising sweep
     * Player entering the FastTrack lane!
     */
    playFasttrack() {
        if (!this.enabled || !this.activate()) return;
        
        const profile = this.getProfile();
        const now = this.audioContext.currentTime;
        const duration = 0.5;
        
        // Rising sweep oscillator
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(profile.fasttrackSweep.start, now);
        osc.frequency.exponentialRampToValueAtTime(profile.fasttrackSweep.end, now + duration * 0.8);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.05);
        gain.gain.setValueAtTime(this.volume * 0.3, now + duration * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + duration + 0.1);
        
        // Add sparkle layer
        this._playSparkle(now + 0.1, 3);
        
        console.log('🚀 [GameSFX] FastTrack entry!');
    },
    
    /**
     * BULLSEYE ENTRY - Target hit sound with fanfare
     * Center bullseye reached!
     */
    playBullseye() {
        if (!this.enabled || !this.activate()) return;
        
        const profile = this.getProfile();
        const now = this.audioContext.currentTime;
        
        // Main bullseye tone
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.value = profile.bullseyeTone;
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.4, now + 0.02);
        gain.gain.setValueAtTime(this.volume * 0.4, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.7);
        
        // Impact thump
        this._playImpact(now, 0.3);
        
        // Celebration sparkles
        this._playSparkle(now + 0.05, 5);
        
        console.log('🎯 [GameSFX] Bullseye!');
    },
    
    /**
     * SAFE ZONE ENTRY - Warm, secure arrival sound
     * Peg entering home/safe zone
     */
    playSafezone() {
        if (!this.enabled || !this.activate()) return;
        
        const profile = this.getProfile();
        const now = this.audioContext.currentTime;
        
        // Warm pad sound
        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.value = profile.safezoneTone;
        osc2.frequency.value = profile.safezoneTone * 1.5;  // Perfect fifth
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.25, now + 0.05);
        gain.gain.setValueAtTime(this.volume * 0.25, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGain);
        
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.6);
        osc2.stop(now + 0.6);
        
        console.log('🏠 [GameSFX] Safe zone!');
    },
    
    /**
     * BOOT/CUT - Opponent peg sent home!
     * Aggressive, dramatic sound
     */
    playBoot() {
        if (!this.enabled || !this.activate()) return;
        
        const profile = this.getProfile();
        const now = this.audioContext.currentTime;
        
        // Dramatic descending sweep
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = profile.bootWave;
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.4, now + 0.01);
        gain.gain.linearRampToValueAtTime(this.volume * 0.35, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.4);
        
        // Add impact
        this._playImpact(now, 0.5);
        
        // Second hit for emphasis
        setTimeout(() => this._playImpact(this.audioContext.currentTime, 0.3), 120);
        
        console.log('💥 [GameSFX] Boot!');
    },
    
    /**
     * VANQUISH SAD - Slow sad descending wail as vanquished peg arcs to holding
     * Plays over ~2 seconds to match the cinematic arc
     */
    playVanquishSad() {
        if (!this.enabled || !this.activate()) return;
        
        const now = this.audioContext.currentTime;
        
        // Sad descending wail - slow slide down
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(500, now);
        osc1.frequency.exponentialRampToValueAtTime(180, now + 1.8);
        osc1.frequency.exponentialRampToValueAtTime(80, now + 2.4);
        
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.2, now + 0.1);
        gain1.gain.setValueAtTime(this.volume * 0.2, now + 1.2);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        
        osc1.connect(gain1);
        gain1.connect(this.masterGain);
        osc1.start(now);
        osc1.stop(now + 2.6);
        
        // Add a minor-third wobble for sadness
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(600, now + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(214, now + 1.8);
        osc2.frequency.exponentialRampToValueAtTime(95, now + 2.4);
        
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.1, now + 0.15);
        gain2.gain.setValueAtTime(this.volume * 0.1, now + 1.0);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 2.3);
        
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start(now + 0.05);
        osc2.stop(now + 2.4);
        
        // Subtle "womp womp" at the end
        setTimeout(() => {
            const t = this.audioContext.currentTime;
            [220, 185].forEach((freq, i) => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'square';
                osc.frequency.value = freq;
                const start = t + i * 0.25;
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(this.volume * 0.15, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(start);
                osc.stop(start + 0.25);
            });
        }, 2100);
        
        console.log('😢 [GameSFX] Vanquish sad!');
    },
    
    /**
     * VANQUISH DANCE - Quick triumphant jingle for the attacking peg's victory dance
     */
    playVanquishDance() {
        if (!this.enabled || !this.activate()) return;
        
        const now = this.audioContext.currentTime;
        
        // Quick ascending triumphant notes
        const notes = [392, 523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = i < 3 ? 'triangle' : 'square';
            osc.frequency.value = freq;
            
            const noteStart = now + i * 0.08;
            
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(this.volume * 0.25, noteStart + 0.015);
            gain.gain.setValueAtTime(this.volume * 0.25, noteStart + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.2);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(noteStart);
            osc.stop(noteStart + 0.25);
        });
        
        // Add sparkles
        this._playSparkle(now + 0.3, 6);
        
        console.log('💃 [GameSFX] Vanquish dance!');
    },
    
    /**
     * VICTORY - Winner celebration fanfare!
     * Full triumphant scale with sparkles
     */
    playVictory() {
        if (!this.enabled || !this.activate()) return;
        
        const profile = this.getProfile();
        const now = this.audioContext.currentTime;
        
        // Ascending victory scale
        profile.victoryScale.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = i < 4 ? 'triangle' : 'square';
            osc.frequency.value = freq;
            
            const noteStart = now + i * 0.12;
            const noteDuration = 0.4;
            
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(this.volume * 0.3, noteStart + 0.02);
            gain.gain.setValueAtTime(this.volume * 0.3, noteStart + noteDuration * 0.5);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDuration);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(noteStart);
            osc.stop(noteStart + noteDuration + 0.05);
        });
        
        // Final chord resolution
        setTimeout(() => {
            const finalNow = this.audioContext.currentTime;
            [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                
                osc.type = 'triangle';
                osc.frequency.value = freq;
                
                gain.gain.setValueAtTime(0, finalNow);
                gain.gain.linearRampToValueAtTime(this.volume * 0.35, finalNow + 0.03);
                gain.gain.setValueAtTime(this.volume * 0.35, finalNow + 0.8);
                gain.gain.exponentialRampToValueAtTime(0.001, finalNow + 1.5);
                
                osc.connect(gain);
                gain.connect(this.masterGain);
                
                osc.start(finalNow);
                osc.stop(finalNow + 1.6);
            });
            
            // Celebration sparkles
            this._playSparkle(finalNow, 10);
        }, profile.victoryScale.length * 120 + 100);
        
        console.log('🏆 [GameSFX] Victory!');
    },
    
    /**
     * APPLAUSE - Crowd applause sound effect for victory ceremony
     * Simulated with filtered noise bursts for a clapping crowd effect
     */
    playApplause(durationSec = 4) {
        if (!this.enabled || !this.activate()) return;
        
        const now = this.audioContext.currentTime;
        const ctx = this.audioContext;
        
        // Create noise buffer for applause simulation
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * durationSec;
        const buffer = ctx.createBuffer(2, length, sampleRate);
        
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                // Noise with rhythmic amplitude modulation to simulate clapping
                const t = i / sampleRate;
                // Multiple layered clap rhythms
                const clap1 = Math.abs(Math.sin(t * 12.5 * Math.PI)); // ~6 claps/sec
                const clap2 = Math.abs(Math.sin(t * 10.3 * Math.PI + 0.7));
                const clap3 = Math.abs(Math.sin(t * 8.7 * Math.PI + 1.4));
                const clapEnv = (clap1 * 0.4 + clap2 * 0.35 + clap3 * 0.25);
                // Fade in/out envelope
                const fadeIn = Math.min(1, t / 0.5);
                const fadeOut = Math.min(1, (durationSec - t) / 1.0);
                const envelope = fadeIn * fadeOut;
                data[i] = (Math.random() * 2 - 1) * clapEnv * envelope;
            }
        }
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        
        // Band-pass filter to sound like clapping (remove low rumble and high hiss)
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 2800;
        bandpass.Q.value = 0.5;
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.volume * 0.2, now);
        
        source.connect(bandpass);
        bandpass.connect(gain);
        gain.connect(this.masterGain);
        
        source.start(now);
        source.stop(now + durationSec);
        
        console.log('👏 [GameSFX] Applause!');
    },
    
    /**
     * DRAW CARD - Card flip/draw sound
     */
    playDrawCard() {
        if (!this.enabled || !this.activate()) return;
        
        const now = this.audioContext.currentTime;
        
        // Quick snap sound
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.15, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.1);
        
        // Soft reveal tone
        setTimeout(() => {
            const revealNow = this.audioContext.currentTime;
            const osc2 = this.audioContext.createOscillator();
            const gain2 = this.audioContext.createGain();
            
            osc2.type = 'sine';
            osc2.frequency.value = 523.25;
            
            gain2.gain.setValueAtTime(0, revealNow);
            gain2.gain.linearRampToValueAtTime(this.volume * 0.1, revealNow + 0.02);
            gain2.gain.exponentialRampToValueAtTime(0.001, revealNow + 0.15);
            
            osc2.connect(gain2);
            gain2.connect(this.masterGain);
            
            osc2.start(revealNow);
            osc2.stop(revealNow + 0.2);
        }, 80);
    },
    
    /**
     * EXTRA TURN - 6 card special sound!
     */
    playExtraTurn() {
        if (!this.enabled || !this.activate()) return;
        
        const now = this.audioContext.currentTime;
        
        // Exciting rising arpeggio
        const notes = [261.63, 329.63, 392, 523.25, 659.25];
        notes.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = 'triangle';
            osc.frequency.value = freq;
            
            const noteStart = now + i * 0.06;
            
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(this.volume * 0.2, noteStart + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.2);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(noteStart);
            osc.stop(noteStart + 0.25);
        });
        
        console.log('🎲 [GameSFX] Extra turn!');
    },
    
    /**
     * ROYAL EXIT - King/Queen/Jack exiting bullseye
     */
    playRoyalExit() {
        if (!this.enabled || !this.activate()) return;
        
        const now = this.audioContext.currentTime;
        
        // Regal fanfare
        const fanfare = [392, 523.25, 659.25, 783.99];
        fanfare.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = 'square';
            osc.frequency.value = freq;
            
            const noteStart = now + i * 0.1;
            
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(this.volume * 0.25, noteStart + 0.02);
            gain.gain.setValueAtTime(this.volume * 0.25, noteStart + 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.35);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(noteStart);
            osc.stop(noteStart + 0.4);
        });
        
        console.log('👑 [GameSFX] Royal exit!');
    },
    
    /**
     * PEG ENTRY - New peg entering the board (A, 6, Joker)
     */
    playPegEntry() {
        if (!this.enabled || !this.activate()) return;
        
        const now = this.audioContext.currentTime;
        
        // "Pop" onto board
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);
        osc.frequency.exponentialRampToValueAtTime(350, now + 0.15);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.3);
        
        console.log('➕ [GameSFX] Peg entry!');
    },
    
    /**
     * JOKER BACKWARD - Special effect for Joker cutting opponent by moving backward
     * Jack-in-the-box pop + maniacal laugh + fanfare
     */
    playJokerBackward() {
        if (!this.enabled || !this.activate()) return;
        
        const now = this.audioContext.currentTime;
        
        // 1. Jack-in-the-box "BOING" spring sound
        const springOsc = this.audioContext.createOscillator();
        const springGain = this.audioContext.createGain();
        
        springOsc.type = 'sawtooth';
        springOsc.frequency.setValueAtTime(80, now);
        springOsc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
        springOsc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
        
        springGain.gain.setValueAtTime(0, now);
        springGain.gain.linearRampToValueAtTime(this.volume * 0.4, now + 0.02);
        springGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        
        springOsc.connect(springGain);
        springGain.connect(this.masterGain);
        springOsc.start(now);
        springOsc.stop(now + 0.4);
        
        // 2. Maniacal laugh (descending chromatic notes)
        const laughNotes = [659, 622, 587, 554, 523, 494, 466]; // E5 down to Bb4
        laughNotes.forEach((freq, i) => {
            const noteStart = now + 0.3 + (i * 0.08);
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, noteStart);
            
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(this.volume * 0.25, noteStart + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.12);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(noteStart);
            osc.stop(noteStart + 0.15);
        });
        
        // 3. Circus fanfare (ascending triumphant notes)
        const fanfareNotes = [523, 659, 784, 1047]; // C5, E5, G5, C6
        fanfareNotes.forEach((freq, i) => {
            const noteStart = now + 0.9 + (i * 0.15);
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, noteStart);
            
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(this.volume * 0.3, noteStart + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.2);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(noteStart);
            osc.stop(noteStart + 0.25);
        });
        
        // 4. Sparkle celebration at the end
        setTimeout(() => {
            this._playSparkle(this.audioContext.currentTime, 8);
        }, 1400);
        
        console.log('🃏 [GameSFX] Joker Backward - SURPRISE!');
    },
    
    // ============================================================
    // HELPER SOUNDS
    // ============================================================
    
    /**
     * Sparkle/shimmer effect (celebration, achievement)
     */
    _playSparkle(startTime, count = 3) {
        const now = startTime || this.audioContext.currentTime;
        
        for (let i = 0; i < count; i++) {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = 'sine';
            const freq = 1200 + Math.random() * 2000;
            osc.frequency.value = freq;
            
            const sparkleStart = now + i * 0.05 + Math.random() * 0.1;
            
            gain.gain.setValueAtTime(0, sparkleStart);
            gain.gain.linearRampToValueAtTime(this.volume * 0.1, sparkleStart + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, sparkleStart + 0.1);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(sparkleStart);
            osc.stop(sparkleStart + 0.15);
        }
    },
    
    /**
     * Impact/thump effect (collision, boot)
     */
    _playImpact(startTime, intensity = 0.5) {
        const now = startTime || this.audioContext.currentTime;
        
        // Low frequency thump
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * intensity, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.2);
    },
    
    // ============================================================
    // CROWD / AUDIENCE REACTION SYSTEM
    // ============================================================
    // Per-theme procedural crowd sounds that react to gameplay
    // Roman: horns, stomping, chanting
    // Space: synth whooshes, comm chatter
    // Undersea: whale calls, bubble pops
    // Default/Cosmic: stadium crowd
    // Fibonacci: harmonic resonance swells
    
    /**
     * Play crowd reaction sound matching current theme
     * @param {string} reaction - roaring, cheering, excited, gasp, boo, anticipation
     */
    playCrowdReaction(reaction) {
        if (!this.enabled || !this.activate()) return;
        
        const theme = this.currentTheme;
        const now = this.audioContext.currentTime;
        
        // Route to theme-specific crowd generator
        switch (theme) {
            case 'ROMAN_COLISEUM':
                this._romanCrowd(reaction, now);
                break;
            case 'SPACE_ACE':
                this._spaceCrowd(reaction, now);
                break;
            case 'UNDERSEA':
                this._underseaCrowd(reaction, now);
                break;
            case 'FIBONACCI':
                this._fibonacciCrowd(reaction, now);
                break;
            default:
                this._defaultCrowd(reaction, now);
                break;
        }
        
        console.log(`👥 [GameSFX] Crowd: ${reaction} (${theme})`);
    },
    
    // --- ROMAN COLOSSEUM CROWD ---
    // Horns, foot-stomping, chanting, shields clashing
    _romanCrowd(reaction, now) {
        const vol = this.volume;
        
        switch (reaction) {
            case 'roaring': {
                // Deep crowd roar with brass horns
                this._noiseRoar(now, 1.8, vol * 0.3, 120, 300);
                // Brass horn fanfare - cornu (Roman horn)
                const hornNotes = [196, 261.63, 329.63, 392]; // G3 C4 E4 G4
                hornNotes.forEach((freq, i) => {
                    this._playTone('sawtooth', freq, now + i * 0.15, 0.6, vol * 0.18);
                    this._playTone('square', freq * 1.005, now + i * 0.15, 0.5, vol * 0.08); // Detune for brass width
                });
                // Crowd stomping
                this._rhythmicStomps(now + 0.2, 8, 0.12, vol * 0.2);
                break;
            }
            case 'cheering': {
                // Crowd cheer + shield clashing
                this._noiseRoar(now, 1.5, vol * 0.25, 200, 500);
                // Shield/sword clash metallic hits
                for (let i = 0; i < 5; i++) {
                    this._metalClash(now + 0.1 + i * 0.18, vol * 0.15);
                }
                // Trumpet blast
                this._playTone('sawtooth', 392, now, 0.8, vol * 0.15);
                this._playTone('sawtooth', 523.25, now + 0.08, 0.6, vol * 0.12);
                break;
            }
            case 'excited': {
                // Murmur building to excitement
                this._noiseRoar(now, 1.2, vol * 0.15, 150, 400);
                this._rhythmicStomps(now, 4, 0.2, vol * 0.15);
                // Single horn call
                this._playTone('sawtooth', 261.63, now + 0.3, 0.8, vol * 0.12);
                break;
            }
            case 'gasp': {
                // Sharp inhale noise burst
                this._noiseRoar(now, 0.3, vol * 0.3, 400, 1200);
                // Sudden silence then murmur
                this._noiseRoar(now + 0.5, 1.0, vol * 0.08, 100, 300);
                break;
            }
            case 'boo': {
                // Low rumbling disapproval
                this._noiseRoar(now, 2.0, vol * 0.25, 80, 200);
                // Descending horn — thumbs down
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 1.5);
                gain.gain.setValueAtTime(vol * 0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
                osc.connect(gain); gain.connect(this.masterGain);
                osc.start(now); osc.stop(now + 1.6);
                // Stomping disapproval
                this._rhythmicStomps(now + 0.3, 6, 0.15, vol * 0.2);
                break;
            }
            case 'anticipation': {
                // Quiet tension - low murmur
                this._noiseRoar(now, 2.5, vol * 0.06, 80, 180);
                // Sparse drum roll
                for (let i = 0; i < 12; i++) {
                    const t = now + i * 0.1;
                    this._playTone('triangle', 60 + Math.random() * 20, t, 0.08, vol * 0.1);
                }
                break;
            }
        }
    },
    
    // --- SPACE ACE CROWD ---
    // Synth whooshes, comm chatter, energy pulses, sci-fi audience
    _spaceCrowd(reaction, now) {
        const vol = this.volume;
        
        switch (reaction) {
            case 'roaring': {
                // Massive synth swell
                this._synthSwell(now, 2.0, vol * 0.25, 80, 600);
                // Laser-like celebration bursts
                for (let i = 0; i < 6; i++) {
                    const t = now + i * 0.15 + Math.random() * 0.1;
                    const startF = 1500 + Math.random() * 1000;
                    this._laserSweep(t, startF, startF * 0.3, 0.2, vol * 0.1);
                }
                // Deep bass pulse
                this._playTone('sine', 55, now, 1.5, vol * 0.2);
                break;
            }
            case 'cheering': {
                // Synth arpeggio celebration
                const arp = [329.63, 440, 523.25, 659.25, 880];
                arp.forEach((f, i) => {
                    this._playTone('sine', f, now + i * 0.08, 0.4, vol * 0.12);
                    this._playTone('triangle', f * 2, now + i * 0.08, 0.2, vol * 0.06);
                });
                // Comm chatter burst (filtered noise)
                this._noiseRoar(now + 0.1, 0.8, vol * 0.1, 800, 2000);
                break;
            }
            case 'excited': {
                // Rising energy pulse
                this._synthSwell(now, 1.0, vol * 0.15, 100, 400);
                this._laserSweep(now + 0.3, 200, 800, 0.5, vol * 0.1);
                break;
            }
            case 'gasp': {
                // Sharp descending synth whoosh
                this._laserSweep(now, 2000, 200, 0.25, vol * 0.2);
                // Static burst
                this._noiseRoar(now, 0.15, vol * 0.2, 1000, 4000);
                break;
            }
            case 'boo': {
                // Low ominous synth drone
                this._playTone('sawtooth', 55, now, 2.0, vol * 0.15);
                this._playTone('square', 58, now, 2.0, vol * 0.08); // Dissonant beat
                // Warning alarm
                for (let i = 0; i < 4; i++) {
                    this._playTone('square', i % 2 === 0 ? 440 : 330, now + i * 0.25, 0.2, vol * 0.1);
                }
                break;
            }
            case 'anticipation': {
                // Scanning radar-like pulse
                for (let i = 0; i < 8; i++) {
                    this._playTone('sine', 440, now + i * 0.3, 0.05, vol * 0.08);
                    this._laserSweep(now + i * 0.3 + 0.05, 440, 445, 0.15, vol * 0.04);
                }
                break;
            }
        }
    },
    
    // --- UNDERSEA CROWD ---
    // Whale calls, dolphin clicks, bubble bursts, coral resonance
    _underseaCrowd(reaction, now) {
        const vol = this.volume;
        
        switch (reaction) {
            case 'roaring': {
                // Whale song celebration
                const whaleNotes = [80, 120, 160, 200, 160, 120];
                whaleNotes.forEach((f, i) => {
                    this._playTone('sine', f, now + i * 0.3, 0.8, vol * 0.2);
                    this._playTone('sine', f * 1.5, now + i * 0.3 + 0.1, 0.5, vol * 0.08);
                });
                // Bubble burst
                this._bubbleBurst(now + 0.2, 20, vol * 0.15);
                break;
            }
            case 'cheering': {
                // Dolphin clicks + bubbles
                this._dolphinClicks(now, 8, vol * 0.15);
                this._bubbleBurst(now + 0.3, 12, vol * 0.12);
                // Harmonic wave
                this._playTone('sine', 261.63, now + 0.2, 1.0, vol * 0.1);
                this._playTone('sine', 329.63, now + 0.3, 0.8, vol * 0.08);
                break;
            }
            case 'excited': {
                // Quick dolphin chirps
                this._dolphinClicks(now, 5, vol * 0.12);
                this._bubbleBurst(now + 0.1, 6, vol * 0.1);
                break;
            }
            case 'gasp': {
                // Big bubble pop
                this._playTone('sine', 800, now, 0.15, vol * 0.25);
                // Deep pressure wave
                this._playTone('sine', 40, now + 0.05, 0.5, vol * 0.2);
                break;
            }
            case 'boo': {
                // Deep whale groan
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.linearRampToValueAtTime(50, now + 2.0);
                gain.gain.setValueAtTime(vol * 0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
                osc.connect(gain); gain.connect(this.masterGain);
                osc.start(now); osc.stop(now + 2.1);
                break;
            }
            case 'anticipation': {
                // Sonar pings
                for (let i = 0; i < 5; i++) {
                    this._playTone('sine', 1200, now + i * 0.5, 0.1, vol * 0.08);
                }
                // Ambient current
                this._noiseRoar(now, 2.5, vol * 0.04, 50, 150);
                break;
            }
        }
    },
    
    // --- FIBONACCI CROWD ---
    // Golden ratio harmonic resonance swells
    _fibonacciCrowd(reaction, now) {
        const vol = this.volume;
        const PHI = 1.618033988749;
        const base = 272; // 440/phi
        
        switch (reaction) {
            case 'roaring': {
                // Fibonacci overtone series building up
                const fibs = [1, 1, 2, 3, 5, 8, 13];
                fibs.forEach((n, i) => {
                    const freq = base * n;
                    if (freq < 4000) {
                        this._playTone('sine', freq, now + i * 0.12, 1.5 - i * 0.15, vol * 0.12);
                    }
                });
                // Golden ratio resonant sweep
                this._laserSweep(now, base, base * PHI * PHI, 1.5, vol * 0.1);
                break;
            }
            case 'cheering': {
                // Phi-interval chord cascade
                [base, base * PHI, base * PHI * PHI].forEach((f, i) => {
                    this._playTone('triangle', f, now + i * 0.1, 0.8, vol * 0.12);
                });
                this._playSparkle(now + 0.3, 6);
                break;
            }
            case 'excited': {
                this._playTone('sine', base * PHI, now, 1.0, vol * 0.12);
                this._playTone('triangle', base * PHI * 2, now + 0.15, 0.6, vol * 0.08);
                break;
            }
            case 'gasp': {
                // Sharp golden ratio interval
                this._playTone('sine', base * PHI * PHI * PHI, now, 0.2, vol * 0.2);
                this._playTone('sine', base, now + 0.1, 0.5, vol * 0.1);
                break;
            }
            case 'boo': {
                // Dissonant non-phi intervals
                this._playTone('sawtooth', base * 1.414, now, 1.5, vol * 0.12); // sqrt(2) — anti-phi
                this._playTone('sawtooth', base * 1.732, now, 1.5, vol * 0.08);
                break;
            }
            case 'anticipation': {
                // Fibonacci rhythm: gaps follow sequence
                const fibRhythm = [1, 1, 2, 3, 5, 8];
                let t = 0;
                fibRhythm.forEach(n => {
                    this._playTone('sine', base * PHI, now + t * 0.08, 0.1, vol * 0.06);
                    t += n;
                });
                break;
            }
        }
    },
    
    // --- DEFAULT / COSMIC CROWD ---
    // Stadium-style noise-based crowd
    _defaultCrowd(reaction, now) {
        const vol = this.volume;
        
        switch (reaction) {
            case 'roaring': {
                this._noiseRoar(now, 2.0, vol * 0.25, 100, 400);
                this._playSparkle(now + 0.5, 5);
                // Cymbal-like crash
                this._noiseRoar(now, 0.3, vol * 0.15, 3000, 8000);
                break;
            }
            case 'cheering': {
                this._noiseRoar(now, 1.5, vol * 0.2, 150, 500);
                // Synth chord stab
                [523.25, 659.25, 783.99].forEach(f => {
                    this._playTone('triangle', f, now + 0.1, 0.5, vol * 0.1);
                });
                break;
            }
            case 'excited': {
                this._noiseRoar(now, 1.0, vol * 0.12, 200, 600);
                break;
            }
            case 'gasp': {
                this._noiseRoar(now, 0.25, vol * 0.2, 500, 1500);
                break;
            }
            case 'boo': {
                this._noiseRoar(now, 2.0, vol * 0.18, 80, 180);
                break;
            }
            case 'anticipation': {
                this._noiseRoar(now, 2.0, vol * 0.05, 80, 200);
                break;
            }
        }
    },
    
    // ============================================================
    // CROWD SOUND PRIMITIVES
    // ============================================================
    
    /** Filtered noise roar (crowd ambience) */
    _noiseRoar(startTime, duration, amplitude, lowFreq, highFreq) {
        const ctx = this.audioContext;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        
        // Bandpass filter for crowd frequency range
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = (lowFreq + highFreq) / 2;
        filter.Q.value = (highFreq - lowFreq) > 200 ? 0.5 : 1.5;
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(amplitude, startTime + duration * 0.15);
        gain.gain.setValueAtTime(amplitude, startTime + duration * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        source.start(startTime);
        source.stop(startTime + duration);
    },
    
    /** Simple tone helper */
    _playTone(waveType, freq, startTime, duration, amplitude) {
        const ctx = this.audioContext;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = waveType;
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(amplitude, startTime + 0.02);
        gain.gain.setValueAtTime(amplitude * 0.8, startTime + duration * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
    },
    
    /** Rhythmic stomping/clapping pattern */
    _rhythmicStomps(startTime, count, interval, amplitude) {
        for (let i = 0; i < count; i++) {
            const t = startTime + i * interval;
            this._playImpact(t, amplitude / this.volume);
        }
    },
    
    /** Metallic clash (shields/swords) */
    _metalClash(startTime, amplitude) {
        const ctx = this.audioContext;
        // High-frequency noise burst (metallic transient)
        const bufLen = ctx.sampleRate * 0.08;
        const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufLen; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.15));
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(amplitude, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        source.start(startTime);
        source.stop(startTime + 0.12);
        
        // Resonant ring
        this._playTone('sine', 2400 + Math.random() * 800, startTime, 0.15, amplitude * 0.5);
    },
    
    /** Rising synth swell (sci-fi crowd) */
    _synthSwell(startTime, duration, amplitude, startFreq, endFreq) {
        const ctx = this.audioContext;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(startFreq, startTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration * 0.7);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 1.2, startTime + duration);
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(startFreq * 2, startTime);
        filter.frequency.exponentialRampToValueAtTime(endFreq * 3, startTime + duration * 0.5);
        filter.frequency.exponentialRampToValueAtTime(startFreq, startTime + duration);
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(amplitude, startTime + duration * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
    },
    
    /** Laser/energy sweep */
    _laserSweep(startTime, startFreq, endFreq, duration, amplitude) {
        const ctx = this.audioContext;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, startTime);
        osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), startTime + duration);
        
        gain.gain.setValueAtTime(amplitude, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
    },
    
    /** Underwater bubble burst */
    _bubbleBurst(startTime, count, amplitude) {
        for (let i = 0; i < count; i++) {
            const t = startTime + i * 0.04 + Math.random() * 0.06;
            const freq = 800 + Math.random() * 2000;
            const dur = 0.03 + Math.random() * 0.05;
            this._playTone('sine', freq, t, dur, amplitude * (0.3 + Math.random() * 0.7));
        }
    },
    
    /** Dolphin-like clicks */
    _dolphinClicks(startTime, count, amplitude) {
        for (let i = 0; i < count; i++) {
            const t = startTime + i * 0.08 + Math.random() * 0.04;
            // Quick chirp: rising then falling
            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const baseF = 2000 + Math.random() * 2000;
            osc.frequency.setValueAtTime(baseF, t);
            osc.frequency.exponentialRampToValueAtTime(baseF * 2, t + 0.02);
            osc.frequency.exponentialRampToValueAtTime(baseF * 0.5, t + 0.06);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(amplitude, t + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(t); osc.stop(t + 0.08);
        }
    },
    
    // ============================================================
    // CONVENIENCE METHODS - Play by event name
    // ============================================================
    
    /**
     * Play sound effect by event name
     * @param {string} eventName - step, arrive, fasttrack, bullseye, safezone, boot, victory, etc.
     * @param {object} options - Event-specific options (e.g., stepIndex, totalSteps)
     */
    play(eventName, options = {}) {
        switch (eventName) {
            case 'step':
                this.playStep(options.stepIndex || 0, options.totalSteps || 1);
                break;
            case 'arrive':
                this.playArrive();
                break;
            case 'fasttrack':
                this.playFasttrack();
                break;
            case 'bullseye':
                this.playBullseye();
                break;
            case 'safezone':
                this.playSafezone();
                break;
            case 'boot':
            case 'cut':
                this.playBoot();
                break;
            case 'victory':
            case 'win':
                this.playVictory();
                break;
            case 'draw':
            case 'drawCard':
                this.playDrawCard();
                break;
            case 'extraTurn':
            case 'extra':
                this.playExtraTurn();
                break;
            case 'royal':
            case 'royalExit':
                this.playRoyalExit();
                break;
            case 'entry':
            case 'pegEntry':
                this.playPegEntry();
                break;
            case 'crowd':
            case 'crowdReaction':
                this.playCrowdReaction(options.reaction || 'cheering');
                break;
            default:
                console.warn(`[GameSFX] Unknown event: ${eventName}`);
        }
    }
};

// Initialize on load
GameSFX.init();

// Expose globally
window.GameSFX = GameSFX;

console.log('🔊 [GameSFX] Module loaded');
console.log('   Sound Events: step, arrive, fasttrack, bullseye, safezone, boot, victory, drawCard, extraTurn, pegEntry, royalExit, crowd');
