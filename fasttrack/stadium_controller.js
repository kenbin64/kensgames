/**
 * ============================================================
 * FASTTRACK STADIUM CONTROLLER
 * Master Integration for Complete Stadium Experience
 * ============================================================
 * 
 * Integrates:
 * - Two-announcer commentary system
 * - Theme-based procedural music
 * - Reactive crowd sounds
 * - Game event orchestration
 * 
 * Themes: Classic Arena, Space Ace, Undersea, Roman Coliseum
 */

'use strict';

const StadiumController = {
    version: '1.0.0',
    name: 'FastTrack Stadium Master Controller',
    
    // ============================================================
    // STATE
    // ============================================================
    initialized: false,
    userActivated: false,
    currentTheme: 'DEFAULT',
    
    systems: {
        music: null,
        crowd: null,
        commentary: null,
        audio: null
    },
    
    // Master settings
    settings: {
        musicEnabled: true,
        crowdEnabled: true,
        commentaryEnabled: true,
        sfxEnabled: true,
        speechEnabled: true,
        volume: {
            master: 0.7,
            music: 0.4,
            crowd: 0.3,
            commentary: 0.9,
            sfx: 0.7
        }
    },
    
    // ============================================================
    // THEME PRESETS
    // ============================================================
    themePresets: {
        DEFAULT: {
            id: 'DEFAULT',
            displayName: 'Classic Arena',
            description: 'Upbeat video game vibes with esports commentary',
            emoji: '🏟️',
            musicStyle: 'Synth-driven arcade sounds',
            commentaryStyle: 'Rex Thundervoice & Sandy Insights'
        },
        SPACE_ACE: {
            id: 'SPACE_ACE',
            displayName: 'Space Ace',
            description: 'Cosmic synth odyssey through the stars',
            emoji: '🚀',
            musicStyle: 'Ethereal space synthesizers',
            commentaryStyle: 'Commander Vox & Dr. Nova Sterling'
        },
        UNDERSEA: {
            id: 'UNDERSEA',
            displayName: 'Under the Sea',
            description: 'Caribbean calypso vibes',
            emoji: '🌊',
            musicStyle: 'Steel drums and tropical rhythms',
            commentaryStyle: 'Captain Coral & Marina Wavecrest'
        },
        ROMAN_COLISEUM: {
            id: 'ROMAN_COLISEUM',
            displayName: 'Roman Coliseum',
            description: 'Ancient Roman fanfare and glory',
            emoji: '⚔️',
            musicStyle: 'Epic brass and war drums',
            commentaryStyle: 'Maximus Vox & Senator Aurelius'
        },
        FIBONACCI: {
            id: 'FIBONACCI',
            displayName: 'Golden Spiral',
            description: 'Mathematical harmony from the Fibonacci sequence',
            emoji: '🐚',
            musicStyle: 'Chords built from φ (1.618) and Fibonacci intervals',
            commentaryStyle: 'Professor Phi & Dr. Fibonacci'
        }
    },
    
    // ============================================================
    // INITIALIZATION
    // ============================================================
    
    /**
     * Initialize the stadium controller
     * Links to all audio substrates
     */
    init() {
        console.log('🏟️ [StadiumController] Initializing...');
        
        // Link to audio systems
        if (typeof MusicSubstrate !== 'undefined') {
            this.systems.music = MusicSubstrate;
            console.log('   ✓ Music system linked');
        }
        
        if (typeof CrowdSubstrate !== 'undefined') {
            this.systems.crowd = CrowdSubstrate;
            console.log('   ✓ Crowd system linked');
        }
        
        if (typeof CommentarySubstrate !== 'undefined') {
            this.systems.commentary = CommentarySubstrate;
            console.log('   ✓ Commentary system linked');
        }
        
        if (typeof AudioSubstrate !== 'undefined') {
            this.systems.audio = AudioSubstrate;
            console.log('   ✓ Audio system linked');
        }
        
        this.initialized = true;
        console.log('🏟️ [StadiumController] Ready! Awaiting user activation.');
        console.log('   Call StadiumController.activate() on user interaction.');
        
        return this;
    },
    
    /**
     * Activate all audio systems (call from user interaction)
     */
    activate() {
        if (this.userActivated) return true;
        
        console.log('🔊 [StadiumController] Activating audio systems...');
        
        let success = true;
        
        if (this.systems.music) {
            success = this.systems.music.activate() && success;
        }
        if (this.systems.crowd) {
            success = this.systems.crowd.activate() && success;
        }
        if (this.systems.audio) {
            success = this.systems.audio.activate() && success;
        }
        
        this.userActivated = success;
        
        if (success) {
            console.log('🔊 [StadiumController] All systems activated!');
        }
        
        return success;
    },
    
    // ============================================================
    // THEME CONTROL
    // ============================================================
    
    /**
     * Set the stadium theme
     */
    setTheme(themeId) {
        const preset = this.themePresets[themeId];
        if (!preset) {
            console.warn(`Unknown theme: ${themeId}`);
            console.log(`Available: ${Object.keys(this.themePresets).join(', ')}`);
            return false;
        }
        
        this.currentTheme = themeId;
        
        console.log(`\n🎨 ═══════════════════════════════════════════`);
        console.log(`${preset.emoji} Theme: ${preset.displayName}`);
        console.log(`   "${preset.description}"`);
        console.log(`   Music: ${preset.musicStyle}`);
        console.log(`   Commentary: ${preset.commentaryStyle}`);
        console.log(`═══════════════════════════════════════════════\n`);
        
        // Update all systems
        if (this.systems.music) this.systems.music.setTheme(themeId);
        if (this.systems.crowd) this.systems.crowd.setTheme(themeId);
        if (this.systems.commentary) this.systems.commentary.setTheme(themeId);
        if (this.systems.audio) this.systems.audio.setTheme(themeId);
        
        this._emit('themeChange', { theme: preset });
        
        return true;
    },
    
    /**
     * Get current theme info
     */
    getTheme() {
        return this.themePresets[this.currentTheme];
    },
    
    /**
     * List available themes
     */
    listThemes() {
        console.log('\n🎨 Available Stadium Themes:');
        Object.values(this.themePresets).forEach(theme => {
            console.log(`   ${theme.emoji} ${theme.id}: ${theme.displayName}`);
        });
        return Object.keys(this.themePresets);
    },
    
    // ============================================================
    // GAME EVENT ORCHESTRATION
    // ============================================================
    
    /**
     * Start the game - full intro sequence
     */
    gameStart(playerNames = []) {
        if (!this.activate()) return;
        
        console.log('\n🏟️ ═══════════════════════════════════════════');
        console.log('   THE GAME BEGINS!');
        console.log('═══════════════════════════════════════════════\n');
        
        // Start music
        if (this.settings.musicEnabled && this.systems.music) {
            this.systems.music.play();
        }
        
        // Start ambient crowd
        if (this.settings.crowdEnabled && this.systems.crowd) {
            this.systems.crowd.startAmbient();
        }
        
        // Opening commentary
        if (this.settings.commentaryEnabled && this.systems.commentary) {
            this.systems.commentary.gameStart();
        }
        
        // Initial crowd cheer
        setTimeout(() => {
            if (this.systems.crowd) this.systems.crowd.react('cheer');
        }, 2000);
        
        this._emit('gameStart', { players: playerNames });
    },
    
    /**
     * Handle a capture event
     */
    capture(hunterName, victimName, isEpic = false) {
        // Sound effect
        if (this.settings.sfxEnabled && this.systems.music) {
            this.systems.music.playCaptureImpact();
        }
        
        // Commentary
        if (this.settings.commentaryEnabled && this.systems.commentary) {
            if (isEpic) {
                this.systems.commentary.epicCapture(hunterName, victimName);
            } else {
                this.systems.commentary.capture(hunterName, victimName);
            }
        }
        
        // Crowd reaction
        if (this.settings.crowdEnabled && this.systems.crowd) {
            setTimeout(() => {
                this.systems.crowd.react('cheer');
                this.systems.crowd.setExcitement(Math.min(1, this.systems.crowd.excitement + 0.1));
            }, 500);
        }
        
        this._emit('capture', { hunter: hunterName, victim: victimName, epic: isEpic });
    },
    
    /**
     * Near miss event
     */
    nearMiss(playerName) {
        // Crowd gasp
        if (this.systems.crowd) {
            this.systems.crowd.react('gasp');
        }
        
        // Commentary
        if (this.systems.commentary) {
            this.systems.commentary.nearMiss(playerName);
        }
        
        this._emit('nearMiss', { player: playerName });
    },
    
    /**
     * Fast track entry
     */
    fastTrackEntry(playerName) {
        // Commentary
        if (this.systems.commentary) {
            this.systems.commentary.fastTrack(playerName);
        }
        
        // Crowd reaction
        if (this.systems.crowd) {
            this.systems.crowd.react('cheer');
        }
        
        this._emit('fastTrackEntry', { player: playerName });
    },
    
    /**
     * Bullseye/center entry
     */
    bullseyeEntry(playerName) {
        // Commentary
        if (this.systems.commentary) {
            this.systems.commentary.bullseye(playerName);
        }
        
        // Big crowd reaction
        if (this.systems.crowd) {
            this.systems.crowd.react('gasp');
            setTimeout(() => this.systems.crowd.react('cheer'), 800);
        }
        
        this._emit('bullseyeEntry', { player: playerName });
    },
    
    /**
     * Safe zone entry
     */
    safeZoneEntry(playerName) {
        if (this.systems.commentary) {
            this.systems.commentary.safeZone(playerName);
        }
        
        if (this.systems.crowd) {
            this.systems.crowd.react('cheer');
        }
        
        this._emit('safeZoneEntry', { player: playerName });
    },
    
    /**
     * Peg finished (reached center)
     */
    pegFinished(playerName) {
        if (this.systems.commentary) {
            this.systems.commentary.pegFinish(playerName);
        }
        
        if (this.systems.crowd) {
            this.systems.crowd.react('celebration');
        }
        
        this._emit('pegFinished', { player: playerName });
    },
    
    /**
     * Game victory!
     */
    victory(winnerName) {
        console.log('\n🏆 ═══════════════════════════════════════════');
        console.log(`   ${winnerName.toUpperCase()} WINS!`);
        console.log('═══════════════════════════════════════════════\n');
        
        // Victory music
        if (this.systems.music) {
            this.systems.music.stop();
            setTimeout(() => {
                this.systems.music.playVictoryFanfare();
            }, 500);
        }
        
        // Victory commentary
        if (this.systems.commentary) {
            this.systems.commentary.victory(winnerName);
        }
        
        // Massive crowd celebration
        if (this.systems.crowd) {
            this.systems.crowd.setExcitement(1.0);
            this.systems.crowd.react('celebration');
            setTimeout(() => this.systems.crowd.react('chant'), 2000);
        }
        
        this._emit('victory', { winner: winnerName });
    },
    
    /**
     * Tension moment
     */
    tension() {
        if (this.systems.crowd) {
            this.systems.crowd.react('tension');
        }
        
        if (this.systems.commentary) {
            this.systems.commentary.tension();
        }
        
        if (this.systems.music) {
            this.systems.music.playTensionBuild();
        }
        
        this._emit('tension', {});
    },
    
    /**
     * Comeback moment
     */
    comeback(playerName) {
        if (this.systems.commentary) {
            this.systems.commentary.comeback(playerName);
        }
        
        if (this.systems.crowd) {
            this.systems.crowd.react('cheer');
            this.systems.crowd.setExcitement(Math.min(1, this.systems.crowd.excitement + 0.2));
        }
        
        this._emit('comeback', { player: playerName });
    },
    
    // ============================================================
    // AUDIO CONTROLS
    // ============================================================
    
    /**
     * Start all audio
     */
    startAll() {
        this.activate();
        if (this.systems.music && this.settings.musicEnabled) {
            this.systems.music.play();
        }
        if (this.systems.crowd && this.settings.crowdEnabled) {
            this.systems.crowd.startAmbient();
        }
    },
    
    /**
     * Stop all audio
     */
    stopAll() {
        if (this.systems.music) this.systems.music.stop();
        if (this.systems.crowd) this.systems.crowd.stopAmbient();
    },
    
    /**
     * Set master volume
     */
    setVolume(category, value) {
        value = Math.max(0, Math.min(1, value));
        
        if (category === 'master') {
            this.settings.volume.master = value;
            // Apply to all systems
            if (this.systems.music) this.systems.music.setVolume(value * this.settings.volume.music);
            if (this.systems.crowd) this.systems.crowd.setVolume(value * this.settings.volume.crowd);
        } else if (this.settings.volume[category] !== undefined) {
            this.settings.volume[category] = value;
        }
        
        console.log(`🔊 Volume ${category}: ${Math.round(value * 100)}%`);
    },
    
    /**
     * Toggle systems
     */
    toggleMusic() { 
        this.settings.musicEnabled = !this.settings.musicEnabled;
        if (!this.settings.musicEnabled && this.systems.music) {
            // Use stopWithResolution for a satisfying musical ending
            if (this.systems.music.stopWithResolution) {
                this.systems.music.stopWithResolution();
            } else {
                this.systems.music.stop();
            }
        }
        return this.settings.musicEnabled;
    },
    toggleCrowd() {
        this.settings.crowdEnabled = !this.settings.crowdEnabled;
        if (!this.settings.crowdEnabled && this.systems.crowd) this.systems.crowd.stopAmbient();
        return this.settings.crowdEnabled;
    },
    toggleCommentary() {
        this.settings.commentaryEnabled = !this.settings.commentaryEnabled;
        if (this.systems.commentary) this.systems.commentary.speechEnabled = this.settings.commentaryEnabled;
        return this.settings.commentaryEnabled;
    },
    toggleSpeech() {
        this.settings.speechEnabled = !this.settings.speechEnabled;
        if (this.systems.commentary) this.systems.commentary.speechEnabled = this.settings.speechEnabled;
        return this.settings.speechEnabled;
    },
    
    // ============================================================
    // EVENT SYSTEM
    // ============================================================
    
    listeners: new Set(),
    
    on(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },
    
    _emit(type, data) {
        const event = { type, data, theme: this.currentTheme, timestamp: Date.now() };
        this.listeners.forEach(cb => {
            try { cb(event); } catch (e) { console.error('Stadium listener error:', e); }
        });
    },
    
    // ============================================================
    // DEMO MODE
    // ============================================================
    
    /**
     * Run a demo showing all features
     */
    async demo() {
        console.log('\n🎭 Starting Stadium Demo...\n');
        
        this.activate();
        this.setTheme('DEFAULT');
        
        // Game start
        this.gameStart(['Player 1', 'Player 2']);
        
        await this._wait(4000);
        
        // Some captures
        this.capture('Gladiator Rex', 'Swift Shadow');
        
        await this._wait(4000);
        
        // Epic capture
        this.capture('Iron Maximus', 'Speedy Pete', true);
        
        await this._wait(4000);
        
        // Near miss
        this.nearMiss('Lucky Lucy');
        
        await this._wait(3000);
        
        // Fast track
        this.fastTrackEntry('Daring Dan');
        
        await this._wait(3000);
        
        // Tension
        this.tension();
        
        await this._wait(4000);
        
        // Victory!
        this.victory('Gladiator Rex');
        
        console.log('\n🎭 Demo complete!\n');
    },
    
    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    /**
     * Demo different themes
     */
    async themeDemo() {
        const themes = ['DEFAULT', 'SPACE_ACE', 'UNDERSEA', 'ROMAN_COLISEUM'];
        
        for (const theme of themes) {
            this.setTheme(theme);
            this.activate();
            
            if (this.systems.music) this.systems.music.play();
            if (this.systems.crowd) this.systems.crowd.startAmbient();
            
            // Sample commentary
            if (this.systems.commentary) {
                this.systems.commentary.gameStart();
            }
            
            await this._wait(8000);
            
            // Sample capture
            if (this.systems.commentary) {
                this.systems.commentary.epicCapture('Champion', 'Challenger');
            }
            if (this.systems.crowd) {
                this.systems.crowd.react('cheer');
            }
            
            await this._wait(5000);
            
            this.stopAll();
            await this._wait(2000);
        }
        
        console.log('🎨 Theme demo complete!');
    }
};

// Initialize on load
StadiumController.init();

// Export globally
if (typeof window !== 'undefined') {
    window.StadiumController = StadiumController;
}

console.log(`
🏟️ ═══════════════════════════════════════════════════════════
   FASTTRACK STADIUM CONTROLLER
   Complete Stadium Experience System
═══════════════════════════════════════════════════════════════

   🎵 Procedural Theme Music (Space, Undersea, Roman, Classic)
   👥 Reactive Crowd Sounds
   🎤 Two-Announcer Commentary System
   🔊 Integrated Sound Effects

   THEMES:
   🏟️ DEFAULT        - Classic arena, video game vibes
   🚀 SPACE_ACE      - Cosmic synth odyssey  
   🌊 UNDERSEA       - Caribbean calypso waves
   ⚔️ ROMAN_COLISEUM - Ancient glory fanfare

   USAGE:
   StadiumController.activate()    - Initialize audio
   StadiumController.setTheme('SPACE_ACE')
   StadiumController.gameStart()   - Start the show!
   StadiumController.demo()        - See it all in action

═══════════════════════════════════════════════════════════════
`);
