# Starfighter — Gameplay & Rules

## Overview

Starfighter is a first-person 6DOF (six degrees of freedom) space combat game.
You pilot a human starfighter from a cockpit view, defending your baseship against waves of alien attackers in orbit around Earth.

---

## Game Phases

### 1. Launch Phase
- Game begins inside the baseship's launch bay tunnel
- Cockpit is visible — you're strapped in
- 5-second countdown with metallic rattling and engine spool-up
- Camera shakes with increasing intensity
- After countdown, you accelerate through the tunnel into open space
- **No player control during launch** — pure cinematic

### 2. Combat Phase
- Full 6DOF flight control
- Enemies spawn in waves at 4000–5000m distance
- Destroy all enemies to clear the wave
- Baseship is a friendly — protect it
- HUD shows: shields, hull, fuel, torpedoes, kills, score, wave number
- Radar shows nearby entities as colored blips (bottom-left)

### 3. Landing Approach
- Triggered automatically when wave is cleared
- Fly back toward baseship
- HUD shows distance and speed to baseship
- Must approach slowly (speed < threshold) and close enough
- Press Space to dock when prompted

### 4. Docking / Rearm
- 5-second landing sequence
- Ship is rearmed, repaired
- Baseship receives partial repairs
- Next wave launches after briefing

---

## Entities

### Player (You)
- **Hull**: 100 HP
- **Shields**: 100 HP (absorbs damage first)
- **Max Speed**: 200 m/s
- **Weapons**: Lasers (unlimited), Torpedoes (limited, lock-on)
- **Turbo**: Hold Shift for afterburner boost

### Baseship (Friendly)
- **Hull**: 5000+ HP (increases between waves)
- **Shields**: 2000+ HP
- Large human battleship — your carrier
- Contains launch bay and hangar
- If destroyed: **game over**

### Enemy Fighter (Alien)
- **Hull**: 50 + (wave × 10) HP
- **Max Speed**: 80 + (wave × 5) m/s
- Standard alien fighter — main threat
- AI-controlled, pursues player or baseship
- Fires lasers at targets in range

### Alien Mothership (Capital Ship)
- Spawns on **wave 2+**
- **Hull**: 1000 + (wave × 500) HP
- **Max Speed**: 20 + (wave × 2) m/s
- **Radius**: 150 (massive)
- Attacks the baseship directly
- Priority target — destroy before it reaches your carrier

### Laser Bolt
- Speed: 800 m/s
- Damage: 15 HP
- Lifetime: 3 seconds
- Green color (player), varies by faction

### Torpedo
- Speed: 200 m/s (homing)
- Damage: 80 HP
- Lifetime: 8 seconds
- Tracks locked target
- Cyan color with glow trail

---

## Scoring

| Action | Points |
|---|---|
| Destroy enemy fighter | 100 |
| Destroy alien mothership | 1000 |

---

## Wave Progression

- **Wave 1**: 7 enemy fighters
- **Wave 2+**: 5 + (wave × 2) fighters + 1 alien mothership
- Each wave, enemies get tougher (more hull, faster)
- Baseship receives partial repairs between waves

---

## Combat Rules

1. **Shields absorb damage first**, then hull takes overflow
2. **Hull at 0 = destruction** — entity explodes
3. Player and baseship destruction = **game over**
4. **No friendly fire** — player lasers don't damage baseship
5. **Arena radius**: 8000m — combat takes place in orbital space
6. **Collision damage** applies between ships
7. Player is **invulnerable during launch phase**

---

## AI Behavior

### Enemy Fighters
- Select target: player or baseship (random bias)
- Chase target within engagement range
- Fire lasers when aimed within 15° of target and in range
- Evade when taking damage
- Coordinate loosely — not formation flying

### Alien Mothership
- Targets baseship primarily
- Slow but heavily armored
- Represents strategic threat — not fast enough to chase player

---

## Game Over Conditions

- **Player hull reaches 0**: "Hull Integrity Failed"
- **Baseship hull reaches 0**: "Baseship Destroyed"

---

## Environment

- **Earth**: Visible below the combat area with atmosphere, clouds, limb glow
- **Sun**: Distant star providing directional lighting — corona layers, animated pulse
- **Space Station**: Human station with artificial gravity ring, visible in distance
- **Starfield**: 4000 stars at ~9000m radius, visible in radar miniature
- **Manifold**: SpaceManifold with Schwarz Diamond topology (z = x·y surface), CELL_SIZE=500 spatial hash grid for efficient entity queries
