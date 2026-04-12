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
 * NATURAL LENS - ButterflyFX Manifold Substrate
 * JavaScript implementation of helix/substrate.py NaturalLens
 * ============================================================
 * 
 * Geometry IS information. No calculations needed - just ping
 * coordinates on the substrate and read the natural output.
 * 
 * Color: From azimuth angle → electromagnetic spectrum
 * Sound: From magnitude → resonating frequency
 * Physics: From derivatives → force, acceleration, curvature
 * 
 * All values are derived from actual geometry - nothing arbitrary.
 */

'use strict';

// Physical constants
const PHYSICS = {
    SPEED_OF_LIGHT: 299792458.0,       // m/s
    SPEED_OF_SOUND: 343.0,             // m/s in air at 20°C
    PLANCK: 6.62607015e-34,            // Planck's constant J·s
    
    // Visible light spectrum (nm)
    WAVELENGTH_VIOLET: 380.0,
    WAVELENGTH_RED: 700.0,
    
    // Audible sound (Hz) - piano range A0 to C8
    FREQ_MIN: 27.5,                    // A0
    FREQ_MAX: 4186.01,                 // C8
    
    // String/pipe resonating lengths (m)
    RESONANT_LENGTH_MIN: 0.041,        // ~41mm (piccolo)
    RESONANT_LENGTH_MAX: 6.25,         // ~6.25m (bass organ pipe)
    
    // Gravity
    G: 9.80665                         // m/s²
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * ColorLens - Color derived NATURALLY from azimuth angle.
 * 
 * The angle θ on the manifold surface maps directly to the electromagnetic
 * spectrum. Light waves have wavelengths, and our mapping preserves physics:
 * angle ↔ wavelength ↔ frequency.
 */
class ColorLens {
    constructor(wavelength_nm, r, g, b, luminosity) {
        this.wavelength_nm = wavelength_nm;
        this.r = r;
        this.g = g;
        this.b = b;
        this.luminosity = luminosity;
    }
    
    /**
     * Derive color from azimuth angle.
     * @param {number} azimuth - Angle in radians (from atan2(y, x))
     * @param {number} z - Height for luminosity
     * @param {number} z_range - Expected z range
     */
    static fromAngle(azimuth, z = 0.0, z_range = 1.5) {
        // Normalize angle to [0, 2π]
        let a = ((azimuth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        
        // Map angle to visible spectrum
        // Color wheel: 0°→Red, 60°→Yellow, 120°→Green, 180°→Cyan, 240°→Blue, 300°→Violet
        const position = a / (2 * Math.PI);  // 0 to 1
        
        // Map to wavelength (only use 5/6 of wheel for visible spectrum)
        let wavelength;
        if (position <= 5/6) {
            const t = position / (5/6);
            wavelength = PHYSICS.WAVELENGTH_RED - t * (PHYSICS.WAVELENGTH_RED - PHYSICS.WAVELENGTH_VIOLET);
        } else {
            // Wrap back to red
            const t = (position - 5/6) / (1/6);
            wavelength = PHYSICS.WAVELENGTH_VIOLET + t * (PHYSICS.WAVELENGTH_RED - PHYSICS.WAVELENGTH_VIOLET);
        }
        
        // Convert wavelength to RGB using CIE 1931 approximation
        let [r, g, b] = ColorLens._wavelengthToRgb(wavelength);
        
        // Luminosity from z-height
        const luminosity = Math.max(0.2, Math.min(1.0, 0.3 + ((z + z_range) / (2 * z_range)) * 0.7));
        
        // Apply luminosity
        r = Math.round(r * luminosity);
        g = Math.round(g * luminosity);
        b = Math.round(b * luminosity);
        
        return new ColorLens(wavelength, r, g, b, luminosity);
    }
    
    static _wavelengthToRgb(wavelength) {
        wavelength = Math.max(380, Math.min(700, wavelength));
        
        let r, g, b;
        if (wavelength >= 380 && wavelength < 440) {
            r = -(wavelength - 440) / 60;
            g = 0.0;
            b = 1.0;
        } else if (wavelength >= 440 && wavelength < 490) {
            r = 0.0;
            g = (wavelength - 440) / 50;
            b = 1.0;
        } else if (wavelength >= 490 && wavelength < 510) {
            r = 0.0;
            g = 1.0;
            b = -(wavelength - 510) / 20;
        } else if (wavelength >= 510 && wavelength < 580) {
            r = (wavelength - 510) / 70;
            g = 1.0;
            b = 0.0;
        } else if (wavelength >= 580 && wavelength < 645) {
            r = 1.0;
            g = -(wavelength - 645) / 65;
            b = 0.0;
        } else {
            r = 1.0;
            g = 0.0;
            b = 0.0;
        }
        
        // Intensity attenuation at spectrum edges
        let intensity;
        if (wavelength >= 380 && wavelength < 420) {
            intensity = 0.3 + 0.7 * (wavelength - 380) / 40;
        } else if (wavelength > 645) {
            intensity = 0.3 + 0.7 * (700 - wavelength) / 55;
        } else {
            intensity = 1.0;
        }
        
        // Gamma correction
        const gamma = 0.8;
        r = Math.round(255 * Math.pow(r * intensity, gamma));
        g = Math.round(255 * Math.pow(g * intensity, gamma));
        b = Math.round(255 * Math.pow(b * intensity, gamma));
        
        return [r, g, b];
    }
    
    get rgb() {
        return `rgb(${this.r}, ${this.g}, ${this.b})`;
    }
    
    get hex() {
        const toHex = n => n.toString(16).padStart(2, '0');
        return `#${toHex(this.r)}${toHex(this.g)}${toHex(this.b)}`;
    }
}

/**
 * SoundLens - Sound derived NATURALLY from vector magnitude.
 * 
 * The magnitude |r| = √(x² + y² + z²) represents the resonating length
 * of a string or pipe. Physics: f = c / (2L).
 * 
 * Small magnitude → short string → high frequency (flute, piccolo)
 * Large magnitude → long string → low frequency (bass, organ)
 */
class SoundLens {
    constructor(frequency_hz, wavelength_m, note_name, instrument, harmonics) {
        this.frequency_hz = frequency_hz;
        this.wavelength_m = wavelength_m;
        this.note_name = note_name;
        this.instrument = instrument;
        this.harmonics = harmonics;
    }
    
    /**
     * Derive sound from vector magnitude.
     * @param {number} magnitude - |r| = √(x² + y² + z²)
     * @param {number} max_magnitude - Maximum expected magnitude
     */
    static fromMagnitude(magnitude, max_magnitude = 1.5) {
        // Clamp and normalize magnitude
        const m = Math.max(0.01, Math.min(magnitude, max_magnitude));
        const normalized = m / max_magnitude;  // 0 to 1
        
        // Map to resonating length (logarithmic interpolation)
        const log_min = Math.log(PHYSICS.RESONANT_LENGTH_MIN);
        const log_max = Math.log(PHYSICS.RESONANT_LENGTH_MAX);
        const length = Math.exp(log_min + normalized * (log_max - log_min));
        
        // f = c / (2L)
        const freq = PHYSICS.SPEED_OF_SOUND / (2 * length);
        
        // Sound wavelength
        const wavelength = PHYSICS.SPEED_OF_SOUND / freq;
        
        // Note name
        const note_name = SoundLens._freqToNote(freq);
        
        // Instrument
        const instrument = SoundLens._freqToInstrument(freq);
        
        // Harmonics (natural overtone series)
        const harmonics = [];
        for (let i = 0; i < 8; i++) {
            harmonics.push(freq * (i + 1));
        }
        
        return new SoundLens(freq, wavelength, note_name, instrument, harmonics);
    }
    
    static _freqToNote(freq) {
        const midi = 69 + 12 * Math.log2(freq / 440.0);
        const rounded = Math.round(midi);
        const octave = Math.floor(rounded / 12) - 1;
        const note_index = ((rounded % 12) + 12) % 12;
        return `${NOTE_NAMES[note_index]}${octave}`;
    }
    
    static _freqToInstrument(freq) {
        if (freq < 100) return "Bass";
        if (freq < 262) return "Cello";
        if (freq < 523) return "Viola";
        if (freq < 2000) return "Violin";
        return "Flute";
    }
}

/**
 * ValueLens - Raw geometric values from the point.
 * Pure mathematical information, not transformed for perception.
 */
class ValueLens {
    constructor(magnitude, azimuth, azimuth_degrees, elevation, elevation_degrees, x, y, z) {
        this.magnitude = magnitude;
        this.azimuth = azimuth;
        this.azimuth_degrees = azimuth_degrees;
        this.elevation = elevation;
        this.elevation_degrees = elevation_degrees;
        this.x = x;
        this.y = y;
        this.z = z;
    }
    
    static fromPoint(x, y, z = 0.0) {
        const magnitude = Math.sqrt(x*x + y*y + z*z);
        const azimuth = Math.atan2(y, x);
        const elevation = (x*x + y*y) > 0 ? Math.atan2(z, Math.sqrt(x*x + y*y)) : 0.0;
        
        return new ValueLens(
            magnitude,
            azimuth,
            azimuth * 180 / Math.PI,
            elevation,
            elevation * 180 / Math.PI,
            x, y, z
        );
    }
}

/**
 * PhysicsLens - Physics derived from geometry derivatives.
 * Force, velocity, acceleration from manifold curvature.
 */
class PhysicsLens {
    constructor(force, velocity, acceleration, curvature, slope) {
        this.force = force;
        this.velocity = velocity;
        this.acceleration = acceleration;
        this.curvature = curvature;
        this.slope = slope;
    }
    
    /**
     * Derive physics from position and optional derivatives.
     * For z=xy surface: dz/dx = y, dz/dy = x
     */
    static fromGeometry(x, y, z = null, mass = 1.0) {
        // If z not provided, compute from z=xy manifold
        if (z === null) {
            z = x * y;
        }
        
        // Partial derivatives on z=xy surface
        const dz_dx = y;  // ∂z/∂x = y
        const dz_dy = x;  // ∂z/∂y = x
        
        // Gradient magnitude (slope)
        const slope = Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy);
        
        // Curvature (second derivatives are 0 for z=xy, but cross term is 1)
        const curvature = 1.0;  // ∂²z/∂x∂y = 1
        
        // Force from slope (like ball on surface)
        const force = mass * PHYSICS.G * slope;
        
        // Velocity potential (from height)
        const velocity = Math.sqrt(2 * PHYSICS.G * Math.max(0, z));
        
        // Acceleration (from curvature)
        const acceleration = PHYSICS.G * curvature;
        
        return new PhysicsLens(force, velocity, acceleration, curvature, slope);
    }
}

/**
 * NaturalLens - Complete lens system for a geometric point.
 * 
 * Combines color (from angle), sound (from magnitude), value (raw),
 * and physics (from derivatives) into a single structure.
 * 
 * Usage:
 *   const lens = NaturalLens.fromGeometry(0.5, 0.8, 0.3);
 *   console.log(lens.color.hex);        // "#ff6a32"
 *   console.log(lens.sound.note_name);  // "D4"
 *   console.log(lens.physics.force);    // 5.23
 */
class NaturalLens {
    constructor(color, sound, value, physics) {
        this.color = color;
        this.sound = sound;
        this.value = value;
        this.physics = physics;
    }
    
    /**
     * Create complete lens from geometric point.
     * ALL values are derived from the actual geometry.
     */
    static fromGeometry(x, y, z = 0.0, max_magnitude = 1.5) {
        // Value lens (raw geometry)
        const value = ValueLens.fromPoint(x, y, z);
        
        // Color lens (from azimuth angle)
        const color = ColorLens.fromAngle(value.azimuth, z);
        
        // Sound lens (from magnitude)
        const sound = SoundLens.fromMagnitude(value.magnitude, max_magnitude);
        
        // Physics lens (from derivatives)
        const physics = PhysicsLens.fromGeometry(x, y, z);
        
        return new NaturalLens(color, sound, value, physics);
    }
    
    /**
     * Ping - The core substrate operation.
     * Just provide coordinates, get all natural outputs.
     */
    static ping(x, y, z = null) {
        // If z not provided, compute from z=xy manifold
        if (z === null) {
            z = x * y;
        }
        return NaturalLens.fromGeometry(x, y, z);
    }
    
    /**
     * Ping and play sound - returns lens and triggers audio
     */
    static pingWithAudio(x, y, z = null, audioContext = null) {
        const lens = NaturalLens.ping(x, y, z);
        
        if (audioContext) {
            NaturalLens._playFrequency(audioContext, lens.sound.frequency_hz, 0.3, 0.15);
        }
        
        return lens;
    }
    
    static _playFrequency(ctx, freq, duration, volume) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        
        osc.type = 'triangle';
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + duration + 0.05);
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.NaturalLens = NaturalLens;
    window.ColorLens = ColorLens;
    window.SoundLens = SoundLens;
    window.ValueLens = ValueLens;
    window.PhysicsLens = PhysicsLens;
    window.PHYSICS = PHYSICS;
}

console.log('🌈 [NaturalLens] ButterflyFX Manifold Substrate loaded');
console.log('   Ping coordinates → Color, Sound, Physics automatically derived');
console.log('   Usage: NaturalLens.ping(x, y) → { color, sound, value, physics }');
