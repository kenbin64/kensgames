/**
 * 🎹 RAGTIME SUBSTRATE
 * ButterflyFX Dimensional Player Piano
 * 
 * Pure mathematical ragtime generation - no stored music.
 * Uses φ (golden ratio), Fibonacci sequences, and harmonic series
 * to generate endless, non-repeating 1920s stride piano.
 * 
 * The manifold IS the player piano:
 *   z = f(x, y, t) where:
 *   x = harmonic position (chord degree)
 *   y = rhythmic position (beat subdivision)  
 *   t = time (continuous, never loops)
 *   z = frequency to play
 */

const RagtimeSubstrate = {
    name: 'Ragtime Player Piano',
    version: '1.0.0',
    
    // Mathematical constants
    PHI: 1.618033988749895,
    FIBONACCI: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
    
    // Audio context
    ctx: null,
    masterGain: null,
    isPlaying: false,
    
    // Tempo (rubato - slightly varying)
    baseBPM: 108,
    currentBPM: 108,
    
    // Time tracking (never resets - ensures no repetition)
    globalTick: 0,
    lastTickTime: 0,
    
    // Ragtime harmonic language (I-IV-V-vi progressions common in ragtime)
    // Notes in semitones from root
    SCALES: {
        major: [0, 2, 4, 5, 7, 9, 11],
        dominant7: [0, 4, 7, 10],
        diminished: [0, 3, 6, 9],
    },
    
    // Chord progressions weighted by φ for natural flow
    PROGRESSIONS: [
        [0, 0, 3, 3, 4, 4, 0, 0],      // I-I-IV-IV-V-V-I-I (classic)
        [0, 3, 0, 4, 0, 5, 4, 0],      // Circle movement
        [0, 0, 0, 3, 4, 3, 0, 0],      // Emphasis on IV
        [0, 5, 3, 4, 0, 0, 4, 0],      // Secondary dominant feel
    ],
    
    // Root notes (C major = 0, can transpose)
    rootNote: 48, // C3 MIDI
    
    /**
     * Initialize audio context
     */
    init: function() {
        if (this.ctx) return this;
        
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
            console.log('🎹 [RagtimeSubstrate] Player piano initialized');
        } catch (e) {
            console.error('🎹 [RagtimeSubstrate] Audio init failed:', e);
        }
        return this;
    },
    
    /**
     * Start the player piano
     */
    play: function() {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.isPlaying) return this;
        
        this.isPlaying = true;
        this.lastTickTime = this.ctx.currentTime;
        this._scheduleNext();
        console.log('🎹 [RagtimeSubstrate] Playing...');
        return this;
    },
    
    /**
     * Stop the music
     */
    stop: function() {
        this.isPlaying = false;
        console.log('🎹 [RagtimeSubstrate] Stopped');
        return this;
    },
    
    /**
     * The mathematical heart - compute what to play at tick t
     * Uses dimensional coordinates: z = f(x, y, t)
     */
    _computeManifold: function(tick) {
        // Get progression based on φ-weighted selection
        const progIndex = Math.floor((tick * this.PHI) % this.PROGRESSIONS.length);
        const progression = this.PROGRESSIONS[progIndex];
        
        // Current chord in progression (8-bar phrases)
        const barInPhrase = Math.floor(tick / 4) % 8;
        const chordDegree = progression[barInPhrase];
        
        // Compute chord root from scale
        const chordRoot = this.rootNote + this.SCALES.major[chordDegree % 7];
        
        // Beat position within bar (0-3)
        const beat = tick % 4;
        
        // Syncopation from Fibonacci
        const fibIndex = tick % this.FIBONACCI.length;
        const syncopation = (this.FIBONACCI[fibIndex] % 3) * 0.08;
        
        return {
            tick,
            chordRoot,
            chordDegree,
            beat,
            syncopation,
            // φ-derived dynamics
            velocity: 0.5 + 0.3 * Math.sin(tick * this.PHI * 0.1),
            // Rubato - slight tempo variation
            rubato: 1 + 0.03 * Math.sin(tick * 0.07)
        };
    },
    
    /**
     * Schedule the next tick
     */
    _scheduleNext: function() {
        if (!this.isPlaying) return;
        
        const m = this._computeManifold(this.globalTick);
        const tickDuration = (60 / this.baseBPM / 4) * m.rubato;
        const now = this.ctx.currentTime;
        
        // LEFT HAND: Stride bass (boom-chick pattern)
        this._playStrideLeft(m, now + m.syncopation);
        
        // RIGHT HAND: Syncopated melody
        this._playMelodyRight(m, now);
        
        // Advance time
        this.globalTick++;
        this.lastTickTime = now + tickDuration;
        
        // Schedule next tick
        setTimeout(() => this._scheduleNext(), tickDuration * 1000 * 0.9);
    },
    
    /**
     * Left hand stride pattern - bass note then chord
     */
    _playStrideLeft: function(m, time) {
        const beat = m.beat;

        if (beat === 0 || beat === 2) {
            // BOOM - bass note (root, octave below)
            this._playNote(m.chordRoot - 12, time, 0.18, m.velocity * 0.85);
        } else {
            // CHICK - chord voicing (mid-range)
            const chord = this._buildChord(m.chordRoot, 'dominant7');
            chord.forEach((note, i) => {
                this._playNote(note, time + i * 0.006, 0.12, m.velocity * 0.55);
            });
        }
    },

    /**
     * Right hand melody - φ-generated syncopated lines
     * Uses mathematical functions to create endless melodic variation
     */
    _playMelodyRight: function(m, time) {
        // Decide if we play on this tick (syncopated pattern from φ)
        const playProbability = 0.6 + 0.2 * Math.sin(m.tick * this.PHI);
        const shouldPlay = ((m.tick * 7 + m.chordDegree * 13) % 100) / 100 < playProbability;

        if (!shouldPlay) return;

        // Compute melody note using harmonic series and φ
        const scale = this.SCALES.major;

        // φ-spiral through scale degrees
        const spiralPos = (m.tick * this.PHI) % scale.length;
        const scaleIndex = Math.floor(spiralPos);
        const nextIndex = (scaleIndex + 1) % scale.length;

        // Interpolate between scale degrees for passing tones
        const interp = spiralPos - scaleIndex;
        let melodyNote = m.chordRoot + 12 + scale[scaleIndex];

        // Occasional chromatic passing tone
        if (interp > 0.7 && Math.random() < 0.3) {
            melodyNote += 1; // Chromatic approach
        }

        // Add octave jumps based on Fibonacci position
        const fibOctave = this.FIBONACCI[m.tick % this.FIBONACCI.length] % 3;
        melodyNote += (fibOctave - 1) * 12;

        // Keep in playable range
        while (melodyNote > 84) melodyNote -= 12;
        while (melodyNote < 60) melodyNote += 12;

        // Grace notes (characteristic of ragtime)
        if (m.tick % 8 === 0 && Math.random() < 0.4) {
            this._playNote(melodyNote - 1, time - 0.03, 0.05, m.velocity * 0.4);
        }

        // Main melody note
        const duration = 0.1 + 0.15 * ((m.tick * 3) % 5) / 5;
        this._playNote(melodyNote, time + m.syncopation, duration, m.velocity);

        // Occasional double-stop (two notes together)
        if (m.beat === 0 && (m.tick % 16) < 4) {
            const harmony = melodyNote + scale[(scaleIndex + 2) % scale.length] - scale[scaleIndex];
            this._playNote(harmony, time + m.syncopation, duration, m.velocity * 0.7);
        }
    },

    /**
     * Build a chord from root note
     */
    _buildChord: function(root, type) {
        const intervals = this.SCALES[type] || this.SCALES.dominant7;
        return intervals.map(interval => root + interval);
    },

    /**
     * Play a single piano note using synthesis
     */
    _playNote: function(midiNote, time, duration, velocity) {
        if (!this.ctx || !this.isPlaying) return;

        const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

        // Piano-like tone: fundamental + harmonics with decay
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const osc3 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Slight detune for warmth
        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 2.01; // 2nd harmonic slightly sharp
        osc3.frequency.value = freq * 3.99; // 4th harmonic

        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc3.type = 'sine';

        // Mix harmonics (piano timbre)
        const mix1 = this.ctx.createGain();
        const mix2 = this.ctx.createGain();
        const mix3 = this.ctx.createGain();
        mix1.gain.value = velocity * 0.5;
        mix2.gain.value = velocity * 0.25;
        mix3.gain.value = velocity * 0.1;

        osc1.connect(mix1);
        osc2.connect(mix2);
        osc3.connect(mix3);
        mix1.connect(gain);
        mix2.connect(gain);
        mix3.connect(gain);
        gain.connect(this.masterGain);

        // Piano envelope: quick attack, natural decay
        const now = time || this.ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(velocity * 0.6, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(velocity * 0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.3);

        osc1.start(now);
        osc2.start(now);
        osc3.start(now);
        osc1.stop(now + duration + 0.4);
        osc2.stop(now + duration + 0.4);
        osc3.stop(now + duration + 0.4);
    },

    /**
     * Set volume
     */
    setVolume: function(vol) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
        }
        return this;
    },

    /**
     * Change key (transpose)
     */
    setKey: function(rootMidi) {
        this.rootNote = rootMidi;
        console.log('🎹 [RagtimeSubstrate] Key changed to MIDI', rootMidi);
        return this;
    }
};

// Export
window.RagtimeSubstrate = RagtimeSubstrate;

// Register with substrate manifold if available
if (typeof SubstrateManifold !== 'undefined') {
    SubstrateManifold.register(RagtimeSubstrate);
}

console.log('🎹 [RagtimeSubstrate] Mathematical player piano loaded');
console.log('    Usage: RagtimeSubstrate.play() / .stop()');
console.log('    Pure math - never repeats!');

