# Music & Audio Manifold Specification

## Dimensional Audio Hierarchy

| Dimension | Audio Domain | Example |
|-----------|-------------|---------|
| 0D | Note / parameter | Pitch A4 = 440 Hz |
| 1D | Melody | Temporal note sequence |
| 2D | Harmony | Simultaneous chord voicing |
| 3D | Timbre | Spectral texture / overtone field |
| 4D | Orchestration | Temporal + harmonic + spatial arrangement |
| 5D+ | Adaptive score | Emotion, interaction, procedural variation |

## Core Rule

Every audio element is a **wave manifold**:

```
wave(t) = A * sin(2π * f * t + φ)
```

Combining manifolds in higher dimensions:

```
manifold chord(y, t):
    note_1 = sin(f1 * t)
    note_2 = sin(f2 * t)
    note_3 = sin(f3 * t)
    result = note_1 + note_2 + note_3
end
```

## DSL — Music Manifold

```
manifold mountain_score(x, y, t):
    melody      = sin(x * t)
    harmony     = cos(y * t)
    instruments = ['violin', 'horn', 'choir']
    tempo       = 72
    key         = 'D_minor'
end
```

### Parameter Meaning

| Parameter | Type | Description |
|-----------|------|-------------|
| `melody` | expression | 1D note-sequence generator |
| `harmony` | expression | 2D chord voicing function |
| `instruments` | list | Target MIDI program assignments |
| `tempo` | integer | BPM |
| `key` | string | Tonal center + mode |
| `dynamics` | expression | Amplitude envelope `A(t)` |
| `spatial` | expression | Stereo / surround panning `pan(t)` |

## Compiler → MIDI Mapping

| Manifold Output | MIDI Field |
|----------------|------------|
| Note pitch from expression | `note_on` / `note_off` messages |
| Amplitude envelope | Velocity (0–127) |
| Temporal position | Tick / beat offset |
| Instrument list | Program Change (channel per instrument) |
| Spatial panning | CC10 (pan controller) |

## Waveform Synthesis

For direct synthesis (bypassing MIDI), the compiler emits SuperCollider OSC messages:

```supercollider
{ SinOsc.ar(freq: 440 * SinOsc.kr(0.5), mul: 0.3) }.play
```

Or JUCE AudioProcessor parameters for VST/AU plugin pipelines.

## Adaptive Score Substrate

The score manifold can be driven by game state:

```
substrate adaptive_score:
    tension    = game_state.threat_level       // 0.0 – 1.0
    brightness = npc.emotion.valence           // −1.0 – 1.0
    intensity  = game_state.action_density     // 0.0 – 1.0
end
```

At runtime the compiler re-evaluates the music manifold each bar:

```
tempo     = 60 + tension * 60           // 60–120 BPM
mode      = brightness > 0 ? 'major' : 'minor'
layering  = floor(intensity * 4)        // 0–4 instrument layers
```

## Foley Integration

Foley elements are 0D/1D manifolds triggered by world events:

```
manifold footstep(surface, velocity):
    frequency = surface == 'stone' ? 800 : 400
    amplitude = velocity * 0.8
    reverb    = surface == 'cave' ? 0.7 : 0.1
end
```

Substrate `sound_engine` maps each foley manifold to a sample bank entry or procedural synthesis node.

## Implementation Stack

| Layer | Tool |
|-------|------|
| Score authoring | SuperCollider / LilyPond |
| MIDI pipeline | JUCE MidiMessage / FluidSynth |
| VST/AU plugins | JUCE AudioPluginInstance |
| Waveform synthesis | SuperCollider `SynthDef` |
| Spatial audio | Steam Audio / FMOD |
| Adaptive mixing | FMOD Studio event parameters |
