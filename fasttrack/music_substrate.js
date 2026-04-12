/**
 * ============================================================
 * FASTTRACK MUSIC SUBSTRATE v2.0
 * Structured Chiptune / Retro Game Music Engine
 * ============================================================
 * 
 * Generates cool, rhythmic, structured video-game music
 * using Web Audio API. Song structure: Intro → Verse → Chorus
 * → Verse → Bridge → Chorus (loops). Real chord progressions,
 * catchy hooks, punchy bass, and tight drums.
 *
 * 100% procedural — royalty-free original compositions.
 * ButterflyFX Dimensional Programming Standard
 */

'use strict';

const MusicSubstrate = {
    version: '2.0.0',
    name: 'FastTrack Music Engine v2',

    // Audio
    audioContext: null,
    masterGain: null,
    compressor: null,

    // State
    isPlaying: false,
    currentTheme: 'DEFAULT',
    volume: 0.20,
    _schedulerTimer: null,
    _currentTick: 0,
    _sectionIndex: 0,
    _tickInSection: 0,

    // Note frequencies (C2-B6)
    NOTE: (() => {
        const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const n = {};
        for (let oct = 2; oct <= 6; oct++) {
            for (let i = 0; i < 12; i++) {
                const midi = (oct + 1) * 12 + i;
                n[names[i] + oct] = 440 * Math.pow(2, (midi - 69) / 12);
            }
        }
        return n;
    })(),

    // ============================================================
    // THEME SONG DEFINITIONS
    // ============================================================
    // Ticks are 16th notes. 16 ticks = 1 bar (4/4).

    themes: {
        DEFAULT: {
            name: 'Neon Circuit',
            bpm: 128,
            swing: 0,
            sections: [
                { name: 'intro',  tickLength: 64 },
                { name: 'verse',  tickLength: 128 },
                { name: 'chorus', tickLength: 128 },
                { name: 'verse',  tickLength: 128 },
                { name: 'bridge', tickLength: 64 },
                { name: 'chorus', tickLength: 128 },
            ],
            chords: {
                intro:  ['C4','C4','Am3','Am3'],
                verse:  ['C4','G3','Am3','F3',  'C4','G3','Am3','F3'],
                chorus: ['F3','G3','C4','Am3',  'F3','G3','C4','C4'],
                bridge: ['Dm3','Em3','F3','G3'],
            },
            bass: {
                intro:   { ticks: [0,8],       intervals: [0,0] },
                verse:   { ticks: [0,4,8,12],  intervals: [0,0,0,7] },
                chorus:  { ticks: [0,2,4,6,8,10,12,14], intervals: [0,12,0,12,0,12,0,7] },
                bridge:  { ticks: [0,6,8,14],  intervals: [0,7,0,5] },
            },
            melody: {
                intro: [
                    null,null,null,null, null,null,null,null, 'E5',null,'G5',null, 'C6',null,null,null,
                    null,null,null,null, null,null,null,null, 'D5',null,'E5',null, 'G5',null,null,null,
                    null,null,null,null, null,null,null,null, 'A4',null,'C5',null, 'E5',null,null,null,
                    null,null,null,null, null,null,null,null, 'G4',null,'A4',null, 'C5',null,null,null,
                ],
                verse: [
                    'E5',null,null,'E5', null,'D5',null,null, 'C5',null,null,null, null,null,'D5',null,
                    'E5',null,null,'E5', null,'G5',null,null, 'E5',null,null,null, null,null,null,null,
                    'A4',null,null,'A4', null,'C5',null,null, 'D5',null,null,'C5', null,'A4',null,null,
                    'G4',null,null,null, 'A4',null,'C5',null, 'A4',null,null,null, null,null,null,null,
                    'E5',null,null,'E5', null,'D5',null,null, 'C5',null,'D5',null, 'E5',null,null,null,
                    'G5',null,null,'E5', null,'D5',null,null, 'C5',null,null,null, null,null,null,null,
                    'A4',null,'C5',null, 'D5',null,'E5',null, 'D5',null,'C5',null, 'A4',null,null,null,
                    'G4',null,null,null, null,null,null,null, null,null,null,null, null,null,null,null,
                ],
                chorus: [
                    'C5','C5',null,'E5', null,'G5',null,'A5', 'G5',null,null,null, null,null,null,null,
                    'A4','A4',null,'C5', null,'D5',null,'E5', 'D5',null,null,null, null,null,'E5',null,
                    'C5','C5',null,'E5', null,'G5',null,'C6', 'C6',null,null,'G5', null,null,null,null,
                    'A4',null,null,'G4', null,null,'A4',null, 'C5',null,null,null, null,null,null,null,
                    'C5','C5',null,'E5', null,'G5',null,'A5', 'G5',null,'E5',null, 'G5',null,null,null,
                    'A4','A4',null,'C5', null,'D5',null,'E5', 'E5',null,null,null, null,null,'D5',null,
                    'C5',null,'E5',null, 'G5',null,'C6',null, 'G5',null,'E5',null, 'C5',null,null,null,
                    'C5',null,null,null, null,null,null,null, null,null,null,null, null,null,null,null,
                ],
                bridge: [
                    'D5',null,'F5',null, 'A5',null,null,null, 'G5',null,'F5',null, 'E5',null,null,null,
                    'E5',null,'G5',null, 'B4',null,null,null, 'C5',null,'D5',null, 'E5',null,null,null,
                    'F5',null,'A5',null, 'C6',null,null,null, 'B5',null,'A5',null, 'G5',null,null,null,
                    'G5',null,null,'F5', null,'E5',null,'D5', 'C5',null,null,null, null,null,null,null,
                ],
            },
            arp: {
                intro:   { speed: 4, pattern: [0,4,7,12] },
                verse:   { speed: 2, pattern: [0,4,7,12,7,4] },
                chorus:  { speed: 2, pattern: [0,7,12,7] },
                bridge:  { speed: 3, pattern: [0,3,7,12,7,3] },
            },
            drums: {
                intro:  { kick: [0,8], snare: [], hihat: [0,4,8,12], openhat: [6,14] },
                verse:  { kick: [0,6,8,14], snare: [4,12], hihat: [0,2,4,6,8,10,12,14], openhat: [] },
                chorus: { kick: [0,2,8,10], snare: [4,12], hihat: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], openhat: [] },
                bridge: { kick: [0,10], snare: [4,12], hihat: [0,4,8,12], openhat: [2,6,10,14] },
            },
            instruments: {
                bass:    { wave: 'sawtooth', volume: 0.18, octave: 2, filterFreq: 400, release: 0.12 },
                melody:  { wave: 'square',   volume: 0.10, octave: 0, filterFreq: 2500, release: 0.15, vibratoRate: 5, vibratoDepth: 3 },
                arp:     { wave: 'square',   volume: 0.06, octave: 5, filterFreq: 3000, release: 0.05 },
                pad:     { wave: 'triangle', volume: 0.05, octave: 3, filterFreq: 1200, release: 0.4 },
            }
        },

        SPACE_ACE: {
            name: 'Cosmic Whirl',
            bpm: 116,
            swing: 0.06,
            sections: [
                { name: 'intro',  tickLength: 64 },
                { name: 'verse',  tickLength: 128 },
                { name: 'chorus', tickLength: 128 },
                { name: 'verse',  tickLength: 128 },
                { name: 'bridge', tickLength: 64 },
                { name: 'chorus', tickLength: 128 },
            ],
            chords: {
                intro:  ['Dm3','Dm3','Bb3','Bb3'],
                verse:  ['Dm3','Am3','Bb3','C4',  'Dm3','Am3','Gm3','A3'],
                chorus: ['Bb3','C4','Dm3','Am3',  'Bb3','C4','Dm3','Dm3'],
                bridge: ['Gm3','Am3','Bb3','A3'],
            },
            bass: {
                intro:   { ticks: [0,8],       intervals: [0,0] },
                verse:   { ticks: [0,6,8,14],  intervals: [0,7,0,5] },
                chorus:  { ticks: [0,4,8,12],  intervals: [0,12,0,7] },
                bridge:  { ticks: [0,8,12],    intervals: [0,7,5] },
            },
            melody: {
                intro: [
                    // Bar 1 — Eerie winding approach
                    null,null,null,null, null,null,'A4',null, null,'D5',null,null, null,null,'F5',null,
                    // Bar 2 — Sweeping up then vanish
                    null,'A5',null,null, null,null,'D5',null, null,null,null,null, null,null,null,null,
                    // Bar 3 — Second spiral
                    null,null,null,null, null,null,'Bb4',null, null,'D5',null,null, null,null,'G5',null,
                    // Bar 4 — Resolve
                    null,'F5',null,null, null,null,'D5',null, null,null,null,null, null,null,null,null,
                ],
                verse: [
                    // Bar 1 — Whirling theme with wide leaps
                    'D5',null,'A5',null, null,'D5',null,'F5', null,'A5',null,null, null,null,'G5',null,
                    // Bar 2
                    null,'F5',null,'E5', null,'D5',null,null, 'A4',null,null,null, null,null,null,null,
                    // Bar 3 — Swooping down and up
                    'Bb4',null,'F5',null, null,'Bb4',null,'D5', null,'F5',null,null, null,null,'E5',null,
                    // Bar 4
                    null,'D5',null,'C5', null,null,null,null, null,null,null,null, null,null,null,null,
                    // Bar 5 — Ascending spiral
                    'D5',null,'F5',null, null,'A5',null,'D6', null,'A5',null,null, null,null,'F5',null,
                    // Bar 6 — Cascading back
                    null,'D5',null,'Bb4', null,'A4',null,null, 'G4',null,null,null, null,null,null,null,
                    // Bar 7 — Rapid whirl
                    'F5',null,'D5',null, null,'A4',null,'F5', null,'D5',null,'A4', null,'D5',null,null,
                    // Bar 8
                    'D5',null,null,null, null,null,null,null, null,null,null,null, null,null,null,null,
                ],
                chorus: [
                    // Bar 1 — Soaring wide intervals
                    'D5','D5',null,'A5', null,'D6',null,null, 'Bb5',null,null,null, null,null,'A5',null,
                    // Bar 2
                    'G5',null,'F5',null, null,'D5',null,'F5', 'E5',null,null,null, null,null,null,null,
                    // Bar 3 — Cosmic sweep
                    'D5','D5',null,'F5', null,'A5',null,'D6', 'D6',null,null,'C6', null,'Bb5',null,null,
                    // Bar 4
                    'A5',null,'G5',null, null,'F5',null,'E5', 'D5',null,null,null, null,null,null,null,
                    // Bar 5 — Echo phrase higher
                    'D5','D5',null,'A5', null,'D6',null,'F6', 'D6',null,null,null, null,'A5',null,null,
                    // Bar 6
                    'Bb5',null,'A5',null, null,'G5',null,'F5', 'E5',null,null,null, null,null,'D5',null,
                    // Bar 7 — Whirl down
                    'A5',null,'F5',null, 'D5',null,'A4',null, 'F5',null,'D5',null, 'A4',null,null,null,
                    // Bar 8
                    'D5',null,null,null, null,null,null,null, null,null,null,null, null,null,null,null,
                ],
                bridge: [
                    // Bar 1 — Wide atmospheric intervals
                    'G4',null,'D5',null, 'Bb5',null,null,null, 'A5',null,'G5',null, 'F5',null,null,null,
                    // Bar 2
                    'A4',null,'E5',null, 'C#5',null,null,null, 'D5',null,'E5',null, 'F5',null,null,null,
                    // Bar 3 — Octave leaps
                    'Bb4',null,'F5',null, 'D6',null,null,null, 'C6',null,'Bb5',null, 'A5',null,null,null,
                    // Bar 4 — Cascading resolve
                    'A5',null,'G5',null, 'F5',null,'E5',null, 'D5',null,null,null, null,null,null,null,
                ],
            },
            arp: {
                intro:   { speed: 4, pattern: [0,3,7,12] },
                verse:   { speed: 2, pattern: [0,3,7,12,7,3] },
                chorus:  { speed: 2, pattern: [0,7,12,7] },
                bridge:  { speed: 3, pattern: [0,3,7,10,7,3] },
            },
            drums: {
                intro:  { kick: [0,8], snare: [], hihat: [0,4,8,12], openhat: [6,14] },
                verse:  { kick: [0,8,10], snare: [4,12], hihat: [0,2,4,6,8,10,12,14], openhat: [] },
                chorus: { kick: [0,4,8,12], snare: [4,12], hihat: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], openhat: [], crash: [0] },
                bridge: { kick: [0,12], snare: [4,12], hihat: [0,4,8,12], openhat: [2,6,10,14] },
            },
            instruments: {
                // Heavy vibrato on sine = theremin-like whirling
                bass:    { wave: 'triangle', volume: 0.16, octave: 2, filterFreq: 300, release: 0.18 },
                melody:  { wave: 'sine',     volume: 0.11, octave: 0, filterFreq: 2200, release: 0.22, vibratoRate: 7, vibratoDepth: 8 },
                arp:     { wave: 'sine',     volume: 0.06, octave: 5, filterFreq: 3000, release: 0.10 },
                pad:     { wave: 'sine',     volume: 0.07, octave: 3, filterFreq: 700, release: 0.6 },
            }
        },

        UNDERSEA: {
            name: 'Calypso Reef',
            bpm: 126,
            swing: 0.15,
            sections: [
                { name: 'intro',  tickLength: 64 },
                { name: 'verse',  tickLength: 128 },
                { name: 'chorus', tickLength: 128 },
                { name: 'verse',  tickLength: 128 },
                { name: 'bridge', tickLength: 64 },
                { name: 'chorus', tickLength: 128 },
            ],
            chords: {
                intro:  ['G3','G3','C3','C3'],
                verse:  ['G3','C3','D3','Em3',  'G3','C3','Am3','D3'],
                chorus: ['C3','D3','G3','Em3',  'C3','D3','G3','G3'],
                bridge: ['Am3','Bm3','C4','D3'],
            },
            bass: {
                // Calypso island bass — offbeat bounce, root-5th pumping
                intro:   { ticks: [0,6],        intervals: [0,7] },
                verse:   { ticks: [0,6,8,14],   intervals: [0,7,0,12] },
                chorus:  { ticks: [0,4,6,8,12,14], intervals: [0,12,7,0,12,7] },
                bridge:  { ticks: [0,6,8,14],   intervals: [0,7,0,5] },
            },
            melody: {
                intro: [
                    // Bar 1 — Steel drum intro — syncopated plinks
                    null,'G4',null,null, 'B4',null,null,'D5', null,null,'G5',null, null,null,null,null,
                    // Bar 2
                    null,'G5',null,null, 'E5',null,null,'D5', null,null,'B4',null, null,null,null,null,
                    // Bar 3
                    null,'G4',null,null, 'A4',null,null,'B4', null,null,'D5',null, 'E5',null,null,null,
                    // Bar 4
                    null,'D5',null,null, 'B4',null,null,'G4', null,null,null,null, null,null,null,null,
                ],
                verse: [
                    // Bar 1 — Calypso bounce
                    'G4',null,'B4',null, null,'D5',null,'B4', null,'G4',null,null, null,'A4',null,null,
                    // Bar 2
                    null,'B4',null,'D5', null,'E5',null,null, 'D5',null,null,null, null,null,null,null,
                    // Bar 3
                    'D5',null,'E5',null, null,'G5',null,'E5', null,'D5',null,null, null,'B4',null,null,
                    // Bar 4
                    null,'A4',null,'B4', null,'G4',null,null, null,null,null,null, null,null,null,null,
                    // Bar 5 — Second phrase
                    'G4',null,'A4',null, null,'B4',null,'D5', null,'E5',null,null, 'G5',null,null,null,
                    // Bar 6
                    null,'E5',null,'D5', null,'B4',null,null, 'A4',null,null,null, null,null,null,null,
                    // Bar 7
                    'B4',null,'D5',null, null,'E5',null,'D5', null,'B4',null,'A4', null,'G4',null,null,
                    // Bar 8
                    null,'A4',null,'G4', null,null,null,null, null,null,null,null, null,null,null,null,
                ],
                chorus: [
                    // Bar 1 — Big calypso chorus
                    'G5',null,'G5',null, null,'E5',null,'D5', null,'B4',null,null, 'D5',null,null,null,
                    // Bar 2
                    null,'D5',null,'E5', null,'G5',null,null, 'A5',null,null,null, null,null,'G5',null,
                    // Bar 3
                    'G5',null,'B5',null, null,'A5',null,'G5', null,'E5',null,null, 'D5',null,null,null,
                    // Bar 4
                    null,'E5',null,'D5', null,null,'B4',null, 'G4',null,null,null, null,null,null,null,
                    // Bar 5
                    'G5',null,'A5',null, null,'B5',null,'A5', null,'G5',null,null, 'E5',null,null,null,
                    // Bar 6
                    null,'D5',null,'E5', null,'G5',null,null, 'B5',null,null,null, null,null,'A5',null,
                    // Bar 7
                    'G5',null,'E5',null, null,'D5',null,'B4', null,'G4',null,'B4', null,'D5',null,null,
                    // Bar 8
                    'G4',null,null,null, null,null,null,null, null,null,null,null, null,null,null,null,
                ],
                bridge: [
                    // Bar 1
                    'A4',null,'C5',null, null,'E5',null,'C5', null,'A4',null,null, 'B4',null,null,null,
                    // Bar 2
                    'B4',null,'D5',null, null,'F#5',null,'D5', null,'B4',null,null, 'A4',null,null,null,
                    // Bar 3
                    'C5',null,'E5',null, null,'G5',null,'E5', null,'C5',null,null, 'D5',null,null,null,
                    // Bar 4
                    null,'D5',null,'B4', null,'A4',null,'G4', null,null,null,null, null,null,null,null,
                ],
            },
            arp: {
                intro:   { speed: 2, pattern: [0,4,7,12,7,4] },
                verse:   { speed: 2, pattern: [0,4,7,12,7,4] },
                chorus:  { speed: 2, pattern: [0,7,12,7] },
                bridge:  { speed: 3, pattern: [0,4,7,11,7,4] },
            },
            drums: {
                // Calypso beat patterns
                intro:  { kick: [0], snare: [], hihat: [0,2,4,6,8,10,12,14], openhat: [4,12], clap: [] },
                verse:  { kick: [0,6,10], snare: [4,12], hihat: [0,2,4,6,8,10,12,14], openhat: [], clap: [4,12] },
                chorus: { kick: [0,6,8,14], snare: [4,12], hihat: [0,2,4,6,8,10,12,14], openhat: [6,14], clap: [4,12] },
                bridge: { kick: [0,10], snare: [4,12], hihat: [0,4,8,12], openhat: [2,6,10,14], clap: [] },
            },
            instruments: {
                bass:    { wave: 'triangle', volume: 0.18, octave: 2, filterFreq: 600, release: 0.10 },
                melody:  { wave: 'square',   volume: 0.11, octave: 0, filterFreq: 2800, release: 0.12, vibratoRate: 6, vibratoDepth: 2 },
                arp:     { wave: 'triangle', volume: 0.06, octave: 5, filterFreq: 3500, release: 0.05 },
                pad:     { wave: 'sine',     volume: 0.05, octave: 3, filterFreq: 1200, release: 0.4 },
            }
        },

        ROMAN_COLISEUM: {
            name: "Imperator's March",
            bpm: 92,
            swing: 0,
            sections: [
                { name: 'intro',  tickLength: 64 },
                { name: 'verse',  tickLength: 128 },
                { name: 'chorus', tickLength: 128 },
                { name: 'verse',  tickLength: 128 },
                { name: 'bridge', tickLength: 64 },
                { name: 'chorus', tickLength: 128 },
            ],
            chords: {
                intro:  ['Am3','Am3','Dm3','Dm3'],
                verse:  ['Am3','E3','Dm3','Am3',  'Am3','G3','F3','E3'],
                chorus: ['Dm3','G3','Am3','E3',   'Dm3','G3','Am3','Am3'],
                bridge: ['F3','G3','Am3','E3'],
            },
            bass: {
                intro:   { ticks: [0,4,8,12],  intervals: [0,0,0,0] },
                verse:   { ticks: [0,4,8,12],  intervals: [0,0,7,5] },
                chorus:  { ticks: [0,4,8,12],  intervals: [0,7,0,12] },
                bridge:  { ticks: [0,8],        intervals: [0,7] },
            },
            melody: {
                intro: [
                    // Bar 1 — Horn call from darkness
                    null,null,null,null, 'A3',null,null,null, null,null,null,null, 'E4',null,null,null,
                    // Bar 2 — Answer
                    null,null,null,null, 'A4',null,null,null, null,null,null,null, null,null,null,null,
                    // Bar 3 — Expanding fanfare
                    'A3',null,null,'A3', null,null,'C4',null, 'E4',null,null,null, 'A4',null,null,null,
                    // Bar 4 — Resolve
                    'E4',null,'D4',null, 'C4',null,null,null, 'A3',null,null,null, null,null,null,null,
                ],
                verse: [
                    // Bar 1 — March theme — strong downbeats
                    'A4',null,null,'A4', null,null,'A4',null, 'C5',null,'D5',null, 'E5',null,null,null,
                    // Bar 2
                    'E5',null,null,'D5', null,null,'C5',null, 'A4',null,null,null, null,null,null,null,
                    // Bar 3
                    'D4',null,null,'D4', null,null,'F4',null, 'A4',null,null,null, 'A4',null,'G4',null,
                    // Bar 4 — Cadence
                    'F4',null,'E4',null, 'D4',null,null,null, 'E4',null,null,null, null,null,null,null,
                    // Bar 5 — Repeat higher
                    'A4',null,null,'A4', null,null,'B4',null, 'C5',null,'E5',null, 'A5',null,null,null,
                    // Bar 6
                    'A5',null,null,'G4', null,null,'F4',null, 'E4',null,null,null, null,null,null,null,
                    // Bar 7 — Descending march
                    'C5',null,'B4',null, 'A4',null,'G4',null, 'F4',null,'E4',null, 'D4',null,null,null,
                    // Bar 8 — Resolve
                    'E4',null,null,null, 'A3',null,null,null, null,null,null,null, null,null,null,null,
                ],
                chorus: [
                    // Bar 1 — TRIUMPH! Fanfare leaps
                    'A4','A4',null,'E5', null,'A5',null,null, 'A5',null,null,null, null,null,'G5',null,
                    // Bar 2
                    'E5','E5',null,'A4', null,'C5',null,'E5', 'D5',null,null,null, null,null,null,null,
                    // Bar 3
                    'D5','D5',null,'F5', null,'A5',null,null, 'A5',null,null,'E5', null,null,'D5',null,
                    // Bar 4
                    'C5',null,null,'B4', null,null,'A4',null, 'E4',null,null,null, null,null,null,null,
                    // Bar 5 — Second phrase
                    'A4','A4',null,'E5', null,'A5',null,'C6', 'A5',null,'E5',null, 'A5',null,null,null,
                    // Bar 6
                    'G5',null,null,'F5', null,'E5',null,'D5', 'C5',null,null,null, null,null,'D5',null,
                    // Bar 7 — Power ending 4ths & 5ths
                    'E5',null,'A5',null, 'E5',null,'A4',null, 'E5',null,'A5',null, 'E5',null,null,null,
                    // Bar 8 — Resolve
                    'A4',null,null,null, null,null,null,null, null,null,null,null, null,null,null,null,
                ],
                bridge: [
                    // Bar 1 — Building tension
                    'F4',null,'A4',null, 'C5',null,'F5',null, 'E5',null,'D5',null, 'C5',null,null,null,
                    // Bar 2
                    'G4',null,'B4',null, 'D5',null,'G5',null, 'F5',null,'E5',null, 'D5',null,null,null,
                    // Bar 3
                    'A4',null,'C5',null, 'E5',null,'A5',null, 'G5',null,'E5',null, 'C5',null,null,null,
                    // Bar 4 — Tension resolve
                    'B4',null,'A4',null, 'G#4',null,null,null, 'A4',null,null,null, null,null,null,null,
                ],
            },
            arp: {
                intro:   { speed: 4, pattern: [0,3,7,12] },
                verse:   { speed: 4, pattern: [0,7,12,7] },
                chorus:  { speed: 2, pattern: [0,3,7,12,7,3] },
                bridge:  { speed: 4, pattern: [0,3,7,10] },
            },
            drums: {
                // Intro: Building military drums — kick on every beat, toms on offbeats
                intro:  { kick: [0,4,8,12], snare: [], tom: [2,6,10,14], hihat: [] },
                // Verse: Full march cadence — kick 1&3, snare 2&4, toms fill
                verse:  { kick: [0,8], snare: [4,12], tom: [2,6,10,14], hihat: [] },
                // Chorus: Maximum power — everything!
                chorus: { kick: [0,4,8,12], snare: [4,12], tom: [2,6,10,14], hihat: [0,2,4,6,8,10,12,14], crash: [0] },
                // Bridge: Snare drum roll (every 16th)
                bridge: { kick: [0,8], snare: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], tom: [], hihat: [] },
            },
            instruments: {
                bass:    { wave: 'sawtooth', volume: 0.20, octave: 2, filterFreq: 350, release: 0.14 },
                melody:  { wave: 'sawtooth', volume: 0.12, octave: 0, filterFreq: 1600, release: 0.20, vibratoRate: 3, vibratoDepth: 4 },
                arp:     { wave: 'square',   volume: 0.05, octave: 4, filterFreq: 2000, release: 0.08 },
                pad:     { wave: 'triangle', volume: 0.07, octave: 3, filterFreq: 800, release: 0.5 },
            }
        },
    },

    // ============================================================
    // INITIALIZATION
    // ============================================================

    init() {
        console.log('[MusicSubstrate v2] Initialized');
    },

    activate() {
        if (this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }
            return true;
        }
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioContext.state === 'suspended') this.audioContext.resume();

            this.compressor = this.audioContext.createDynamicsCompressor();
            this.compressor.threshold.value = -18;
            this.compressor.knee.value = 12;
            this.compressor.ratio.value = 4;
            this.compressor.attack.value = 0.003;
            this.compressor.release.value = 0.15;
            this.compressor.connect(this.audioContext.destination);

            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.compressor);

            console.log('[MusicSubstrate v2] Audio context activated');
            return true;
        } catch (e) {
            console.error('Audio context error:', e);
            return false;
        }
    },

    // ============================================================
    // PLAYBACK CONTROL
    // ============================================================

    play(themeName) {
        if (themeName) this.currentTheme = themeName;
        if (!this.activate()) return;
        this.stop();

        const theme = this.themes[this.currentTheme];
        if (!theme) {
            console.error('Unknown theme:', this.currentTheme);
            return;
        }

        console.log('[MusicSubstrate v2] Playing:', theme.name, theme.bpm + 'BPM — 4 procedural variations will rotate');
        this.isPlaying = true;
        this._currentTick = 0;
        this._sectionIndex = 0;
        this._tickInSection = 0;
        // Variation system — start fresh, first loop plays original theme
        this._loopCount = 0;
        this._activeVariation = null; // null = use original theme

        const sixteenthMs = (60000 / theme.bpm) / 4;
        this._schedulerTimer = setInterval(() => this._tick(theme), sixteenthMs);
    },

    stop() {
        this.isPlaying = false;
        if (this._schedulerTimer) {
            clearInterval(this._schedulerTimer);
            this._schedulerTimer = null;
        }
    },

    stopWithResolution() {
        if (!this.isPlaying || !this.audioContext) { this.stop(); return; }
        const theme = this.themes[this.currentTheme];
        const beat = 60000 / (theme ? theme.bpm : 120);
        const root = this._parseNote(theme && theme.chords && theme.chords.chorus ? theme.chords.chorus[0] : 'C4');

        this._synthNote(root * 1.5, beat / 1000 * 1.5, 'triangle', 0.12);
        setTimeout(() => {
            this._synthNote(root / 2, beat / 1000 * 2.5, 'triangle', 0.14);
            this._synthNote(root, beat / 1000 * 2, 'sine', 0.10);
            this._synthNote(root * 2, beat / 1000 * 1.8, 'sine', 0.06);
        }, beat * 1.5);
        setTimeout(() => this.stop(), beat * 4);
    },

    playCadence() {
        if (!this.isPlaying || !this.audioContext) return;
        const theme = this.themes[this.currentTheme];
        const beat = 60000 / (theme ? theme.bpm : 120);
        const root = this._parseNote(theme && theme.chords && theme.chords.chorus ? theme.chords.chorus[0] : 'C4');
        this._synthNote(root * 1.5, beat / 1000 * 0.6, 'triangle', 0.08);
        setTimeout(() => {
            this._synthNote(root, beat / 1000 * 1, 'triangle', 0.10);
        }, beat * 0.6);
    },

    // ============================================================
    // SEQUENCER TICK — unified master clock, called every 16th note
    // ============================================================

    _tick(theme) {
        if (!this.isPlaying) return;

        // Use active variation if available, otherwise original theme
        var active = this._activeVariation || theme;

        var sections = active.sections;
        var sec = sections[this._sectionIndex];
        var secName = sec.name;
        var tickInBar = this._tickInSection % 16;
        var barInSection = Math.floor(this._tickInSection / 16);

        this._tickDrums(active, secName, tickInBar);
        this._tickBass(active, secName, tickInBar, barInSection);
        this._tickMelody(active, secName);
        this._tickArp(active, secName, tickInBar, barInSection);

        if (tickInBar === 0) {
            this._tickPad(active, secName, barInSection);
        }

        this._currentTick++;
        this._tickInSection++;
        if (this._tickInSection >= sec.tickLength) {
            this._tickInSection = 0;
            this._sectionIndex = (this._sectionIndex + 1) % sections.length;
            // When the song loops back to start, generate a fresh unique variation
            if (this._sectionIndex === 0) {
                this._loopCount = (this._loopCount || 0) + 1;
                this._activeVariation = this._generateVariation(theme, this._loopCount);
                // Shuffle section order after first loop for variety
                if (this._loopCount > 1) {
                    this._activeVariation.sections = this._shuffleSections(theme.sections);
                }
                console.log('[MusicSubstrate v2] 🎶 Loop', this._loopCount, '— fresh procedural variation');
            }
        }
    },

    // ============================================================
    // VARIATION GENERATOR — infinite procedural mutations per theme
    // ============================================================
    // Every loop generates a unique combination of tempo, swing,
    // instrument voicings, arp patterns, drum fills, melody mutations,
    // and section ordering. No two loops ever sound the same.

    _loopCount: 0,
    _activeVariation: null,

    _shuffleSections(originalSections) {
        // Always start with intro on first appearance, then shuffle the rest
        // Create a pool of section types with varied lengths
        var pool = ['verse','chorus','bridge','verse','chorus'];
        // Fisher-Yates shuffle
        for (var i = pool.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        // Build sections with randomized lengths
        var sections = [];
        for (var s = 0; s < pool.length; s++) {
            var baseTicks = pool[s] === 'bridge' ? 64 : 128;
            // Randomly shorten or extend sections
            var lenMul = Math.random() < 0.3 ? 0.5 : (Math.random() < 0.2 ? 1.5 : 1);
            sections.push({ name: pool[s], tickLength: Math.round(baseTicks * lenMul) });
        }
        return sections;
    },

    _generateVariation(base, loopNum) {
        // Deep-clone the base theme so mutations don't corrupt the original
        var v = JSON.parse(JSON.stringify(base));

        // True random (not seeded) — every loop is unique
        var rand = function() { return Math.random(); };

        // ── BPM drift: ±15% range from base, biased by loop parity
        var bpmShift = (rand() - 0.5) * 0.3; // -15% to +15%
        v.bpm = Math.round(base.bpm * (1 + bpmShift));
        v.bpm = Math.max(90, Math.min(160, v.bpm)); // Clamp to sane range

        // ── Swing drift
        v.swing = Math.max(0, Math.min(0.3, base.swing + (rand() - 0.5) * 0.15));

        // ── Pick a mood profile randomly
        var moods = ['energy', 'deep', 'stripped', 'cosmic', 'driving', 'chill', 'bright'];
        var mood = moods[Math.floor(rand() * moods.length)];
        v.name = base.name + ' (' + mood + ' #' + loopNum + ')';

        // ── Drum mutations based on mood
        var drumSections = ['verse', 'chorus', 'bridge', 'intro'];
        var kickPatterns = [
            [0,8], [0,6,8,14], [0,4,8,12], [0,2,8,10], [0,3,6,8,11,14],
            [0,2,4,6,8,10,12,14], [0,8,10], [0,4,10,14], [0,6,10]
        ];
        var hihatPatterns = [
            [0,4,8,12], [0,2,4,6,8,10,12,14],
            [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
            [0,2,8,10], [0,4,8,12,14]
        ];
        var snarePatterns = [
            [4,12], [4,12], [2,4,10,12], [4,8,12], [], [4,12,14], [2,6,10,14]
        ];
        for (var d = 0; d < drumSections.length; d++) {
            var ds = drumSections[d];
            if (v.drums[ds]) {
                if (rand() > 0.4) v.drums[ds].kick = kickPatterns[Math.floor(rand() * kickPatterns.length)];
                if (rand() > 0.4) v.drums[ds].hihat = hihatPatterns[Math.floor(rand() * hihatPatterns.length)];
                if (rand() > 0.5) v.drums[ds].snare = snarePatterns[Math.floor(rand() * snarePatterns.length)];
                // Random open hihat
                if (rand() > 0.7) v.drums[ds].openhat = [2,6,10,14].filter(function() { return rand() > 0.4; });
                // Random crash on downbeat
                if (rand() > 0.8) v.drums[ds].crash = [0];
            }
        }

        // ── Bass pattern mutations
        var bassPatterns = [
            { ticks: [0,8], intervals: [0,0] },
            { ticks: [0,4,8,12], intervals: [0,0,0,7] },
            { ticks: [0,6,8,14], intervals: [0,7,0,5] },
            { ticks: [0,2,4,6,8,10,12,14], intervals: [0,0,7,12,0,0,5,7] },
            { ticks: [0,4,8,12], intervals: [0,12,0,7] },
            { ticks: [0,2,8,10], intervals: [0,5,0,7] },
            { ticks: [0,8,12], intervals: [0,7,5] }
        ];
        var bassSecs = ['verse', 'chorus', 'bridge'];
        for (var b = 0; b < bassSecs.length; b++) {
            if (v.bass[bassSecs[b]] && rand() > 0.4) {
                v.bass[bassSecs[b]] = bassPatterns[Math.floor(rand() * bassPatterns.length)];
            }
        }

        // ── Arp pattern mutations (consonant intervals only: root, 3rd, 4th, 5th, octave)
        var arpPatterns = [
            [0,4,7,12], [0,7,12,7], [0,3,7,12,7,3], [0,5,7,12,7,5],
            [0,4,7,12,7,4], [0,7,12,16,12,7], [0,3,7,12],
            [0,12,7,12], [0,4,7,4]
        ];
        var arpSecs = ['verse', 'chorus', 'bridge', 'intro'];
        for (var a = 0; a < arpSecs.length; a++) {
            if (v.arp[arpSecs[a]] && rand() > 0.4) {
                v.arp[arpSecs[a]].pattern = arpPatterns[Math.floor(rand() * arpPatterns.length)];
                v.arp[arpSecs[a]].speed = Math.max(1, Math.floor(rand() * 4) + 1);
            }
        }

        // ── Melody note mutations: consonant transpose + breathing room
        // ONLY transpose by perfect intervals (P4=5, P5=7, P8=12) to stay in key
        var melSecs = ['verse', 'chorus', 'bridge', 'intro'];
        var noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        var safeTranspose = [0, 0, 5, 7, 12, -5, -7]; // only perfect intervals
        for (var m = 0; m < melSecs.length; m++) {
            var melArr = v.melody[melSecs[m]];
            if (!melArr) continue;
            // Global transpose: shift all notes by a consonant interval
            var transpose = safeTranspose[Math.floor(rand() * safeTranspose.length)];
            if (rand() > 0.5 && transpose !== 0) {
                for (var n = 0; n < melArr.length; n++) {
                    if (!melArr[n]) continue;
                    var match = melArr[n].match(/^([A-G][#b]?)(\d)$/);
                    if (!match) continue;
                    var noteIdx = noteNames.indexOf(match[1].replace('b',''));
                    if (match[1].endsWith('b')) noteIdx = (noteIdx - 1 + 12) % 12;
                    var oct = parseInt(match[2]);
                    noteIdx += transpose;
                    if (noteIdx >= 12) { noteIdx -= 12; oct++; }
                    if (noteIdx < 0) { noteIdx += 12; oct--; }
                    oct = Math.max(3, Math.min(6, oct));
                    melArr[n] = noteNames[noteIdx] + oct;
                }
            }
            // Random note dropping (make some notes silent for breathing room)
            if (rand() > 0.5) {
                var dropRate = 0.1 + rand() * 0.15; // 10-25% of notes dropped
                for (var n2 = 0; n2 < melArr.length; n2++) {
                    if (melArr[n2] && rand() < dropRate) melArr[n2] = null;
                }
            }
            // NO random octave jumps — they create jarring leaps
        }

        // ── Instrument voicing mutations
        var waves = ['sine', 'square', 'sawtooth', 'triangle'];
        // Randomly swap melody waveform
        if (rand() > 0.5 && v.instruments.melody) {
            v.instruments.melody.wave = waves[Math.floor(rand() * waves.length)];
        }
        // Randomly shift filter frequencies
        if (v.instruments.melody && rand() > 0.4) {
            v.instruments.melody.filterFreq = 1500 + Math.floor(rand() * 2500);
        }
        if (v.instruments.bass && rand() > 0.5) {
            v.instruments.bass.filterFreq = 200 + Math.floor(rand() * 400);
        }
        // Random vibrato changes (capped to stay pleasant)
        if (v.instruments.melody && rand() > 0.4) {
            v.instruments.melody.vibratoRate = 3 + Math.floor(rand() * 5); // 3-7 Hz
            v.instruments.melody.vibratoDepth = 1 + Math.floor(rand() * 3); // 1-3 Hz max
        }
        // Volume micro-variations (±20%)
        var instKeys = ['bass', 'melody', 'arp', 'pad'];
        for (var ik = 0; ik < instKeys.length; ik++) {
            if (v.instruments[instKeys[ik]]) {
                var baseVol = base.instruments[instKeys[ik]].volume;
                v.instruments[instKeys[ik]].volume = Math.min(0.22, Math.max(0.03, baseVol * (0.8 + rand() * 0.4)));
            }
        }

        // ── No chord substitution — previous logic produced clashing harmonies
        // Chords stay as composed to keep progressions pleasant and resolved

        return v;
    },

    _tickDrums(theme, secName, tickInBar) {
        var dp = theme.drums[secName];
        if (!dp) return;
        if (dp.kick && dp.kick.indexOf(tickInBar) !== -1)     this._playKick();
        if (dp.snare && dp.snare.indexOf(tickInBar) !== -1)   this._playSnare();
        if (dp.hihat && dp.hihat.indexOf(tickInBar) !== -1)   this._playHiHat(0.06);
        if (dp.openhat && dp.openhat.indexOf(tickInBar) !== -1) this._playOpenHat();
        if (dp.tom && dp.tom.indexOf(tickInBar) !== -1)       this._playTom();
        if (dp.clap && dp.clap.indexOf(tickInBar) !== -1)     this._playClap();
        if (dp.crash && dp.crash.indexOf(tickInBar) !== -1)   this._playCrash();
    },

    _tickBass(theme, secName, tickInBar, barInSection) {
        var bp = theme.bass[secName];
        if (!bp) return;
        var idx = bp.ticks.indexOf(tickInBar);
        if (idx === -1) return;

        var chords = theme.chords[secName];
        var chordName = chords[barInSection % chords.length];
        var rootFreq = this._parseNote(chordName);
        var inst = theme.instruments.bass;
        var interval = bp.intervals[idx % bp.intervals.length];
        var freq = rootFreq * Math.pow(2, (interval / 12) - (inst.octave || 0));
        var beat = 60 / theme.bpm;

        this._synthBass(freq, beat * 0.8, inst);
    },

    _tickMelody(theme, secName) {
        var melArr = theme.melody[secName];
        if (!melArr) return;
        var note = melArr[this._tickInSection % melArr.length];
        if (!note) return;

        var freq = this._parseNote(note);
        if (!freq) return;
        var inst = theme.instruments.melody;
        var beat = 60 / theme.bpm;
        this._synthMelody(freq, beat * 0.5, inst);
    },

    _tickArp(theme, secName, tickInBar, barInSection) {
        var ap = theme.arp[secName];
        if (!ap) return;
        if (tickInBar % ap.speed !== 0) return;

        var chords = theme.chords[secName];
        var chordName = chords[barInSection % chords.length];
        var rootFreq = this._parseNote(chordName);
        var inst = theme.instruments.arp;
        var step = Math.floor(tickInBar / ap.speed) % ap.pattern.length;
        var semitones = ap.pattern[step];
        var freq = rootFreq * Math.pow(2, semitones / 12);
        var beat = 60 / theme.bpm;

        this._synthNote(freq * Math.pow(2, (inst.octave || 5) - 4), beat * 0.2, inst.wave, inst.volume, inst.filterFreq);
    },

    _tickPad(theme, secName, barInSection) {
        var chords = theme.chords[secName];
        if (!chords) return;
        var chordName = chords[barInSection % chords.length];
        var root = this._parseNote(chordName);
        var inst = theme.instruments.pad;
        var beat = 60 / theme.bpm;
        var dur = beat * 3.5;

        var isMinor = chordName.indexOf('m') !== -1 && chordName.indexOf('maj') === -1;
        var third = isMinor ? 3 : 4;
        var fifth = 7;

        var oct = (inst.octave || 3) - 4;
        var mul = Math.pow(2, oct);
        this._synthNote(root * mul, dur, inst.wave, inst.volume * 0.7, inst.filterFreq);
        this._synthNote(root * mul * Math.pow(2, third / 12), dur, inst.wave, inst.volume * 0.5, inst.filterFreq);
        this._synthNote(root * mul * Math.pow(2, fifth / 12), dur, inst.wave, inst.volume * 0.5, inst.filterFreq);
    },

    // ============================================================
    // SYNTHESIS
    // ============================================================

    _parseNote(name) {
        if (!name) return 0;
        var match = name.match(/^([A-Ga-g][#b]?)m?[a-z]*(\d)/);
        if (!match) return 0;
        var note = match[1].toUpperCase();
        var oct = parseInt(match[2]);
        var flatMap = { 'BB': 'A#', 'DB': 'C#', 'EB': 'D#', 'FB': 'E', 'GB': 'F#', 'AB': 'G#' };
        if (note.endsWith('B') && note.length === 2 && note[0] !== 'B') {
            note = flatMap[note] || note;
        }
        if (name.substring(0, 2) === 'Bb' || name.substring(0, 2) === 'bb') note = 'A#';
        var key = note + oct;
        return this.NOTE[key] || 0;
    },

    _synthNote(freq, dur, wave, vol, filterFreq) {
        if (!this.audioContext || freq <= 0) return;
        wave = wave || 'square';
        vol = vol || 0.1;
        filterFreq = filterFreq || 3000;
        var ctx = this.audioContext;
        var now = ctx.currentTime;

        var osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = freq;

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        filter.Q.value = 1;

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.008);
        gain.gain.setValueAtTime(vol * 0.8, now + 0.04);
        gain.gain.linearRampToValueAtTime(0.001, now + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + dur + 0.01);
    },

    _synthBass(freq, dur, inst) {
        if (!this.audioContext || freq <= 0) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;

        var osc = ctx.createOscillator();
        osc.type = inst.wave || 'sawtooth';
        osc.frequency.value = freq;

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = inst.filterFreq || 400;
        filter.Q.value = 4;

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(inst.volume, now + 0.005);
        gain.gain.setValueAtTime(inst.volume * 0.85, now + 0.03);
        gain.gain.linearRampToValueAtTime(0.001, now + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + dur + 0.01);
    },

    _synthMelody(freq, dur, inst) {
        if (!this.audioContext || freq <= 0) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;

        var osc = ctx.createOscillator();
        osc.type = inst.wave || 'square';
        osc.frequency.value = freq;

        if (inst.vibratoRate && inst.vibratoDepth) {
            var lfo = ctx.createOscillator();
            var lfoGain = ctx.createGain();
            lfo.frequency.value = inst.vibratoRate;
            lfoGain.gain.value = inst.vibratoDepth;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            lfo.start(now);
            lfo.stop(now + dur + 0.01);
        }

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = inst.filterFreq || 2500;
        filter.Q.value = 1.5;

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(inst.volume, now + 0.01);
        gain.gain.setValueAtTime(inst.volume * 0.7, now + 0.06);
        gain.gain.linearRampToValueAtTime(0.001, now + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + dur + 0.01);
    },

    // ── DRUM SYNTHS ──

    _playKick() {
        if (!this.audioContext) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
    },

    _playSnare() {
        if (!this.audioContext) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;
        var len = Math.floor(ctx.sampleRate * 0.08);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = 3500;
        filt.Q.value = 0.8;
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        src.connect(filt);
        filt.connect(gain);
        gain.connect(this.masterGain);
        src.start(now);
        // Body thump
        var osc = ctx.createOscillator();
        var g2 = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 180;
        g2.gain.setValueAtTime(0.08, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(g2);
        g2.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.06);
    },

    _playHiHat(vol) {
        if (!this.audioContext) return;
        vol = vol || 0.06;
        var ctx = this.audioContext;
        var now = ctx.currentTime;
        var len = Math.floor(ctx.sampleRate * 0.03);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var filt = ctx.createBiquadFilter();
        filt.type = 'highpass';
        filt.frequency.value = 8000;
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        src.connect(filt);
        filt.connect(gain);
        gain.connect(this.masterGain);
        src.start(now);
    },

    _playOpenHat() {
        if (!this.audioContext) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;
        var len = Math.floor(ctx.sampleRate * 0.12);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 0.5);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var filt = ctx.createBiquadFilter();
        filt.type = 'highpass';
        filt.frequency.value = 6000;
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        src.connect(filt);
        filt.connect(gain);
        gain.connect(this.masterGain);
        src.start(now);
    },

    _playTom() {
        if (!this.audioContext) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.22);
    },

    _playClap() {
        if (!this.audioContext) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;
        for (var c = 0; c < 3; c++) {
            var t = now + c * 0.012;
            var len = Math.floor(ctx.sampleRate * 0.025);
            var buf = ctx.createBuffer(1, len, ctx.sampleRate);
            var d = buf.getChannelData(0);
            for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
            var src = ctx.createBufferSource();
            src.buffer = buf;
            var filt = ctx.createBiquadFilter();
            filt.type = 'bandpass';
            filt.frequency.value = 1200;
            filt.Q.value = 0.6;
            var gain = ctx.createGain();
            gain.gain.setValueAtTime(0.14, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            src.connect(filt);
            filt.connect(gain);
            gain.connect(this.masterGain);
            src.start(t);
        }
    },

    _playCrash() {
        if (!this.audioContext) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;
        var len = Math.floor(ctx.sampleRate * 0.5);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 0.3);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var filt = ctx.createBiquadFilter();
        filt.type = 'highpass';
        filt.frequency.value = 4000;
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        src.connect(filt);
        filt.connect(gain);
        gain.connect(this.masterGain);
        src.start(now);
    },

    // ============================================================
    // STINGERS
    // ============================================================

    playVictoryFanfare() {
        if (!this.activate()) return;
        var C = this.NOTE;
        var notes = [C['C5'], C['E5'], C['G5'], C['A5'], C['C6'], C['C6'], C['C6']];
        var delays = [0, 0.12, 0.24, 0.36, 0.5, 0.65, 0.9];
        var self = this;
        notes.forEach(function(f, i) {
            setTimeout(function() {
                self._synthNote(f, 0.35, 'sawtooth', 0.14, 3000);
                self._synthNote(f / 2, 0.35, 'triangle', 0.10, 1500);
            }, delays[i] * 1000);
        });
    },

    playCaptureImpact() {
        if (!this.activate()) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.4);
    },

    playTensionBuild() {
        if (!this.activate()) return;
        var ctx = this.audioContext;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 2);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 2);
    },

    // ============================================================
    // CONTROLS
    // ============================================================

    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.masterGain) this.masterGain.gain.value = this.volume;
    },

    setTheme(themeName) {
        var map = { 'FIBONACCI': 'DEFAULT' };
        var resolved = map[themeName] || themeName;
        if (this.themes[resolved]) {
            var wasPlaying = this.isPlaying;
            if (wasPlaying) this.stop();  // stop old song first
            this.currentTheme = resolved;
            if (wasPlaying) this.play();  // start new song
            console.log('[MusicSubstrate v2] Theme switched to:', this.themes[resolved].name);
        }
    },

    // ============================================================
    // PING API (board integration)
    // ============================================================

    ping(x, y, options) {
        options = options || {};
        if (!this.activate()) return { frequency: 0, played: false };
        if (this.audioContext.state === 'suspended') {
            var self = this;
            this.audioContext.resume().then(function() { self._playPing(x, y, options); });
            return { frequency: 0, played: false, pending: true };
        }
        return this._playPing(x, y, options);
    },

    _playPing(x, y, options) {
        options = options || {};
        var baseFreq = 110;
        var semitones = (x / 100) * 48;
        var frequency = baseFreq * Math.pow(2, semitones / 12);
        var waveType = y < 25 ? 'sine' : y < 50 ? 'triangle' : y < 75 ? 'sawtooth' : 'square';
        var oct = y < 25 ? -1 : y < 50 ? 0 : y < 75 ? 1 : 2;
        frequency *= Math.pow(2, oct);

        var dur = options.duration || 0.25;
        var vol = options.volume || 0.15;
        this._synthNote(frequency, dur, waveType, vol, 3000);
        return { frequency: frequency, waveType: waveType, played: true };
    },

    pingSequence(points, interval, options) {
        interval = interval || 200;
        options = options || {};
        var self = this;
        points.forEach(function(p, i) {
            setTimeout(function() { self.ping(p.x, p.y, options); }, i * interval);
        });
    },

    pingChord(points, options) {
        options = options || {};
        if (!this.activate()) return;
        var self = this;
        points.forEach(function(p) {
            self.ping(p.x, p.y, { duration: options.duration, volume: (options.volume || 0.15) / points.length * 2 });
        });
    },

    pingSoundCheck() {
        if (!this.activate()) return;
        var pts = [{ x: 0, y: 50 }, { x: 33, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 }];
        this.pingSequence(pts, 150, { duration: 0.25, volume: 0.2 });
    },

    holeToSubstrate(holeId) {
        if (!holeId) return { x: 50, y: 50 };
        if (holeId === 'center') return { x: 75, y: 90 };
        if (holeId.indexOf('ft-') === 0) { var i = parseInt(holeId.replace('ft-', '')); return { x: 40 + i * 10, y: 60 }; }
        if (holeId.indexOf('safe-') === 0) { var p = holeId.split('-'); return { x: 20 + parseInt(p[2]) * 15, y: 30 }; }
        if (holeId.indexOf('outer-') === 0) { var p2 = holeId.split('-'); return { x: (parseInt(p2[1]) * 16 + parseInt(p2[2]) * 4) % 100, y: 40 }; }
        if (holeId.indexOf('home-') === 0 || holeId.indexOf('hold-') === 0) { return { x: 10 + parseInt(holeId.split('-')[1]) * 15, y: 15 }; }
        return { x: 50, y: 50 };
    },

    pingHole(holeId, options) {
        var coords = this.holeToSubstrate(holeId);
        return this.ping(coords.x, coords.y, options);
    },

    // ============================================================
    // REACTION / EMOTICON SOUND EFFECTS
    // Each reaction gets a unique, theme-appropriate synth stinger
    // ============================================================

    playReactionSound(reactionName) {
        if (!this.activate()) return;
        var ctx = this.audioContext;
        if (!ctx) return;
        var now = ctx.currentTime;
        var mg = this.masterGain;
        var vol = 0.18;

        switch (reactionName) {
            case 'shock':     // 😱  descending chromatic "dun dun DUNNN"
                this._synthNote(493.88, 0.12, 'square', vol, 2500);        // B4
                setTimeout(function() { MusicSubstrate._synthNote(440, 0.12, 'square', vol, 2500); }, 130);   // A4
                setTimeout(function() { MusicSubstrate._synthNote(261.63, 0.5, 'sawtooth', vol * 1.2, 1800); }, 280); // C4 (low hit)
                break;

            case 'clap':      // 👏  bright ascending "ding ding ding!"
                this._synthNote(523.25, 0.1, 'triangle', vol * 0.8, 3000);  // C5
                setTimeout(function() { MusicSubstrate._synthNote(659.25, 0.1, 'triangle', vol * 0.8, 3000); }, 80); // E5
                setTimeout(function() { MusicSubstrate._synthNote(783.99, 0.1, 'triangle', vol * 0.9, 3000); }, 160); // G5
                setTimeout(function() { MusicSubstrate._synthNote(1046.5, 0.25, 'triangle', vol, 3500); }, 240); // C6
                break;

            case 'ouch':      // 😬  crunchy dissonant hit
                this._synthNote(185, 0.08, 'sawtooth', vol, 1200);
                this._synthNote(196, 0.08, 'sawtooth', vol * 0.8, 1200);   // close interval = dissonance
                setTimeout(function() {
                    MusicSubstrate._synthNote(130.81, 0.25, 'sawtooth', vol * 0.6, 800); // low rumble
                }, 100);
                break;

            case 'revenge':   // 😈  evil minor arpeggio ascending
                var evilNotes = [220, 261.63, 329.63, 440];  // A3, C4, E4, A4 (Am)
                evilNotes.forEach(function(f, i) {
                    setTimeout(function() {
                        MusicSubstrate._synthNote(f, 0.15, 'sawtooth', vol * 0.9, 2000);
                    }, i * 70);
                });
                setTimeout(function() {
                    MusicSubstrate._synthNote(220, 0.3, 'square', vol * 0.5, 1000);  // deep bass hit
                }, 300);
                break;

            case 'fire':      // 🔥  rapid ascending blaze
                var fireNotes = [329.63, 392, 493.88, 587.33, 659.25, 783.99]; // E4-G4-B4-D5-E5-G5
                fireNotes.forEach(function(f, i) {
                    setTimeout(function() {
                        MusicSubstrate._synthNote(f, 0.08, 'square', vol * (0.6 + i * 0.08), 3000 + i * 200);
                    }, i * 40);
                });
                break;

            case 'cry':       // 😭  descending sad slide
                (function() {
                    var osc = ctx.createOscillator();
                    var gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(523.25, now);     // C5
                    osc.frequency.exponentialRampToValueAtTime(220, now + 0.6); // slide down to A3
                    gain.gain.setValueAtTime(vol * 0.7, now);
                    gain.gain.linearRampToValueAtTime(0.001, now + 0.7);
                    osc.connect(gain); gain.connect(mg);
                    osc.start(now); osc.stop(now + 0.75);
                })();
                // Wobble vibrato for "crying" feel
                setTimeout(function() {
                    var osc2 = ctx.createOscillator();
                    var g2 = ctx.createGain();
                    var lfo = ctx.createOscillator();
                    var lfoG = ctx.createGain();
                    osc2.type = 'triangle';
                    osc2.frequency.value = 196;  // G3
                    lfo.frequency.value = 8;     // fast vibrato
                    lfoG.gain.value = 15;
                    lfo.connect(lfoG); lfoG.connect(osc2.frequency);
                    g2.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
                    g2.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                    osc2.connect(g2); g2.connect(mg);
                    osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.55);
                    lfo.start(ctx.currentTime); lfo.stop(ctx.currentTime + 0.55);
                }, 300);
                break;

            case 'celebrate': // 🎉  victory jingle — bright major fanfare
                var partyNotes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
                partyNotes.forEach(function(f, i) {
                    setTimeout(function() {
                        MusicSubstrate._synthNote(f, 0.2, 'square', vol * 0.9, 3500);
                        MusicSubstrate._synthNote(f * 0.5, 0.2, 'triangle', vol * 0.4, 1500); // octave below
                    }, i * 90);
                });
                // Final shimmer
                setTimeout(function() {
                    MusicSubstrate._synthNote(1046.5, 0.4, 'triangle', vol * 0.6, 4000);
                    MusicSubstrate._synthNote(1318.5, 0.4, 'triangle', vol * 0.4, 4000);
                }, 400);
                break;

            case 'dead':      // 💀  low doom — descending power chord
                this._synthNote(110, 0.5, 'sawtooth', vol * 1.1, 600);    // A2
                this._synthNote(130.81, 0.5, 'sawtooth', vol * 0.7, 600); // C3 (minor third)
                this._synthNote(164.81, 0.5, 'sawtooth', vol * 0.6, 600); // E3
                // Thump
                (function() {
                    var osc = ctx.createOscillator();
                    var gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(80, now);
                    osc.frequency.exponentialRampToValueAtTime(25, now + 0.3);
                    gain.gain.setValueAtTime(0.3, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                    osc.connect(gain); gain.connect(mg);
                    osc.start(now); osc.stop(now + 0.4);
                })();
                break;

            case 'boo':       // 👻  spooky wobble
                (function() {
                    var osc = ctx.createOscillator();
                    var gain = ctx.createGain();
                    var lfo = ctx.createOscillator();
                    var lfoGain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(350, now);
                    osc.frequency.exponentialRampToValueAtTime(200, now + 0.6);
                    lfo.frequency.value = 6;
                    lfoGain.gain.value = 30;   // wide wobble
                    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
                    gain.gain.setValueAtTime(vol * 0.8, now);
                    gain.gain.linearRampToValueAtTime(0.001, now + 0.7);
                    osc.connect(gain); gain.connect(mg);
                    osc.start(now); osc.stop(now + 0.75);
                    lfo.start(now); lfo.stop(now + 0.75);
                })();
                // Echo ghost note
                setTimeout(function() {
                    MusicSubstrate._synthNote(250, 0.35, 'sine', vol * 0.3, 1000);
                }, 400);
                break;

            default:
                // Generic blip for unknown reactions
                this._synthNote(440, 0.15, 'square', vol * 0.6, 2500);
                break;
        }
    }
};

MusicSubstrate.init();
if (typeof window !== 'undefined') window.MusicSubstrate = MusicSubstrate;

console.log('[MusicSubstrate v2] Structured Game Music Engine loaded');
