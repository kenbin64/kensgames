/**
 * FAST TRACK LOBBY — Pool Hall Atmosphere
 * Ragtime piano music (Web Audio API) + 3D pool hall canvas scene
 */
'use strict';

const Speakeasy = (() => {
  // ═══════════════════════════════════════════════════════════
  // RAGTIME PIANO — Web Audio API synthesis
  // ═══════════════════════════════════════════════════════════
  let ctx = null;
  let masterGain = null;
  let playing = false;
  let schedulerTimer = null;
  let currentBeat = 0;
  let nextNoteTime = 0;
  const TEMPO = 132; // BPM — classic ragtime
  const BEAT = 60 / TEMPO;
  const SWING = 0.12; // swing feel

  // Ragtime note frequencies (Hz) — C major pentatonic + chromatic passing tones
  const NOTES = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392.00,
    Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
    C5: 523.25, D5: 587.33, Eb5: 622.25, E5: 659.26, F5: 698.46, G5: 783.99, A5: 880.00,
    C2: 65.41, E2: 82.41, G2: 98.00, A2: 110.00, F2: 87.31, D2: 73.42, B2: 123.47
  };

  // ── Song sections: classic ragtime A-A-B-B-A-C-C-A structure ──

  // Left hand: stride bass patterns (root-chord-root-chord per measure)
  // Each entry: [bassNote, chordNotes[], bassNote2, chordNotes2[]]
  const STRIDE_A = [
    ['C2', ['E3', 'G3', 'C4'], 'G2', ['E3', 'G3', 'C4']],
    ['C2', ['E3', 'G3', 'C4'], 'G2', ['E3', 'G3', 'C4']],
    ['F2', ['A3', 'C4', 'F4'], 'C2', ['A3', 'C4', 'F4']],
    ['F2', ['A3', 'C4', 'F4'], 'C2', ['A3', 'C4', 'F4']],
    ['G2', ['B3', 'D4', 'G4'], 'D2', ['B3', 'D4', 'G4']],
    ['G2', ['B3', 'D4', 'F4'], 'D2', ['B3', 'D4', 'F4']],
    ['C2', ['E3', 'G3', 'C4'], 'G2', ['E3', 'G3', 'C4']],
    ['C2', ['E3', 'G3', 'C4'], 'G2', ['E3', 'G3', 'C4']],
  ];

  const STRIDE_B = [
    ['F2', ['A3', 'C4', 'F4'], 'C2', ['A3', 'C4', 'F4']],
    ['F2', ['A3', 'C4', 'F4'], 'C2', ['A3', 'C4', 'F4']],
    ['G2', ['B3', 'D4', 'G4'], 'D2', ['B3', 'D4', 'G4']],
    ['G2', ['B3', 'D4', 'F4'], 'D2', ['B3', 'D4', 'F4']],
    ['A2', ['C4', 'E4', 'A4'], 'E2', ['C4', 'E4', 'A4']],
    ['A2', ['C4', 'E4', 'A4'], 'E2', ['C4', 'E4']],
    ['G2', ['B3', 'D4', 'G4'], 'D2', ['B3', 'D4']],
    ['C2', ['E3', 'G3', 'C4'], 'G2', ['E3', 'G3', 'C4']],
  ];

  const STRIDE_C = [
    ['F2', ['A3', 'C4', 'F4'], 'C2', ['A3', 'C4']],
    ['D2', ['F3', 'A3', 'D4'], 'A2', ['F3', 'A3', 'D4']],
    ['G2', ['B3', 'D4', 'G4'], 'D2', ['B3', 'D4']],
    ['C2', ['E3', 'G3', 'C4'], 'G2', ['E3', 'G3']],
    ['F2', ['A3', 'C4', 'F4'], 'C2', ['A3', 'C4', 'F4']],
    ['G2', ['B3', 'D4', 'F4'], 'D2', ['B3', 'D4', 'F4']],
    ['C2', ['E3', 'G3', 'C4'], 'E2', ['G3', 'C4', 'E4']],
    ['C2', ['E3', 'G3', 'C4'], 'G2', ['E3', 'G3', 'C4']],
  ];

  // Right hand: ragtime melody fragments (per measure, 8th note subdivisions)
  // null = rest, string = note name
  const MELODY_A = [
    ['C5', null, 'E5', 'C5', 'D5', null, 'E5', null],
    ['G5', null, 'E5', 'C5', 'D5', null, 'C5', null],
    ['A4', null, 'C5', 'A4', 'F4', null, 'A4', null],
    ['G4', null, 'A4', 'C5', 'A4', null, 'G4', null],
    ['G4', null, 'B4', 'D5', 'G5', null, 'F5', null],
    ['E5', null, 'D5', 'B4', 'A4', null, 'G4', null],
    ['C5', null, 'E5', 'G5', 'E5', null, 'C5', null],
    ['D5', null, 'E5', 'C5', 'C5', null, null, null],
  ];

  const MELODY_B = [
    ['F5', null, 'E5', 'F5', 'A5', null, 'F5', null],
    ['E5', null, 'C5', 'A4', 'C5', null, 'F4', null],
    ['G4', null, 'B4', 'D5', 'F5', null, 'D5', null],
    ['B4', null, 'G4', 'D4', 'F4', null, 'G4', null],
    ['A4', null, 'C5', 'E5', 'A5', null, 'G5', null],
    ['E5', null, 'C5', 'A4', 'C5', null, 'E5', null],
    ['D5', null, 'G4', 'B4', 'D5', null, 'G5', null],
    ['E5', null, 'C5', 'G4', 'C5', null, null, null],
  ];

  const MELODY_C = [
    ['F5', null, 'A5', 'F5', 'C5', null, 'A4', null],
    ['D5', null, 'F5', 'A5', 'F5', null, 'D5', null],
    ['G4', null, 'B4', 'D5', 'G5', null, 'F5', null],
    ['E5', null, 'G5', 'E5', 'C5', null, 'G4', null],
    ['A4', null, 'C5', 'F5', 'A5', null, 'F5', null],
    ['G4', null, 'B4', 'D5', 'F5', null, 'D5', null],
    ['C5', null, 'E5', 'G5', 'C5', null, 'E5', null],
    ['C5', null, null, null, 'C5', null, null, null],
  ];

  // Song form — classic ragtime: Intro AA BB A CC A
  const FORM = [
    { stride: STRIDE_A, melody: MELODY_A },
    { stride: STRIDE_A, melody: MELODY_A },
    { stride: STRIDE_B, melody: MELODY_B },
    { stride: STRIDE_B, melody: MELODY_B },
    { stride: STRIDE_A, melody: MELODY_A },
    { stride: STRIDE_C, melody: MELODY_C },
    { stride: STRIDE_C, melody: MELODY_C },
    { stride: STRIDE_A, melody: MELODY_A },
  ];

  let sectionIdx = 0;
  let measureIdx = 0;
  let eighthIdx = 0;

  function initAudio() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(ctx.destination);
  }

  // Piano-like tone: fundamental + harmonics with fast decay
  function playPianoNote(freq, time, duration, velocity = 0.5) {
    if (!ctx) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const gain = ctx.createGain();

    // Fundamental + partials for richness
    osc1.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    osc3.type = 'sine';
    osc3.frequency.value = freq * 3;

    const mix1 = ctx.createGain();
    const mix2 = ctx.createGain();
    const mix3 = ctx.createGain();
    mix1.gain.value = velocity * 0.6;
    mix2.gain.value = velocity * 0.25;
    mix3.gain.value = velocity * 0.08;

    osc1.connect(mix1); mix1.connect(gain);
    osc2.connect(mix2); mix2.connect(gain);
    osc3.connect(mix3); mix3.connect(gain);

    // Piano envelope: sharp attack, fast initial decay, slow release
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(velocity, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(velocity * 0.4, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    gain.connect(masterGain);

    osc1.start(time);
    osc2.start(time);
    osc3.start(time);
    osc1.stop(time + duration);
    osc2.stop(time + duration);
    osc3.stop(time + duration);
  }

  function playChord(noteNames, time, duration, velocity = 0.3) {
    for (const n of noteNames) {
      if (NOTES[n]) playPianoNote(NOTES[n], time, duration, velocity);
    }
  }

  function scheduleNotes() {
    while (nextNoteTime < ctx.currentTime + 0.15) {
      const section = FORM[sectionIdx];
      const stride = section.stride[measureIdx];
      const melody = section.melody[measureIdx];

      const swingOffset = (eighthIdx % 2 === 1) ? SWING * BEAT : 0;
      const t = nextNoteTime + swingOffset;

      // Left hand stride: bass on 1,3 — chord on 2,4
      if (eighthIdx === 0) {
        // beat 1: bass
        playPianoNote(NOTES[stride[0]], t, BEAT * 0.9, 0.45);
      } else if (eighthIdx === 2) {
        // beat 2: chord
        playChord(stride[1], t, BEAT * 0.8, 0.2);
      } else if (eighthIdx === 4) {
        // beat 3: bass 2
        playPianoNote(NOTES[stride[2]], t, BEAT * 0.9, 0.4);
      } else if (eighthIdx === 6) {
        // beat 4: chord 2
        playChord(stride[3], t, BEAT * 0.8, 0.2);
      }

      // Right hand melody: 8th note subdivisions
      const note = melody[eighthIdx];
      if (note && NOTES[note]) {
        const vel = 0.35 + Math.random() * 0.15; // humanize
        playPianoNote(NOTES[note], t, BEAT * 0.45, vel);
      }

      // Advance 8th note
      nextNoteTime += BEAT / 2;
      eighthIdx++;
      if (eighthIdx >= 8) {
        eighthIdx = 0;
        measureIdx++;
        if (measureIdx >= 8) {
          measureIdx = 0;
          sectionIdx = (sectionIdx + 1) % FORM.length;
        }
      }
    }
  }

  function startMusic() {
    if (playing) return;
    initAudio();
    if (ctx.state === 'suspended') ctx.resume();
    playing = true;
    sectionIdx = 0;
    measureIdx = 0;
    eighthIdx = 0;
    nextNoteTime = ctx.currentTime + 0.05;
    schedulerTimer = setInterval(scheduleNotes, 50);
    updateToggleUI();
  }

  function stopMusic() {
    playing = false;
    if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
    updateToggleUI();
  }

  function toggleMusic() {
    if (playing) stopMusic(); else startMusic();
    try { localStorage.setItem('ft_lobby_music', playing ? '1' : '0'); } catch (e) { }
  }

  function updateToggleUI() {
    const btn = document.getElementById('speakeasy-music-toggle');
    if (!btn) return;
    btn.innerHTML = playing
      ? '<span class="music-icon">🎹</span><span class="music-label">Music On</span>'
      : '<span class="music-icon">🔇</span><span class="music-label">Music Off</span>';
    btn.classList.toggle('music-playing', playing);
  }

  // ═══════════════════════════════════════════════════════════
  // 3D SPEAKEASY SCENE — Canvas renderer
  // ═══════════════════════════════════════════════════════════
  let canvas, cx;
  let rafId = null;
  let time = 0;
  let particles = [];

  function initScene() {
    canvas = document.getElementById('speakeasy-canvas');
    if (!canvas) return;
    cx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    // Create smoke/dust particles
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        size: 20 + Math.random() * 60,
        speed: 0.0002 + Math.random() * 0.0005,
        alpha: 0.02 + Math.random() * 0.06,
        drift: (Math.random() - 0.5) * 0.0003
      });
    }
    animate();
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function animate() {
    if (!canvas) return;
    time += 0.016;
    const w = canvas.width, h = canvas.height;
    cx.clearRect(0, 0, w, h);

    // ── Hardwood floor with perspective ──
    const floorY = h * 0.42;
    const floorGrad = cx.createLinearGradient(0, floorY, 0, h);
    floorGrad.addColorStop(0, 'rgba(55, 30, 12, 0.75)');
    floorGrad.addColorStop(0.4, 'rgba(65, 35, 14, 0.65)');
    floorGrad.addColorStop(1, 'rgba(35, 18, 8, 0.85)');
    cx.fillStyle = floorGrad;
    cx.fillRect(0, floorY, w, h - floorY);

    // Floor planks — wide hardwood
    cx.strokeStyle = 'rgba(85, 50, 18, 0.25)';
    cx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const ratio = i / 14;
      const y = floorY + (h - floorY) * ratio;
      cx.beginPath();
      cx.moveTo(0, y);
      cx.lineTo(w, y);
      cx.stroke();
    }
    // Perspective lines
    const vx = w * 0.5, vy = floorY;
    cx.strokeStyle = 'rgba(70, 40, 12, 0.12)';
    for (let i = 0; i < 10; i++) {
      const x = (i / 9) * w;
      cx.beginPath();
      cx.moveTo(x, h);
      cx.lineTo(vx, vy);
      cx.stroke();
    }

    // ── Back wall — dark wood paneling ──
    const wallGrad = cx.createLinearGradient(0, 0, 0, floorY);
    wallGrad.addColorStop(0, 'rgba(18, 10, 4, 0.9)');
    wallGrad.addColorStop(0.4, 'rgba(30, 16, 6, 0.8)');
    wallGrad.addColorStop(1, 'rgba(45, 24, 10, 0.7)');
    cx.fillStyle = wallGrad;
    cx.fillRect(0, 0, w, floorY);

    // Wainscoting chair rail
    const railY = floorY * 0.55;
    cx.strokeStyle = 'rgba(130, 80, 25, 0.35)';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(0, railY);
    cx.lineTo(w, railY);
    cx.stroke();
    // Crown molding
    cx.strokeStyle = 'rgba(110, 70, 20, 0.2)';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(0, 8);
    cx.lineTo(w, 8);
    cx.stroke();

    // Wall panels (lower)
    cx.strokeStyle = 'rgba(100, 60, 20, 0.15)';
    cx.lineWidth = 1;
    const panelCount = Math.max(3, Math.floor(w / 200));
    for (let i = 0; i < panelCount; i++) {
      const px = w * 0.04 + i * (w * 0.92 / panelCount);
      const pw = (w * 0.92 / panelCount) * 0.85;
      cx.strokeRect(px, railY + 8, pw, floorY - railY - 16);
    }
    // Wall panels (upper)
    for (let i = 0; i < panelCount; i++) {
      const px = w * 0.04 + i * (w * 0.92 / panelCount);
      const pw = (w * 0.92 / panelCount) * 0.85;
      cx.strokeRect(px, 18, pw, railY - 28);
    }

    // ── Cue rack on right wall ──
    const rackX = w * 0.88;
    const rackTop = floorY * 0.15;
    const rackBot = floorY * 0.75;
    // Rack frame
    cx.fillStyle = 'rgba(70, 38, 12, 0.6)';
    cx.fillRect(rackX - 2, rackTop, 40, rackBot - rackTop);
    cx.strokeStyle = 'rgba(120, 75, 25, 0.4)';
    cx.lineWidth = 1.5;
    cx.strokeRect(rackX - 2, rackTop, 40, rackBot - rackTop);
    // Cues
    const cueColors = ['rgba(220,180,80,0.6)', 'rgba(180,120,40,0.55)', 'rgba(200,160,60,0.5)',
      'rgba(160,100,30,0.5)', 'rgba(190,140,50,0.55)'];
    for (let i = 0; i < 5; i++) {
      const cx2 = rackX + 4 + i * 7;
      cx.strokeStyle = cueColors[i];
      cx.lineWidth = 2.5;
      cx.beginPath();
      cx.moveTo(cx2, rackTop + 10);
      cx.lineTo(cx2, rackBot - 8);
      cx.stroke();
      // Cue tip (white)
      cx.fillStyle = 'rgba(230,225,210,0.5)';
      cx.fillRect(cx2 - 1.5, rackBot - 10, 3, 6);
    }

    // ── Score beads on left wall ──
    const scoreX = w * 0.06;
    cx.strokeStyle = 'rgba(140, 90, 30, 0.35)';
    cx.lineWidth = 2;
    // Wire
    cx.beginPath();
    cx.moveTo(scoreX, floorY * 0.2);
    cx.lineTo(scoreX + 50, floorY * 0.2);
    cx.stroke();
    cx.beginPath();
    cx.moveTo(scoreX, floorY * 0.3);
    cx.lineTo(scoreX + 50, floorY * 0.3);
    cx.stroke();
    // Beads
    for (let row = 0; row < 2; row++) {
      const by = floorY * (0.2 + row * 0.1);
      for (let b = 0; b < 7; b++) {
        const bx = scoreX + 5 + b * 6.5;
        const isScored = b < (row === 0 ? 4 : 2);
        cx.fillStyle = isScored
          ? `rgba(200, 50, 30, ${0.5 + Math.sin(time + b) * 0.1})`
          : 'rgba(200, 180, 140, 0.3)';
        cx.beginPath();
        cx.arc(bx, by, 3, 0, Math.PI * 2);
        cx.fill();
      }
    }

    // ═══════════════════════════════════════════════════════
    // POOL TABLE — center of room, perspective view
    // ═══════════════════════════════════════════════════════
    const tblW = w * 0.52;
    const tblH = h * 0.32;
    const tblX = (w - tblW) / 2;
    const tblY = floorY + (h - floorY) * 0.08;

    // Table shadow
    cx.fillStyle = 'rgba(0,0,0,0.35)';
    cx.fillRect(tblX + 8, tblY + 8, tblW, tblH);

    // Outer wood rail
    const railW = 16;
    cx.fillStyle = 'rgba(80, 40, 12, 0.9)';
    cx.fillRect(tblX - railW, tblY - railW, tblW + railW * 2, tblH + railW * 2);
    // Rail highlight
    cx.strokeStyle = 'rgba(160, 100, 30, 0.4)';
    cx.lineWidth = 1;
    cx.strokeRect(tblX - railW, tblY - railW, tblW + railW * 2, tblH + railW * 2);
    // Inner rail edge
    cx.strokeStyle = 'rgba(100, 60, 18, 0.6)';
    cx.lineWidth = 2;
    cx.strokeRect(tblX - 2, tblY - 2, tblW + 4, tblH + 4);

    // Green felt
    const feltGrad = cx.createLinearGradient(tblX, tblY, tblX, tblY + tblH);
    feltGrad.addColorStop(0, 'rgba(20, 95, 40, 0.92)');
    feltGrad.addColorStop(0.5, 'rgba(25, 110, 48, 0.95)');
    feltGrad.addColorStop(1, 'rgba(18, 85, 35, 0.9)');
    cx.fillStyle = feltGrad;
    cx.fillRect(tblX, tblY, tblW, tblH);

    // Felt texture — subtle noise lines
    cx.strokeStyle = 'rgba(30, 120, 50, 0.15)';
    cx.lineWidth = 0.5;
    for (let i = 0; i < 20; i++) {
      const fy = tblY + (tblH * i / 20);
      cx.beginPath();
      cx.moveTo(tblX, fy);
      cx.lineTo(tblX + tblW, fy);
      cx.stroke();
    }

    // Center line & spot
    cx.strokeStyle = 'rgba(255,255,255,0.08)';
    cx.lineWidth = 1;
    cx.setLineDash([4, 6]);
    cx.beginPath();
    cx.moveTo(tblX + tblW * 0.25, tblY);
    cx.lineTo(tblX + tblW * 0.25, tblY + tblH);
    cx.stroke();
    cx.setLineDash([]);
    // Foot spot
    cx.fillStyle = 'rgba(255,255,255,0.12)';
    cx.beginPath();
    cx.arc(tblX + tblW * 0.7, tblY + tblH * 0.5, 3, 0, Math.PI * 2);
    cx.fill();
    // Head spot
    cx.beginPath();
    cx.arc(tblX + tblW * 0.25, tblY + tblH * 0.5, 3, 0, Math.PI * 2);
    cx.fill();

    // Pockets — 6 total
    const pocketR = 10;
    cx.fillStyle = 'rgba(5, 2, 0, 0.85)';
    const pockets = [
      [tblX, tblY], [tblX + tblW / 2, tblY - 3], [tblX + tblW, tblY],
      [tblX, tblY + tblH], [tblX + tblW / 2, tblY + tblH + 3], [tblX + tblW, tblY + tblH]
    ];
    for (const [px, py] of pockets) {
      cx.beginPath();
      cx.arc(px, py, pocketR, 0, Math.PI * 2);
      cx.fill();
      // Pocket rim
      cx.strokeStyle = 'rgba(120, 80, 20, 0.5)';
      cx.lineWidth = 2;
      cx.stroke();
    }

    // ── Pool balls — scattered on table ──
    const ballR = Math.min(8, tblW * 0.016);
    const balls = [
      { x: 0.70, y: 0.50, color: '#e8c820', stripe: false, num: 1 },  // solid yellow
      { x: 0.73, y: 0.44, color: '#2040c0', stripe: false, num: 2 },  // solid blue
      { x: 0.73, y: 0.56, color: '#cc2020', stripe: false, num: 3 },  // solid red
      { x: 0.76, y: 0.38, color: '#8020a0', stripe: false, num: 4 },  // solid purple
      { x: 0.76, y: 0.50, color: '#e06010', stripe: false, num: 5 },  // solid orange
      { x: 0.76, y: 0.62, color: '#109030', stripe: false, num: 6 },  // solid green
      { x: 0.79, y: 0.33, color: '#801010', stripe: false, num: 7 },  // solid maroon
      { x: 0.65, y: 0.50, color: '#111', stripe: false, num: 8 },      // 8 ball
      { x: 0.79, y: 0.45, color: '#e8c820', stripe: true, num: 9 },   // stripe yellow
      { x: 0.79, y: 0.55, color: '#2040c0', stripe: true, num: 10 },  // stripe blue
      { x: 0.79, y: 0.67, color: '#cc2020', stripe: true, num: 11 },  // stripe red
      { x: 0.38, y: 0.35, color: '#e8c820', stripe: false, num: 0 },  // scattered
      { x: 0.45, y: 0.65, color: '#cc2020', stripe: true, num: 0 },
      { x: 0.30, y: 0.55, color: '#8020a0', stripe: true, num: 0 },
      // Cue ball
      { x: 0.25, y: 0.50, color: '#f0ece0', stripe: false, num: -1 },
    ];

    for (const ball of balls) {
      const bx = tblX + tblW * ball.x;
      const by = tblY + tblH * ball.y;

      // Ball shadow
      cx.fillStyle = 'rgba(0,0,0,0.25)';
      cx.beginPath();
      cx.ellipse(bx + 1, by + 2, ballR, ballR * 0.6, 0, 0, Math.PI * 2);
      cx.fill();

      // Ball body
      const bg = cx.createRadialGradient(bx - ballR * 0.3, by - ballR * 0.3, 0, bx, by, ballR);
      if (ball.num === -1) {
        // Cue ball — white with sheen
        bg.addColorStop(0, '#ffffff');
        bg.addColorStop(0.7, '#e8e4d8');
        bg.addColorStop(1, '#c8c4b8');
      } else {
        bg.addColorStop(0, lightenColor(ball.color, 40));
        bg.addColorStop(0.6, ball.color);
        bg.addColorStop(1, darkenColor(ball.color, 40));
      }
      cx.fillStyle = bg;
      cx.beginPath();
      cx.arc(bx, by, ballR, 0, Math.PI * 2);
      cx.fill();

      // Stripe band
      if (ball.stripe) {
        cx.fillStyle = 'rgba(255,255,255,0.7)';
        cx.beginPath();
        cx.arc(bx, by, ballR, -0.5, 0.5);
        cx.arc(bx, by, ballR * 0.45, 0.5, -0.5, true);
        cx.closePath();
        cx.fill();
      }

      // Highlight
      cx.fillStyle = 'rgba(255,255,255,0.35)';
      cx.beginPath();
      cx.arc(bx - ballR * 0.25, by - ballR * 0.25, ballR * 0.35, 0, Math.PI * 2);
      cx.fill();
    }

    // ── Cue stick — angled across table ──
    cx.save();
    cx.translate(tblX + tblW * 0.15, tblY + tblH * 0.48);
    cx.rotate(-0.15 + Math.sin(time * 0.3) * 0.02);
    // Shaft
    const cueGrad = cx.createLinearGradient(0, 0, -w * 0.35, 0);
    cueGrad.addColorStop(0, 'rgba(230,220,190,0.7)');
    cueGrad.addColorStop(0.05, 'rgba(220,200,140,0.65)');
    cueGrad.addColorStop(1, 'rgba(140,80,20,0.5)');
    cx.strokeStyle = cueGrad;
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(8, 0);
    cx.lineTo(-w * 0.35, 0);
    cx.stroke();
    // Tip
    cx.fillStyle = 'rgba(80,160,200,0.7)';
    cx.beginPath();
    cx.arc(8, 0, 2.5, 0, Math.PI * 2);
    cx.fill();
    // Ferrule
    cx.fillStyle = 'rgba(240,235,220,0.6)';
    cx.fillRect(5, -1.5, 4, 3);
    cx.restore();

    // ═══════════════════════════════════════════════════════
    // HANGING TABLE LIGHTS — Tiffany style over pool table
    // ═══════════════════════════════════════════════════════
    const lightCount = w > 600 ? 3 : 2;
    for (let i = 0; i < lightCount; i++) {
      const lx = tblX + tblW * ((i + 1) / (lightCount + 1));
      const ly = 28;
      const pulse = 0.75 + 0.25 * Math.sin(time * 1.0 + i * 2.3);

      // Wire/chain
      cx.strokeStyle = 'rgba(90, 70, 35, 0.5)';
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.moveTo(lx, 0);
      cx.lineTo(lx, ly);
      cx.stroke();

      // Tiffany shade — wider, colored glass feel
      const shadeW = 36;
      const shadeH = 14;
      const shadeGrad = cx.createLinearGradient(lx - shadeW, ly, lx + shadeW, ly + shadeH);
      shadeGrad.addColorStop(0, 'rgba(20, 90, 40, 0.7)');
      shadeGrad.addColorStop(0.3, 'rgba(30, 120, 50, 0.6)');
      shadeGrad.addColorStop(0.7, 'rgba(160, 100, 20, 0.5)');
      shadeGrad.addColorStop(1, 'rgba(20, 90, 40, 0.7)');
      cx.fillStyle = shadeGrad;
      cx.beginPath();
      cx.moveTo(lx - shadeW, ly + shadeH);
      cx.lineTo(lx - shadeW * 0.6, ly);
      cx.lineTo(lx + shadeW * 0.6, ly);
      cx.lineTo(lx + shadeW, ly + shadeH);
      cx.closePath();
      cx.fill();
      // Shade rim — brass
      cx.strokeStyle = 'rgba(200, 160, 50, 0.4)';
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.moveTo(lx - shadeW, ly + shadeH);
      cx.lineTo(lx + shadeW, ly + shadeH);
      cx.stroke();

      // Warm downward light cone
      const coneGrad = cx.createRadialGradient(lx, ly + shadeH, 4, lx, tblY, tblW * 0.25);
      coneGrad.addColorStop(0, `rgba(255, 210, 100, ${0.25 * pulse})`);
      coneGrad.addColorStop(0.4, `rgba(255, 180, 60, ${0.12 * pulse})`);
      coneGrad.addColorStop(1, 'rgba(255, 140, 30, 0)');
      cx.fillStyle = coneGrad;
      cx.beginPath();
      cx.moveTo(lx - shadeW * 0.8, ly + shadeH);
      cx.lineTo(lx - tblW * 0.22, tblY + tblH);
      cx.lineTo(lx + tblW * 0.22, tblY + tblH);
      cx.lineTo(lx + shadeW * 0.8, ly + shadeH);
      cx.closePath();
      cx.fill();

      // Bulb glow
      cx.fillStyle = `rgba(255, 230, 140, ${0.5 * pulse})`;
      cx.beginPath();
      cx.arc(lx, ly + shadeH + 3, 3.5, 0, Math.PI * 2);
      cx.fill();
    }

    // ── Green felt light reflection on table ──
    const feltGlow = cx.createRadialGradient(
      tblX + tblW * 0.5, tblY + tblH * 0.4, 0,
      tblX + tblW * 0.5, tblY + tblH * 0.4, tblW * 0.4
    );
    const feltPulse = 0.8 + 0.2 * Math.sin(time * 0.8);
    feltGlow.addColorStop(0, `rgba(255, 230, 140, ${0.06 * feltPulse})`);
    feltGlow.addColorStop(1, 'rgba(255, 200, 80, 0)');
    cx.fillStyle = feltGlow;
    cx.fillRect(tblX, tblY, tblW, tblH);

    // ── Wall decor: "FAST TRACK" neon-ish sign ──
    const signX = w * 0.5;
    const signY = floorY * 0.2;
    const signPulse = 0.7 + 0.3 * Math.sin(time * 1.5);
    // Sign glow halo
    const signGlow = cx.createRadialGradient(signX, signY, 0, signX, signY, 120);
    signGlow.addColorStop(0, `rgba(0, 255, 200, ${0.04 * signPulse})`);
    signGlow.addColorStop(1, 'rgba(0, 255, 200, 0)');
    cx.fillStyle = signGlow;
    cx.fillRect(signX - 140, signY - 40, 280, 80);
    // Sign text
    cx.font = `bold ${Math.min(22, w * 0.024)}px "Press Start 2P", monospace`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillStyle = `rgba(0, 220, 180, ${0.35 * signPulse})`;
    cx.fillText('FAST TRACK', signX + 1, signY + 1);
    cx.fillStyle = `rgba(0, 255, 210, ${0.5 * signPulse})`;
    cx.fillText('FAST TRACK', signX, signY);

    // ── Art deco border accents ──
    drawArtDecoCorner(0, 0, 1, 1);
    drawArtDecoCorner(w, 0, -1, 1);
    drawArtDecoCorner(0, h, 1, -1);
    drawArtDecoCorner(w, h, -1, -1);

    // ── Chalk dust / smoke particles ──
    for (const p of particles) {
      p.x += p.drift;
      p.y -= p.speed;
      if (p.y < -0.1) { p.y = 1.1; p.x = Math.random(); }
      if (p.x < -0.1 || p.x > 1.1) p.x = Math.random();

      const pulse = 0.7 + 0.3 * Math.sin(time * 0.8 + p.x * 10);
      const smokeGrad = cx.createRadialGradient(
        p.x * w, p.y * h, 0,
        p.x * w, p.y * h, p.size
      );
      smokeGrad.addColorStop(0, `rgba(180, 200, 160, ${p.alpha * pulse * 0.7})`);
      smokeGrad.addColorStop(1, 'rgba(180, 200, 160, 0)');
      cx.fillStyle = smokeGrad;
      cx.fillRect(p.x * w - p.size, p.y * h - p.size, p.size * 2, p.size * 2);
    }

    // ── Vignette overlay — darker for pool hall mood ──
    const vig = cx.createRadialGradient(w / 2, h * 0.55, h * 0.2, w / 2, h / 2, h * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.5, 'rgba(0,0,0,0.2)');
    vig.addColorStop(1, 'rgba(0,0,0,0.65)');
    cx.fillStyle = vig;
    cx.fillRect(0, 0, w, h);

    rafId = requestAnimationFrame(animate);
  }

  // Color helpers for ball rendering
  function lightenColor(hex, amt) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    const n = parseInt(c, 16);
    const r = Math.min(255, (n >> 16) + amt);
    const g = Math.min(255, ((n >> 8) & 0xff) + amt);
    const b = Math.min(255, (n & 0xff) + amt);
    return `rgb(${r},${g},${b})`;
  }
  function darkenColor(hex, amt) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    const n = parseInt(c, 16);
    const r = Math.max(0, (n >> 16) - amt);
    const g = Math.max(0, ((n >> 8) & 0xff) - amt);
    const b = Math.max(0, (n & 0xff) - amt);
    return `rgb(${r},${g},${b})`;
  }

  function drawArtDecoCorner(ox, oy, sx, sy) {
    cx.save();
    cx.translate(ox, oy);
    cx.scale(sx, sy);
    cx.strokeStyle = 'rgba(200, 160, 60, 0.15)';
    cx.lineWidth = 1.5;
    // Outer L
    cx.beginPath();
    cx.moveTo(0, 80);
    cx.lineTo(0, 0);
    cx.lineTo(80, 0);
    cx.stroke();
    // Inner L
    cx.beginPath();
    cx.moveTo(8, 60);
    cx.lineTo(8, 8);
    cx.lineTo(60, 8);
    cx.stroke();
    // Diamond
    cx.beginPath();
    cx.moveTo(20, 4);
    cx.lineTo(24, 0);
    cx.lineTo(28, 4);
    cx.lineTo(24, 8);
    cx.closePath();
    cx.fillStyle = 'rgba(200, 160, 60, 0.12)';
    cx.fill();
    cx.stroke();
    cx.restore();
  }

  // ═══════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════
  function init() {
    initScene();

    // Auto-play music if user previously had it on (or first visit)
    const pref = localStorage.getItem('ft_lobby_music');
    if (pref !== '0') {
      // Need user gesture — listen for first click/tap
      const startOnGesture = () => {
        startMusic();
        document.removeEventListener('click', startOnGesture);
        document.removeEventListener('touchstart', startOnGesture);
      };
      document.addEventListener('click', startOnGesture, { once: false });
      document.addEventListener('touchstart', startOnGesture, { once: false });
    }
    updateToggleUI();
  }

  function destroy() {
    stopMusic();
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
  }

  return { init, destroy, toggleMusic, startMusic, stopMusic };
})();

// Boot when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Speakeasy.init);
} else {
  Speakeasy.init();
}
