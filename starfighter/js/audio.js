/**
 * SFAudio — Starfighter Web Audio Engine (pure Web Audio API, zero deps)
 * API: SFAudio.init(), .playSound(name), .setThrottle(0-1),
 *      .startEngine(), .stopEngine(), .setMusicVol(0-1), .setSfxVol(0-1),
 *      .startMusic(), .setCombatLevel(0-1)
 */
const SFAudio = (() => {
    let ctx = null, masterGain, musicGain, sfxGain;
    let engineOscs = null, engineGainNode = null;
    let musicNodes = [], _combatLevel = 0;
    let _musicVol = parseFloat(localStorage.getItem('sf_music_vol') ?? 0.35);
    let _sfxVol   = parseFloat(localStorage.getItem('sf_sfx_vol')  ?? 0.75);

    function _ctx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain(); masterGain.gain.value = 1; masterGain.connect(ctx.destination);
            sfxGain    = ctx.createGain(); sfxGain.gain.value    = _sfxVol;   sfxGain.connect(masterGain);
            musicGain  = ctx.createGain(); musicGain.gain.value  = _musicVol; musicGain.connect(masterGain);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function _osc(type, freq) { const o = _ctx().createOscillator(); o.type = type; o.frequency.value = freq; return o; }
    function _g(v, dest) { const g = _ctx().createGain(); g.gain.value = v; g.connect(dest || sfxGain); return g; }
    function _flt(type, freq, dest) { const f = _ctx().createBiquadFilter(); f.type = type; f.frequency.value = freq; f.connect(dest || sfxGain); return f; }
    function _noise(dur) {
        const c = _ctx(), sr = c.sampleRate, buf = c.createBuffer(1, sr * (dur + 0.1), sr);
        const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const n = c.createBufferSource(); n.buffer = buf; return n;
    }

    // ── Engine hum ──
    function startEngine() {
        if (engineOscs) return;
        const c = _ctx(), eg = _g(0.12, sfxGain);
        const flt = _flt('lowpass', 400, eg); flt.connect(eg);
        const o1 = _osc('sawtooth', 55), o2 = _osc('triangle', 110);
        o1.connect(flt); o2.connect(flt); o1.start(); o2.start();
        engineOscs = [o1, o2]; engineGainNode = eg;
    }
    function stopEngine() {
        if (!engineOscs) return;
        engineGainNode.gain.setTargetAtTime(0, _ctx().currentTime, 0.3);
        setTimeout(() => { engineOscs.forEach(o => { try { o.stop(); } catch(e){} }); engineOscs = null; }, 600);
    }
    function setThrottle(t) {
        if (!engineOscs) return;
        const c = _ctx(), now = c.currentTime, base = 55 + t * 90;
        engineOscs[0].frequency.setTargetAtTime(base,     now, 0.1);
        engineOscs[1].frequency.setTargetAtTime(base * 2, now, 0.1);
        engineGainNode.gain.setTargetAtTime(0.07 + t * 0.18, now, 0.05);
    }

    // ── Ambient/combat music ──
    function startMusic() {
        const c = _ctx(), t = c.currentTime;
        stopMusic();
        const freqs = [55, 82, 110, 138, 165];
        freqs.forEach((f, i) => {
            const g = _g(0, musicGain);
            const o = _osc('sine', f);
            const lfo = _osc('sine', 0.08 + i * 0.04); lfo.start(t);
            const lg = _g(f * 0.15, g); lfo.connect(lg); lg.connect(o.frequency);
            o.connect(g); o.start(t);
            g.gain.setTargetAtTime(0.04 + i * 0.01, t, 2.0);
            musicNodes.push(o, lfo, g, lg);
        });
    }
    function stopMusic() {
        musicNodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch(e){} });
        musicNodes = [];
    }
    function setCombatLevel(v) {
        _combatLevel = Math.max(0, Math.min(1, v));
        if (!musicGain) return;
        musicGain.gain.setTargetAtTime(_musicVol * (0.5 + _combatLevel * 0.5), _ctx().currentTime, 0.5);
    }

    // ── All weapon & event sounds ──
    const SOUNDS = {
        laser() {
            const c = _ctx(), t = c.currentTime, g = _g(0);
            const o = _osc('sawtooth', 880); o.connect(g);
            g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
            o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.13);
            o.start(t); o.stop(t + 0.15);
        },
        gun() {
            const c = _ctx(), t = c.currentTime;
            const g = _g(0); const flt = _flt('bandpass', 1400, g); flt.connect(g);
            const n = _noise(0.07); n.connect(flt);
            g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
            n.start(t); n.stop(t + 0.09);
        },
        pulse() {
            const c = _ctx(), t = c.currentTime, g = _g(0);
            const o1 = _osc('sine', 60), o2 = _osc('sine', 38);
            o1.connect(g); o2.connect(g);
            g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
            o1.frequency.exponentialRampToValueAtTime(15, t + 1.4);
            o2.frequency.exponentialRampToValueAtTime(8,  t + 1.4);
            o1.start(t); o2.start(t); o1.stop(t + 1.5); o2.stop(t + 1.5);
        },
        torpedoLaunch() {
            const c = _ctx(), t = c.currentTime, g = _g(0);
            const o = _osc('sawtooth', 120); o.connect(g);
            g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.45);
            o.start(t); o.stop(t + 0.5);
        },
        torpedoHit() { // Shockwave rumble in cockpit
            const c = _ctx(), t = c.currentTime;
            const g1 = _g(0), g2 = _g(0);
            const flt1 = _flt('lowpass', 100, g1), flt2 = _flt('bandpass', 55, g2);
            flt1.connect(g1); flt2.connect(g2);
            const n1 = _noise(3), n2 = _noise(3); n1.connect(flt1); n2.connect(flt2);
            const sub = _osc('sine', 25); sub.connect(g1);
            g1.gain.setValueAtTime(0.001, t); g1.gain.linearRampToValueAtTime(1.0, t + 0.06);
            g1.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
            g2.gain.setValueAtTime(0.8, t + 0.06); g2.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
            sub.start(t); sub.stop(t + 3.5); n1.start(t); n1.stop(t + 3.5); n2.start(t + 0.06); n2.stop(t + 3.0);
        },
        shieldHit() {
            const c = _ctx(), t = c.currentTime, g = _g(0.3);
            const o1 = _osc('sine', 660), o2 = _osc('triangle', 440);
            o1.connect(g); o2.connect(g);
            g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
            o1.start(t); o2.start(t); o1.stop(t + 0.6); o2.stop(t + 0.6);
        },
        hullHit() {
            const c = _ctx(), t = c.currentTime, g = _g(0);
            const flt = _flt('lowpass', 700, g); flt.connect(g);
            const n = _noise(0.3); n.connect(flt);
            g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            n.start(t); n.stop(t + 0.35);
        },
        explosion() {
            const c = _ctx(), t = c.currentTime, g = _g(0);
            const flt = _flt('lowpass', 900, g); flt.connect(g);
            const n = _noise(1.8); n.connect(flt);
            g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.75, t + 0.025);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
            n.start(t); n.stop(t + 1.8);
        },
        warning() {
            const c = _ctx(), t = c.currentTime;
            [0, 0.28, 0.56].forEach(dt => {
                const g = _g(0); const o = _osc('square', 900); o.connect(g);
                g.gain.setValueAtTime(0.22, t + dt); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.16);
                o.start(t + dt); o.stop(t + dt + 0.18);
            });
        },
        fuelLow() {
            const c = _ctx(), t = c.currentTime;
            [0, 0.45].forEach(dt => {
                const g = _g(0); const o = _osc('square', 440); o.connect(g);
                g.gain.setValueAtTime(0.16, t + dt); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.22);
                o.start(t + dt); o.stop(t + dt + 0.24);
            });
        },
        lockOn() {
            const c = _ctx(), t = c.currentTime, g = _g(0);
            const o = _osc('sine', 1300); o.connect(g);
            g.gain.setValueAtTime(0.15, t); g.gain.setValueAtTime(0, t + 0.06);
            g.gain.setValueAtTime(0.15, t + 0.12); g.gain.setValueAtTime(0, t + 0.18);
            o.start(t); o.stop(t + 0.2);
        },
        dock() {
            const c = _ctx(), t = c.currentTime;
            [440, 550, 660, 880].forEach((f, i) => {
                const g = _g(0); const o = _osc('sine', f); o.connect(g);
                g.gain.setValueAtTime(0.2, t + i * 0.14); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.14 + 0.12);
                o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.14);
            });
        },
        disabled() { // Player hit by pulse EMP
            const c = _ctx(), t = c.currentTime, g = _g(0);
            const o = _osc('sawtooth', 280); o.connect(g);
            g.gain.setValueAtTime(0.35, t); g.gain.linearRampToValueAtTime(0, t + 2.2);
            o.frequency.linearRampToValueAtTime(18, t + 2.2);
            o.start(t); o.stop(t + 2.3);
        },
        respawn() {
            const c = _ctx(), t = c.currentTime;
            [220, 330, 440, 660].forEach((f, i) => {
                const g = _g(0); const o = _osc('triangle', f); o.connect(g);
                g.gain.setValueAtTime(0.18, t + i * 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.15);
                o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.18);
            });
        }
    };

    return {
        init() { _ctx(); startMusic(); },
        playSound(name) { if (SOUNDS[name]) SOUNDS[name](); },
        startEngine, stopEngine, setThrottle,
        startMusic, stopMusic, setCombatLevel,
        setMusicVol(v) { _musicVol = v; localStorage.setItem('sf_music_vol', v); if (musicGain) musicGain.gain.setTargetAtTime(v, _ctx().currentTime, 0.2); },
        setSfxVol(v)   { _sfxVol   = v; localStorage.setItem('sf_sfx_vol',   v); if (sfxGain)   sfxGain.gain.setTargetAtTime(v,   _ctx().currentTime, 0.2); },
        getMusicVol() { return _musicVol; },
        getSfxVol()   { return _sfxVol;   },
        resume() { _ctx(); }
    };
})();
