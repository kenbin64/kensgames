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
 * FASTTRACK AUDIO SUBSTRATE
 * ButterflyFX Manifold Pattern - Stadium Atmosphere System
 * ============================================================
 * 
 * Creates an immersive game atmosphere with:
 * - Two commentators calling plays (play-by-play & color commentary)
 * - Theme-based stadium music (Space, Undersea, Roman, Default)
 * - Reactive crowd sounds
 * - All original, royalty-free audio concepts
 */

'use strict';

const AudioSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Stadium Audio',
    
    // ============================================================
    // AUDIO STATE
    // ============================================================
    currentTheme: 'DEFAULT',
    musicEnabled: true,
    sfxEnabled: true,
    commentaryEnabled: true,
    crowdEnabled: true,
    volume: {
        master: 0.8,
        music: 0.5,
        sfx: 0.7,
        commentary: 0.9,
        crowd: 0.6
    },
    
    // Web Audio API context (lazy initialized)
    audioContext: null,
    
    // ============================================================
    // THEME DEFINITIONS
    // ============================================================
    themes: {
        DEFAULT: {
            id: 'DEFAULT',
            name: 'Classic Arena',
            description: 'Upbeat video game vibes',
            colors: { primary: '#FFD700', secondary: '#1E90FF' },
            musicStyle: {
                tempo: 120,
                key: 'C_MAJOR',
                instruments: ['synth_lead', 'drums_electronic', 'bass_synth', 'chiptune'],
                mood: 'energetic'
            },
            crowdStyle: 'sports_arena',
            announcerStyle: 'esports'
        },
        SPACE_ACE: {
            id: 'SPACE_ACE',
            name: 'Space Ace Arena',
            description: 'Cosmic synth odyssey',
            colors: { primary: '#00FFFF', secondary: '#FF00FF' },
            musicStyle: {
                tempo: 110,
                key: 'D_MINOR',
                instruments: ['theremin', 'synth_pad', 'space_drums', 'laser_bass'],
                mood: 'cosmic'
            },
            crowdStyle: 'alien_cheers',
            announcerStyle: 'space_station'
        },
        UNDERSEA: {
            id: 'UNDERSEA',
            name: 'Ocean Depths',
            description: 'Caribbean calypso waves',
            colors: { primary: '#00CED1', secondary: '#FF6B6B' },
            musicStyle: {
                tempo: 95,
                key: 'G_MAJOR',
                instruments: ['steel_drums', 'marimba', 'congas', 'waves_ambient'],
                mood: 'tropical'
            },
            crowdStyle: 'beach_party',
            announcerStyle: 'cruise_ship'
        },
        ROMAN_COLISEUM: {
            id: 'ROMAN_COLISEUM',
            name: 'The Coliseum',
            description: 'Ancient Roman glory',
            colors: { primary: '#8B4513', secondary: '#FFD700' },
            musicStyle: {
                tempo: 85,
                key: 'A_MINOR',
                instruments: ['brass_fanfare', 'war_drums', 'horns', 'strings_epic'],
                mood: 'triumphant'
            },
            crowdStyle: 'coliseum_roar',
            announcerStyle: 'gladiator'
        },
        FIBONACCI: {
            id: 'FIBONACCI',
            name: 'Golden Spiral Arena',
            description: 'Mathematical harmony from φ and Fibonacci',
            colors: { primary: '#FFD700', secondary: '#DAA520' },
            musicStyle: {
                tempo: 89,  // Fibonacci number!
                key: 'FIBONACCI',
                instruments: ['sine_waves', 'golden_bells', 'spiral_synth', 'phi_bass'],
                mood: 'mathematical'
            },
            crowdStyle: 'mathematical_society',
            announcerStyle: 'professor'
        }
    },
    
    // ============================================================
    // COMMENTATOR SYSTEM - Two announcers!
    // ============================================================
    commentators: {
        // Play-by-play announcer - calls the action
        PLAY_BY_PLAY: {
            name: 'Rex Thundervoice',
            style: 'energetic',
            voice: { pitch: 0.9, rate: 1.1 },
            catchphrases: [
                "And we're LIVE from the arena!",
                "What a move!",
                "Unbelievable!",
                "The crowd goes WILD!",
                "History in the making!"
            ]
        },
        // Color commentator - adds analysis and personality
        COLOR: {
            name: 'Sandy Insights',
            style: 'analytical',
            voice: { pitch: 1.1, rate: 0.95 },
            catchphrases: [
                "You know, Rex...",
                "The strategy here is fascinating.",
                "Classic positioning play.",
                "I've seen this before in the championships.",
                "Bold choice, let's see if it pays off."
            ]
        }
    },
    
    // Theme-specific announcer personalities
    announcerStyles: {
        esports: {
            playByPlay: {
                name: 'Rex Thundervoice',
                intro: "Welcome back to FastTrack Arena!",
                bigPlay: "OH MY GOODNESS! DID YOU SEE THAT?!",
                capture: "ELIMINATED! Sent back to holding!",
                nearMiss: "SO CLOSE! That was inches away!",
                fasttrack: "Taking the FAST TRACK! High risk, high reward!",
                bullseye: "BULLSEYE ENTRY! Going for the center!",
                victory: "AND THAT'S THE GAME! What a finish!"
            },
            color: {
                name: 'Sandy Insights',
                setup: "The positioning here is crucial...",
                analysis: "Looking at the board state, this could be pivotal.",
                prediction: "I think we're about to see something special.",
                capture: "That's what we call a calculated takedown!",
                praise: "Textbook execution right there.",
                tension: "The pressure is mounting..."
            }
        },
        space_station: {
            playByPlay: {
                name: 'Commander Vox',
                intro: "Greetings, spacers! Broadcasting from Station Alpha!",
                bigPlay: "STELLAR MOVE! Across the cosmos!",
                capture: "Target eliminated! Return to home dock!",
                nearMiss: "Shields held! Almost got vaporized there!",
                fasttrack: "Engaging hyperdrive on the inner ring!",
                bullseye: "Direct hit on the singularity!",
                victory: "Mission accomplished! Outstanding pilot!"
            },
            color: {
                name: 'Dr. Nova Sterling',
                setup: "Calculating trajectory vectors...",
                analysis: "The orbital mechanics favor this approach.",
                prediction: "Sensors detect an incoming maneuver.",
                capture: "Precise laser targeting! No escape velocity!",
                praise: "That's academy-level precision.",
                tension: "Gravitational forces intensifying..."
            }
        },
        cruise_ship: {
            playByPlay: {
                name: 'Captain Coral',
                intro: "Ahoy, mateys! Welcome to the Ocean Arena!",
                bigPlay: "RIDE THAT WAVE! Spectacular!",
                capture: "Overboard! Swimming back to the harbor!",
                nearMiss: "Just missed the reef! Close call!",
                fasttrack: "Catching the current! Full speed ahead!",
                bullseye: "Diving to the depths!",
                victory: "Land ho! We have a champion!"
            },
            color: {
                name: 'Marina Wavecrest',
                setup: "The tide is turning here...",
                analysis: "Reading the currents like a dolphin.",
                prediction: "I smell a storm brewing.",
                capture: "That's called a kraken attack!",
                praise: "Smooth sailing, beautiful technique.",
                tension: "The pressure's deeper than the Mariana Trench..."
            }
        },
        gladiator: {
            playByPlay: {
                name: 'Maximus Vox',
                intro: "CITIZENS OF ROME! The games begin!",
                bigPlay: "GLORY TO THE VICTOR! Magnificent!",
                capture: "VANQUISHED! Return to the holding cells!",
                nearMiss: "The gods protect this warrior!",
                fasttrack: "Through the champion's path!",
                bullseye: "TO THE EMPEROR'S THRONE!",
                victory: "AVE IMPERATOR! WE SALUTE THE CHAMPION!"
            },
            color: {
                name: 'Senator Aurelius',
                setup: "A tactical formation worthy of Caesar...",
                analysis: "The legions would approve of this strategy.",
                prediction: "I foresee blood on the sand.",
                capture: "Struck down with the fury of Mars!",
                praise: "The Senate nods in approval.",
                tension: "The crowd demands entertainment..."
            }
        }
    },
    
    // ============================================================
    // CROWD REACTIONS
    // ============================================================
    crowdReactions: {
        // Standard sports arena
        sports_arena: {
            ambient: 'crowd_murmur',
            cheer: ['YEAAAAAH!', 'WOOOOO!', '*thunderous applause*', '*stadium roar*'],
            gasp: ['OHHHHH!', '*collective gasp*', 'WHOOOOA!'],
            boo: ['BOOOO!', '*disappointed groans*', 'AWWWW!'],
            chant: ['DE-FENSE! DE-FENSE!', 'LET\'S GO! *clap clap clap*', 'ONE MORE! ONE MORE!'],
            tension: ['*hushed anticipation*', '*nervous murmuring*', '*edge of seats*'],
            celebration: ['*standing ovation*', '*fireworks*', '*confetti cannons*']
        },
        // Alien space audience
        alien_cheers: {
            ambient: 'space_hum',
            cheer: ['*alien warbling*', 'ZORP ZORP!', '*tentacle applause*', '*multi-species cheering*'],
            gasp: ['*synchronized antenna twitch*', 'BLORP!', '*anti-gravity gasp*'],
            boo: ['*dissonant frequencies*', 'NEEK NEEK!', '*plasma hiss*'],
            chant: ['WARP! WARP! WARP!', '*rhythmic clicking*', '*harmonic resonance*'],
            tension: ['*electromagnetic anticipation*', '*quantum uncertainty*'],
            celebration: ['*supernova burst*', '*hyperspace confetti*', '*trans-dimensional party*']
        },
        // Beach party crowd
        beach_party: {
            ambient: 'ocean_waves_party',
            cheer: ['COWABUNGA!', '*steel drum celebration*', 'ISLAND TIME!', '*tropical whoops*'],
            gasp: ['*waves crash*', 'SPLASH!', 'WHOA NELLY!'],
            boo: ['*sad trombone*', 'MAN OVERBOARD!', '*deflating beach ball*'],
            chant: ['SURF\'S UP! SURF\'S UP!', '*synchronized limbo*', 'COCO-LOCO!'],
            tension: ['*calm before the storm*', '*shark fin music*'],
            celebration: ['*fireworks over water*', '*dolphin celebration*', '*luau party explosion*']
        },
        // Roman coliseum
        coliseum_roar: {
            ambient: 'crowd_ancient',
            cheer: ['ROMA! ROMA!', '*thunderous Roman applause*', 'HAIL!', '*lion roars of approval*'],
            gasp: ['BY JUPITER!', '*shocked citizens*', '*senators clutch togas*'],
            boo: ['*thumbs down*', 'SHAME!', '*rotten fruit thrown*'],
            chant: ['MAXIMUS! MAXIMUS!', '*foot stomping*', 'BLOOD AND HONOR!'],
            tension: ['*drum roll*', '*hushed coliseum*', '*lions pacing*'],
            celebration: ['*emperor stands*', '*rose petals fall*', '*triumph march*']
        }
    },
    
    // ============================================================
    // SOUND EFFECT TRIGGERS
    // ============================================================
    sfxTriggers: {
        // Movement sounds
        pegMove: { category: 'movement', intensity: 'low' },
        pegHop: { category: 'movement', intensity: 'medium' },
        pegSlide: { category: 'movement', intensity: 'low' },
        
        // Capture sounds
        captureImpact: { category: 'capture', intensity: 'high' },
        captureLaunch: { category: 'capture', intensity: 'high' },
        captureFlight: { category: 'capture', intensity: 'medium' },
        captureLanding: { category: 'capture', intensity: 'high' },
        
        // Card sounds
        cardDraw: { category: 'cards', intensity: 'low' },
        cardPlay: { category: 'cards', intensity: 'medium' },
        cardSpecial: { category: 'cards', intensity: 'high' },
        
        // Zone sounds
        enterFasttrack: { category: 'zones', intensity: 'high' },
        enterSafezone: { category: 'zones', intensity: 'medium' },
        enterBullseye: { category: 'zones', intensity: 'high' },
        exitHolding: { category: 'zones', intensity: 'medium' },
        
        // Victory sounds
        pegFinished: { category: 'victory', intensity: 'high' },
        gameWon: { category: 'victory', intensity: 'maximum' }
    },
    
    // ============================================================
    // MUSIC GENERATION PATTERNS (for Web Audio API synthesis)
    // ============================================================
    musicPatterns: {
        DEFAULT: {
            melodyNotes: ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4', 'D4', 'F4', 'A4', 'C5'],
            bassLine: ['C2', 'C2', 'G2', 'G2', 'F2', 'F2', 'G2', 'G2'],
            drumPattern: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0],
            bpm: 120
        },
        SPACE_ACE: {
            melodyNotes: ['D4', 'F4', 'A4', 'D5', 'C5', 'A4', 'F4', 'E4', 'G4', 'B4', 'D5'],
            bassLine: ['D2', 'D2', 'A2', 'A2', 'G2', 'G2', 'A2', 'A2'],
            drumPattern: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0],
            bpm: 110,
            effects: ['reverb_space', 'delay_cosmic']
        },
        UNDERSEA: {
            melodyNotes: ['G4', 'B4', 'D5', 'G5', 'F5', 'D5', 'B4', 'A4', 'C5', 'E5', 'G5'],
            bassLine: ['G2', 'G2', 'D3', 'D3', 'C3', 'C3', 'D3', 'D3'],
            drumPattern: [1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0],
            bpm: 95,
            effects: ['reverb_underwater', 'chorus_waves']
        },
        ROMAN_COLISEUM: {
            melodyNotes: ['A3', 'C4', 'E4', 'A4', 'G4', 'E4', 'C4', 'D4', 'F4', 'A4', 'C5'],
            bassLine: ['A1', 'A1', 'E2', 'E2', 'D2', 'D2', 'E2', 'E2'],
            drumPattern: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
            bpm: 85,
            effects: ['reverb_hall', 'brass_swell']
        }
    },
    
    // ============================================================
    // INITIALIZATION
    // ============================================================
    init() {
        // Lazy init audio context on user interaction
        if (!this.audioContext && typeof AudioContext !== 'undefined') {
            // Will be created on first user interaction
            console.log('🎵 [AudioSubstrate] Ready for initialization (pending user interaction)');
        }
        
        console.log('🎭 [AudioSubstrate] Stadium Audio System loaded');
        console.log(`🎤 Commentators: ${this.commentators.PLAY_BY_PLAY.name} & ${this.commentators.COLOR.name}`);
        console.log(`🎵 Available themes: ${Object.keys(this.themes).join(', ')}`);
    },
    
    // Activate audio (must be called from user interaction)
    activate() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('🔊 [AudioSubstrate] Audio context activated!');
                return true;
            } catch (e) {
                console.warn('⚠️ [AudioSubstrate] Could not create audio context:', e);
                return false;
            }
        }
        return true;
    },
    
    // ============================================================
    // THEME MANAGEMENT
    // ============================================================
    setTheme(themeId) {
        if (!this.themes[themeId]) {
            console.warn(`Unknown theme: ${themeId}`);
            return false;
        }
        
        this.currentTheme = themeId;
        const theme = this.themes[themeId];
        
        console.log(`🎨 [AudioSubstrate] Theme changed to: ${theme.name}`);
        console.log(`   Music: ${theme.musicStyle.mood} ${theme.musicStyle.instruments.join(', ')}`);
        console.log(`   Crowd: ${theme.crowdStyle}`);
        console.log(`   Announcers: ${theme.announcerStyle} style`);
        
        // Trigger theme change music transition
        this._triggerEvent('themeChange', { theme: themeId });
        
        return true;
    },
    
    getTheme() {
        return this.themes[this.currentTheme];
    },
    
    // ============================================================
    // COMMENTARY SYSTEM
    // ============================================================
    
    /**
     * Generate commentary for a game event
     * Returns dialogue for both commentators
     */
    generateCommentary(eventType, eventData = {}) {
        const theme = this.themes[this.currentTheme];
        const style = this.announcerStyles[theme.announcerStyle];
        
        let playByPlay = '';
        let color = '';
        
        switch (eventType) {
            case 'GAME_START':
                playByPlay = style.playByPlay.intro;
                color = style.color.setup;
                break;
                
            case 'CAPTURE':
                playByPlay = style.playByPlay.capture;
                color = style.color.capture;
                if (eventData.hunterName && eventData.victimName) {
                    playByPlay = `${eventData.hunterName.toUpperCase()} takes out ${eventData.victimName}! ${style.playByPlay.capture}`;
                }
                break;
                
            case 'BIG_PLAY':
                playByPlay = style.playByPlay.bigPlay;
                color = style.color.praise;
                break;
                
            case 'NEAR_MISS':
                playByPlay = style.playByPlay.nearMiss;
                color = style.color.tension;
                break;
                
            case 'FASTTRACK_ENTRY':
                playByPlay = style.playByPlay.fasttrack;
                color = style.color.analysis;
                break;
                
            case 'BULLSEYE_ENTRY':
                playByPlay = style.playByPlay.bullseye;
                color = style.color.prediction;
                break;
                
            case 'VICTORY':
                playByPlay = style.playByPlay.victory;
                color = style.color.praise + " What a performance!";
                if (eventData.winnerName) {
                    playByPlay = `${eventData.winnerName} ${style.playByPlay.victory}`;
                }
                break;
                
            case 'TENSION':
                playByPlay = "The situation is intense...";
                color = style.color.tension;
                break;
                
            default:
                playByPlay = style.playByPlay.bigPlay;
                color = style.color.analysis;
        }
        
        return {
            playByPlay: {
                speaker: style.playByPlay.name,
                text: playByPlay
            },
            color: {
                speaker: style.color.name,
                text: color
            }
        };
    },
    
    /**
     * Speak commentary using Web Speech API (if available)
     */
    speakCommentary(eventType, eventData = {}) {
        if (!this.commentaryEnabled) return;
        
        const commentary = this.generateCommentary(eventType, eventData);
        
        // Log to console with style
        console.log(`\n🎤 ${commentary.playByPlay.speaker}: "${commentary.playByPlay.text}"`);
        console.log(`🎙️ ${commentary.color.speaker}: "${commentary.color.text}"\n`);
        
        // Use Web Speech API if available
        if ('speechSynthesis' in window && this.commentaryEnabled) {
            // Cancel any ongoing speech
            window.speechSynthesis.cancel();
            
            // Play-by-play first
            const pbpUtterance = new SpeechSynthesisUtterance(commentary.playByPlay.text);
            pbpUtterance.pitch = this.commentators.PLAY_BY_PLAY.voice.pitch;
            pbpUtterance.rate = this.commentators.PLAY_BY_PLAY.voice.rate;
            pbpUtterance.volume = this.volume.commentary * this.volume.master;
            
            // Color commentary after
            pbpUtterance.onend = () => {
                setTimeout(() => {
                    const colorUtterance = new SpeechSynthesisUtterance(commentary.color.text);
                    colorUtterance.pitch = this.commentators.COLOR.voice.pitch;
                    colorUtterance.rate = this.commentators.COLOR.voice.rate;
                    colorUtterance.volume = this.volume.commentary * this.volume.master;
                    window.speechSynthesis.speak(colorUtterance);
                }, 300);
            };
            
            window.speechSynthesis.speak(pbpUtterance);
        }
        
        return commentary;
    },
    
    // ============================================================
    // CROWD REACTIONS
    // ============================================================
    
    /**
     * Trigger a crowd reaction
     */
    triggerCrowdReaction(reactionType) {
        if (!this.crowdEnabled) return;
        
        const theme = this.themes[this.currentTheme];
        const crowdStyle = this.crowdReactions[theme.crowdStyle];
        
        if (!crowdStyle || !crowdStyle[reactionType]) {
            console.warn(`Unknown crowd reaction: ${reactionType}`);
            return null;
        }
        
        const reactions = crowdStyle[reactionType];
        const reaction = Array.isArray(reactions) 
            ? reactions[Math.floor(Math.random() * reactions.length)]
            : reactions;
        
        console.log(`👥 [CROWD]: ${reaction}`);
        
        // Trigger audio event
        this._triggerEvent('crowdReaction', { type: reactionType, sound: reaction });
        
        return reaction;
    },
    
    // ============================================================
    // SOUND EFFECTS
    // ============================================================
    
    /**
     * Play a sound effect
     */
    playSFX(sfxName, options = {}) {
        if (!this.sfxEnabled) return;
        
        const sfxConfig = this.sfxTriggers[sfxName];
        if (!sfxConfig) {
            console.warn(`Unknown SFX: ${sfxName}`);
            return;
        }
        
        const theme = this.themes[this.currentTheme];
        
        console.log(`🔊 [SFX] ${sfxName} (${sfxConfig.intensity})`);
        
        // In a full implementation, this would play actual audio
        this._triggerEvent('sfx', { 
            name: sfxName, 
            config: sfxConfig,
            theme: theme.id,
            ...options 
        });
    },
    
    // ============================================================
    // MUSIC CONTROL
    // ============================================================
    
    /**
     * Start background music for current theme
     */
    startMusic() {
        if (!this.musicEnabled) return;
        
        const theme = this.themes[this.currentTheme];
        const pattern = this.musicPatterns[this.currentTheme];
        
        console.log(`🎵 [Music] Starting: ${theme.name} (${pattern.bpm} BPM)`);
        
        this._triggerEvent('musicStart', {
            theme: theme.id,
            pattern: pattern,
            style: theme.musicStyle
        });
    },
    
    stopMusic() {
        console.log('🔇 [Music] Stopped');
        this._triggerEvent('musicStop', {});
    },
    
    // ============================================================
    // EVENT ORCHESTRATION
    // ============================================================
    
    /**
     * Orchestrate full audio response to a game event
     * Combines commentary, crowd, sfx, and music
     */
    orchestrateEvent(eventType, eventData = {}) {
        const responses = {
            commentary: null,
            crowd: null,
            sfx: null
        };
        
        switch (eventType) {
            case 'CAPTURE':
                responses.sfx = 'captureImpact';
                responses.commentary = 'CAPTURE';
                responses.crowd = 'cheer';
                break;
                
            case 'NEAR_MISS':
                responses.commentary = 'NEAR_MISS';
                responses.crowd = 'gasp';
                break;
                
            case 'ENTER_FASTTRACK':
                responses.sfx = 'enterFasttrack';
                responses.commentary = 'FASTTRACK_ENTRY';
                responses.crowd = 'cheer';
                break;
                
            case 'ENTER_BULLSEYE':
                responses.sfx = 'enterBullseye';
                responses.commentary = 'BULLSEYE_ENTRY';
                responses.crowd = 'gasp';
                break;
                
            case 'ENTER_SAFE':
                responses.sfx = 'enterSafezone';
                responses.crowd = 'cheer';
                break;
                
            case 'PEG_FINISHED':
                responses.sfx = 'pegFinished';
                responses.commentary = 'BIG_PLAY';
                responses.crowd = 'celebration';
                break;
                
            case 'GAME_WON':
                responses.sfx = 'gameWon';
                responses.commentary = 'VICTORY';
                responses.crowd = 'celebration';
                break;
                
            case 'GAME_START':
                responses.commentary = 'GAME_START';
                responses.crowd = 'cheer';
                this.startMusic();
                break;
                
            case 'TENSION':
                responses.commentary = 'TENSION';
                responses.crowd = 'tension';
                break;
        }
        
        // Execute orchestrated response
        if (responses.sfx) this.playSFX(responses.sfx);
        if (responses.crowd) this.triggerCrowdReaction(responses.crowd);
        if (responses.commentary) this.speakCommentary(responses.commentary, eventData);
        
        return responses;
    },
    
    // ============================================================
    // INTERNAL EVENT SYSTEM
    // ============================================================
    
    listeners: new Set(),
    
    onAudioEvent(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },
    
    _triggerEvent(type, data) {
        const event = { type, data, theme: this.currentTheme, timestamp: Date.now() };
        this.listeners.forEach(cb => {
            try { cb(event); } catch (e) { console.error('Audio listener error:', e); }
        });
    },
    
    // ============================================================
    // VOLUME CONTROL
    // ============================================================
    
    setVolume(category, value) {
        if (this.volume.hasOwnProperty(category)) {
            this.volume[category] = Math.max(0, Math.min(1, value));
            console.log(`🔊 [Volume] ${category}: ${Math.round(this.volume[category] * 100)}%`);
        }
    },
    
    toggleMusic() { this.musicEnabled = !this.musicEnabled; return this.musicEnabled; },
    toggleSFX() { this.sfxEnabled = !this.sfxEnabled; return this.sfxEnabled; },
    toggleCommentary() { this.commentaryEnabled = !this.commentaryEnabled; return this.commentaryEnabled; },
    toggleCrowd() { this.crowdEnabled = !this.crowdEnabled; return this.crowdEnabled; }
};

// Initialize on load
AudioSubstrate.init();

// Make globally available
if (typeof window !== 'undefined') {
    window.AudioSubstrate = AudioSubstrate;
}

console.log('🏟️ [AudioSubstrate] Stadium Atmosphere System ready!');
console.log('   Themes: Classic Arena, Space Ace, Ocean Depths, Roman Coliseum');
