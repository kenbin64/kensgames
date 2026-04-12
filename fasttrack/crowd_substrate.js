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
 * FASTTRACK CROWD SUBSTRATE
 * Reactive Stadium Sound Effects
 * ============================================================
 * 
 * Generates crowd reactions that match game events and themes.
 * All sounds procedurally generated - 100% original!
 */

'use strict';

const CrowdSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Crowd Engine',
    
    // Audio context
    audioContext: null,
    masterGain: null,
    
    // State
    ambientPlaying: false,
    currentTheme: 'DEFAULT',
    volume: 0.3,
    excitement: 0.5, // 0-1, affects crowd intensity
    
    // Running sounds
    ambientNodes: [],
    
    // ============================================================
    // THEME CONFIGURATIONS
    // ============================================================
    themes: {
        DEFAULT: {
            name: 'Sports Arena',
            ambientFreqs: [150, 300, 450, 600],
            cheerPitch: 1.0,
            chantStyle: 'sports',
            textReactions: {
                cheer: ['YEAAAAAH!', 'WOOOOO!', 'LET\'S GOOOO!', '*thunderous applause*'],
                gasp: ['OHHHHH!', '*collective gasp*', 'WHAT?!', 'NO WAY!'],
                boo: ['BOOOO!', '*disappointed groans*', 'AWWWW!', 'COME ON!'],
                chant: ['LET\'S GO! *clap clap*', 'DE-FENSE!', 'ONE MORE! ONE MORE!'],
                tension: ['*hushed anticipation*', '*nervous murmuring*'],
                celebration: ['*standing ovation*', '*air horns*', '*confetti!*']
            }
        },
        SPACE_ACE: {
            name: 'Alien Audience',
            ambientFreqs: [80, 160, 320, 640],
            cheerPitch: 0.8,
            chantStyle: 'cosmic',
            textReactions: {
                cheer: ['*alien warbling*', 'ZORP ZORP!', '*multi-species cheering*', '*antenna applause*'],
                gasp: ['*synchronized photoreceptor flash*', 'BLORP!', '*anti-gravity gasp*'],
                boo: ['*dissonant frequencies*', 'NEEK NEEK!', '*plasma hiss*'],
                chant: ['WARP! WARP! WARP!', '*rhythmic clicking*', '*harmonic resonance*'],
                tension: ['*electromagnetic anticipation*', '*quantum uncertainty*'],
                celebration: ['*supernova burst*', '*hyperspace confetti*', '*trans-dimensional party*']
            }
        },
        UNDERSEA: {
            name: 'Beach Party',
            ambientFreqs: [120, 240, 360, 480],
            cheerPitch: 1.1,
            chantStyle: 'tropical',
            textReactions: {
                cheer: ['COWABUNGA!', '*steel drum celebration*', 'ISLAND TIME!', '*tropical whoops*'],
                gasp: ['*waves crash*', 'SPLASH!', 'WHOA THERE!'],
                boo: ['*sad trombone*', 'MAN OVERBOARD!', '*deflating beach ball*'],
                chant: ['SURF\'S UP! SURF\'S UP!', '*conga line!*', 'COCO-LOCO!'],
                tension: ['*calm before the storm*', '*shark fin spotted*'],
                celebration: ['*fireworks over water*', '*dolphin clicks*', '*luau explosion*']
            }
        },
        ROMAN_COLISEUM: {
            name: 'Coliseum Roar',
            ambientFreqs: [100, 200, 300, 400],
            cheerPitch: 0.9,
            chantStyle: 'roman',
            textReactions: {
                cheer: ['ROMA! ROMA!', '*thunderous Roman applause*', 'AVE!', '*lion roars*'],
                gasp: ['BY JUPITER!', '*senators gasp*', '*citizens murmur*'],
                boo: ['SHAME!', '*thumbs down*', '*rotten fruit thrown*'],
                chant: ['MAXIMUS! MAXIMUS!', '*foot stomping*', 'BLOOD AND GLORY!'],
                tension: ['*war drums*', '*hushed coliseum*'],
                celebration: ['*emperor stands*', '*rose petals*', '*triumph march*']
            }
        },
        // Fibonacci theme: Mathematical wonder crowd - frequencies based on golden ratio
        FIBONACCI: {
            name: 'Mathematical Society',
            ambientFreqs: [89, 144, 233, 377],  // Fibonacci numbers as Hz
            cheerPitch: 1.0,
            chantStyle: 'mathematical',
            textReactions: {
                cheer: ['PHI-NOMENAL!', '*golden applause*', 'FIBONACCI!', '*spiral celebration*'],
                gasp: ['EUREKA!', '*calculators drop*', 'THAT\'S IRRATIONAL!'],
                boo: ['ASYMPTOTIC!', '*negative feedback*', '*error 404*'],
                chant: ['ONE ONE TWO THREE! FIVE EIGHT!', '*fractal chanting*', 'GOLDEN RATIO!'],
                tension: ['*approaching the limit*', '*convergence imminent*'],
                celebration: ['*perfect spiral*', '*nautilus shells rain*', '*sunflower seeds everywhere*']
            }
        }
    },
    
    // ============================================================
    // INITIALIZATION
    // ============================================================
    
    init() {
        console.log('👥 [CrowdSubstrate] Initialized - awaiting activation');
    },
    
    activate() {
        if (this.audioContext) return true;
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.audioContext.destination);
            
            console.log('👥 [CrowdSubstrate] Audio activated!');
            return true;
        } catch (e) {
            console.error('Could not create audio context:', e);
            return false;
        }
    },
    
    // ============================================================
    // AMBIENT CROWD NOISE
    // ============================================================
    
    startAmbient() {
        if (!this.activate()) return;
        if (this.ambientPlaying) return;
        
        this.ambientPlaying = true;
        const theme = this.themes[this.currentTheme];
        
        // Create multiple noise layers for crowd murmur
        theme.ambientFreqs.forEach((freq, i) => {
            this._createAmbientLayer(freq, 0.02 + (i * 0.005));
        });
        
        console.log(`👥 [CrowdSubstrate] Ambient crowd: ${theme.name}`);
    },
    
    _createAmbientLayer(baseFreq, volume) {
        // Create filtered noise for crowd murmur
        const bufferSize = this.audioContext.sampleRate * 2;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }
        
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = baseFreq;
        filter.Q.value = 2;
        
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume * this.excitement;
        
        // LFO for variation
        const lfo = this.audioContext.createOscillator();
        const lfoGain = this.audioContext.createGain();
        lfo.frequency.value = 0.1 + Math.random() * 0.2;
        lfoGain.gain.value = volume * 0.3;
        
        lfo.connect(lfoGain);
        lfoGain.connect(gainNode.gain);
        
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        noise.start();
        lfo.start();
        
        this.ambientNodes.push({ noise, lfo, gainNode });
    },
    
    stopAmbient() {
        this.ambientPlaying = false;
        this.ambientNodes.forEach(node => {
            try { node.noise.stop(); } catch (e) {}
            try { node.lfo.stop(); } catch (e) {}
        });
        this.ambientNodes = [];
        console.log('👥 [CrowdSubstrate] Ambient stopped');
    },
    
    // ============================================================
    // REACTIVE CROWD SOUNDS
    // ============================================================
    
    /**
     * Trigger a crowd reaction
     */
    react(reactionType) {
        if (!this.activate()) return;
        
        const theme = this.themes[this.currentTheme];
        
        // Play audio reaction
        switch (reactionType) {
            case 'cheer':
                this._playCheer();
                break;
            case 'gasp':
                this._playGasp();
                break;
            case 'boo':
                this._playBoo();
                break;
            case 'chant':
                this._playChant();
                break;
            case 'tension':
                this._playTension();
                break;
            case 'celebration':
                this._playCelebration();
                break;
        }
        
        // Log text reaction
        const textOptions = theme.textReactions[reactionType];
        if (textOptions) {
            const text = textOptions[Math.floor(Math.random() * textOptions.length)];
            console.log(`👥 [CROWD]: ${text}`);
            return text;
        }
    },
    
    /**
     * Cheer sound effect
     */
    _playCheer() {
        const theme = this.themes[this.currentTheme];
        const duration = 1.5;
        
        // Multiple rising noise bursts
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                this._playNoiseBurst(
                    400 + (i * 100) * theme.cheerPitch,
                    800 + (i * 100) * theme.cheerPitch,
                    0.3,
                    0.08 + (this.excitement * 0.05)
                );
            }, i * 100);
        }
    },
    
    /**
     * Gasp sound effect
     */
    _playGasp() {
        // Quick intake sound - filtered noise sweep
        const duration = 0.4;
        
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            data[i] = (Math.random() * 2 - 1) * (1 - t) * Math.sin(t * Math.PI);
        }
        
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(200, this.audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + duration);
        filter.Q.value = 5;
        
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0.12 + (this.excitement * 0.08);
        
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        noise.start();
    },
    
    /**
     * Boo sound effect
     */
    _playBoo() {
        // Low droning boo
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.value = 150;
        
        // Add detune variation
        osc.detune.setValueAtTime(0, this.audioContext.currentTime);
        osc.detune.linearRampToValueAtTime(-50, this.audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.08, this.audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.08, this.audioContext.currentTime + 0.5);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 1);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        
        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.audioContext.currentTime + 1);
    },
    
    /**
     * Chant rhythm
     */
    _playChant() {
        const theme = this.themes[this.currentTheme];
        const beats = theme.chantStyle === 'roman' ? [0, 0.5, 0.75] : [0, 0.25, 0.5, 0.75];
        
        beats.forEach((beat, i) => {
            setTimeout(() => {
                this._playStomping(beat % 2 === 0 ? 0.1 : 0.06);
            }, beat * 1000);
        });
    },
    
    _playStomping(volume) {
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, this.audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.15);
        
        osc.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.15);
    },
    
    /**
     * Tension - hushed murmur
     */
    _playTension() {
        // Lower the ambient volume temporarily
        this.ambientNodes.forEach(node => {
            const now = this.audioContext.currentTime;
            node.gainNode.gain.setValueAtTime(node.gainNode.gain.value, now);
            node.gainNode.gain.linearRampToValueAtTime(node.gainNode.gain.value * 0.3, now + 0.5);
            node.gainNode.gain.linearRampToValueAtTime(node.gainNode.gain.value, now + 3);
        });
    },
    
    /**
     * Celebration - big cheers + effects
     */
    _playCelebration() {
        // Big cheer
        this._playCheer();
        
        // Add some "air horn" - synthesized
        setTimeout(() => {
            const osc = this.audioContext.createOscillator();
            const osc2 = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            osc.type = 'sawtooth';
            osc.frequency.value = 440;
            osc2.type = 'sawtooth';
            osc2.frequency.value = 444;
            
            gainNode.gain.setValueAtTime(0.05, this.audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.05, this.audioContext.currentTime + 0.5);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.6);
            
            osc.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(this.masterGain);
            
            osc.start();
            osc2.start();
            osc.stop(this.audioContext.currentTime + 0.6);
            osc2.stop(this.audioContext.currentTime + 0.6);
        }, 200);
        
        // More cheers!
        setTimeout(() => this._playCheer(), 400);
    },
    
    // ============================================================
    // HELPER METHODS
    // ============================================================
    
    _playNoiseBurst(freqLow, freqHigh, duration, volume) {
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }
        
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freqLow, this.audioContext.currentTime);
        filter.frequency.linearRampToValueAtTime(freqHigh, this.audioContext.currentTime + duration);
        filter.Q.value = 1;
        
        const gainNode = this.audioContext.createGain();
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.05);
        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime + duration * 0.7);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);
        
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        noise.start();
    },
    
    // ============================================================
    // CONTROLS
    // ============================================================
    
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.masterGain) {
            this.masterGain.gain.value = this.volume;
        }
    },
    
    setExcitement(value) {
        this.excitement = Math.max(0, Math.min(1, value));
        // Update ambient intensity
        this.ambientNodes.forEach(node => {
            node.gainNode.gain.value = 0.02 * this.excitement;
        });
    },
    
    setTheme(themeName) {
        if (this.themes[themeName]) {
            const wasPlaying = this.ambientPlaying;
            if (wasPlaying) this.stopAmbient();
            this.currentTheme = themeName;
            if (wasPlaying) this.startAmbient();
            console.log(`👥 [CrowdSubstrate] Theme: ${this.themes[themeName].name}`);
        }
    }
};

// Initialize
CrowdSubstrate.init();

// Export
if (typeof window !== 'undefined') {
    window.CrowdSubstrate = CrowdSubstrate;
}

console.log('👥 [CrowdSubstrate] Crowd Sound Engine ready!');
console.log('   Sports Arena, Alien Audience, Beach Party, Coliseum Roar');
