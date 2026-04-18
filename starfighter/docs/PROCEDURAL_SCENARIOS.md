# Starfighter — Procedural Mission Scenario System

## Overview

The procedural scenario system replaces linear wave progression after wave 2 with dynamically generated missions that vary each playthrough. This creates emergent gameplay while maintaining the core 6DOF space combat experience.

---

## System Architecture

### Fixed Tutorial (Waves 1-2)

- **Wave 1**: FIRST FLIGHT — Training mission with target drones
- **Wave 2**: BAPTISM OF FIRE — First boss encounter (RAZOR)

### Procedural Generation (Wave 3+)

After wave 2, missions are procedurally generated using:
- Mission type templates
- Boss roster rotation
- Deep space location progression
- Wreckage looting system
- Dynamic objectives based on mission type

---

## Mission Type Templates

Each mission type has unique objectives and enemy composition modifiers:

### Assault Missions
- **Weight**: 1.0 (most common)
- **Objective**: Destroy enemy command ships or staging areas
- **Modifiers**: +50% bombers, +30% dreadnoughts
- **Example Names**: STRIKE VECTOR, HAMMER DOWN, LIGHTNING WAR, IRON FIST, THUNDER RUN

### Defense Missions
- **Weight**: 0.8
- **Objective**: Defend locations from coordinated assaults
- **Modifiers**: +40% interceptors, +20% standard fighters
- **Example Names**: SHIELD WALL, LAST STAND, FORTRESS, GUARDIAN, BULWARK

### Escort Missions
- **Weight**: 0.7
- **Objective**: Protect convoy through hostile space
- **Modifiers**: Spawns friendly convoy ships
- **Example Names**: CONVOY DUTY, SAFE PASSAGE, SHEPHERD, GUARDIAN ANGEL, ESCORT PRIME

### Reconnaissance Missions
- **Weight**: 0.6
- **Objective**: Scan locations for enemy activity
- **Modifiers**: +80% predators, +30% interceptors
- **Example Names**: GHOST PROTOCOL, SHADOW RUN, DARK HORIZON, SILENT WATCH, DEEP SCAN

### Mining Missions
- **Weight**: 0.5
- **Objective**: Salvage wreckage from destroyed fleets
- **Modifiers**: Enhanced wreckage spawn rate
- **Example Names**: SALVAGE OPS, WRECKAGE HAUL, SCAVENGER, CLAIM STAKE, DEAD HARVEST

### Sabotage Missions
- **Weight**: 0.6
- **Objective**: Infiltrate and destroy enemy installations
- **Modifiers**: Stealth emphasis, reduced enemy detection
- **Example Names**: BLACK OPS, SABOTEUR, VIPER STRIKE, GHOST KNIFE, SILENT DEATH

### Rescue Missions
- **Weight**: 0.5
- **Objective**: Extract stranded personnel from combat zones
- **Modifiers**: Spawns rescue targets, time pressure
- **Example Names**: LIFELINE, EXTRACTION, SEARCH & RESCUE, MERCY FLIGHT, LAST HOPE

### Interception Missions
- **Weight**: 0.9
- **Objective**: Intercept enemy fleets en route to objectives
- **Modifiers**: Fast-moving enemies, chase mechanics
- **Example Names**: INTERCEPT ALPHA, CUT THEM OFF, BLOCKADE RUN, BARRIER PATROL, NET CAST

---

## Deep Space Location Progression

Locations unlock progressively, creating sense of campaign advancement:

### Near Earth (Waves 1-3)
- Lunar Orbit
- Kessler Belt
- L4 Lagrange
- Geosync Station Theta

### Asteroid Belt (Waves 4-5)
- Ceres Approach
- Vesta Mining Zone
- Pallas Debris Field
- Hygiea Cluster

### Mars Zone (Waves 6-8)
- Phobos Shadow
- Deimos Outpost
- Valles Marineris Rift
- Olympus Mons Approach

### Jupiter System (Waves 9-11)
- Io Flux Tube
- Europa Ice Fields
- Ganymede Crater
- Callisto Dark Side

### Saturn System (Waves 12-14)
- Titan Atmosphere
- Enceladus Geysers
- Ring Gap Sigma
- Hyperion Tumble

### Deep Space (Waves 15+)
- Kuiper Belt Edge
- Oort Cloud Threshold
- Interstellar Medium
- Manifold Rift

---

## Boss Roster System

Bosses are randomly selected from an expanding roster. Selection pool grows with wave progression.

### Boss Roster

| Name | Type | Hull Mult | Speed Mult | Description |
|------|------|-----------|------------|-------------|
| RAZOR | Interceptor | 1.5x | 1.3x | Vek Ace Pilot |
| IRONJAW | Bomber | 2.0x | 0.9x | Vek Assault Frigate |
| THE SHROUD | Predator | 1.8x | 1.1x | Stealth Hunter |
| DREADCLAW | Dreadnought | 3.0x | 0.7x | Raider Warlord |
| MINELORD KETH | Bomber | 2.2x | 0.8x | Mine Controller |
| GRAVITON | Alien Baseship | 4.0x | 0.5x | Gravity Platform |
| QUEEN THORAX | Predator | 2.5x | 1.2x | Hive Matriarch |
| SCRAPJAW | Dreadnought | 3.5x | 0.6x | Salvage Lord |
| WARDEN VOSS | Alien Baseship | 4.5x | 0.5x | Prison Commander |
| THE PATRIARCH | Predator | 3.0x | 1.0x | Ancient One |
| WORLDBREAKER | Dreadnought | 5.0x | 0.4x | Siege Titan |
| ARCHON ZAEL | Alien Baseship | 5.5x | 0.6x | Grand Admiral |

### Boss Spawning Logic

- Wave 2: Guaranteed first boss (RAZOR)
- Wave 3+: 40% base chance + 3% per wave
- Boss pool expands: waves 1-4 use first 4 bosses, waves 5-8 add next 4, etc.
- Bosses scale stats by wave: `hull *= bossData.hull * (1 + wave * 0.3)`

### Boss Features

- Dramatic introduction with warning comms
- Visual boss marker in 3D space
- 70% chance to drop alien tech when destroyed
- Higher score multipliers
- Announcer callouts

---

## Wreckage Looting System (Wave 3+)

### Spawning

- 40% chance enemies spawn wreckage on death
- Wreckage drifts with random velocity
- 2-minute lifetime before despawn
- Larger wreckage from dreadnoughts/bosses

### Looting Mechanics

- Player must straif close to wreckage (radius + 80m)
- 25% base chance of containing loot (70% for bosses)
- Loot is "easter egg" system — not guaranteed
- Visual/audio feedback on successful loot

### Alien Tech Pool

| Tech Name | Effect | Bonus | Rarity |
|-----------|--------|-------|--------|
| Vek Shield Capacitor | Shields | +25 Max Shields | 30% |
| Bio-Armor Plating | Hull | +20 Max Hull | 30% |
| Plasma Injector | Damage | +15% Weapon Damage | 20% |
| Ion Thruster Core | Speed | +10% Max Speed | 25% |
| Targeting Matrix | Accuracy | +20% Accuracy | 15% |
| Energy Recycler | Ammo | +3 Torpedoes | 20% |
| Stealth Coating | Evasion | +15% Evasion | 10% |
| Quantum Radar | Sensors | +30% Sensor Range | 15% |
| Manifold Fragment | Special | Unknown Effect | 5% |

### Tech Application

- Upgrades are **permanent** for current run
- Stack additively (multiple shield upgrades = cumulative bonus)
- HUD notification with animated popup
- Stored in `state._alienTechInventory` array

---

## Manifold-Driven Composition

Enemy spawning still uses dimensional programming manifolds:

### Wave Intensity Manifold

```
x = wave * 0.14 (capped at 1.2)
y = random(0.55, 1.0) // chaos seed, rolled fresh each wave
z_linear = x * y      // proportional scaling
z_asymm = x * y²      // quadratic escalation
```

### Composition Modulation

- Base enemy count: `5 + floor(wave * 1.8 * z_linear)`
- Enemy budget: `baseCount * (0.8 + y * 0.4)`
- Cluster count: `max(1, floor(1 + wave * 0.4 * z_asymm))`

### Mission Type Weights Applied

Mission type modifies enemy type weights before manifold calculation, creating mission-specific compositions.

---

## Integration with Existing Systems

### ANPC Dialog System

- Bosses trigger custom ANPC announcer callouts
- Mission types generate contextual radio chatter
- Looting triggers announcer feedback

### Progression System

- XP/credits still earned per wave
- Rank progression unchanged
- Weapon unlocks maintained (tiers 1-10)
- Mission difficulty scales with rank

### Rescue Mission (First Death)

- Procedural system pauses during rescue scenario
- Returns to procedural generation after rescue complete
- Weapon unlock (Proton Torpedo) integrated

### Visual Systems (3D.js)

- Wreckage entities rendered with debris meshes
- Boss markers use distinct visual effects
- Location-specific skyboxes (future enhancement)

---

## Story Justification for Deep Space Travel

### Manifold Jump Network

Human fleet uses **manifold rift nodes** for faster-than-light travel:

1. **Waves 1-3**: Near Earth defense (initial contact)
2. **Wave 4**: First manifold jump to Asteroid Belt (pursue Vek scouts)
3. **Wave 6**: Jump to Mars (intercept Vek staging area)
4. **Wave 9**: Jupiter jump (Skorne first contact, multi-faction war begins)
5. **Wave 12**: Saturn jump (chase retreating Skorne carrier groups)
6. **Wave 15+**: Deep space pursuit (final confrontation at Manifold Rift source)

### Narrative Integration

- Command explains jumps via briefing comms
- ANPC dialog references travel ("manifold transit complete")
- Visual: brief warp tunnel effect between location changes
- Lore: Manifold technology reverse-engineered from alien wreckage

---

## Technical Implementation Notes

### Function Reference

- `_generateMission(wave)`: Generates procedural mission data
- `_getCurrentMission()`: Returns cached mission for current wave
- `_spawnBoss(bossData)`: Spawns boss with scaled stats
- `_spawnWreckage(pos, type, isBoss)`: Creates wreckage entity
- `_updateWreckage(dt)`: Handles looting proximity checks
- `_attemptLoot(wreckage)`: Rolls for alien tech
- `_applyAlienTech(tech)`: Applies permanent upgrade to player
- `_showAlienTechNotification(tech)`: Displays HUD popup

### State Tracking

- `state._currentMission`: Cached mission data for current wave
- `state._wreckagePool`: Array of active wreckage entities
- `state._alienTechInventory`: Player's collected tech upgrades
- `state._damageMultiplier`: Cumulative damage bonus from tech
- `state._evasionBonus`: Cumulative evasion from tech
- `state._sensorRange`: Cumulative sensor range bonus

### Performance Considerations

- Wreckage limited to 2-minute lifetime
- Maximum 50 enemies per wave (budget cap)
- Boss pool filtered by wave to prevent early endgame bosses

---

## Design Philosophy

### Replayability

- No two playthroughs identical after wave 2
- Random mission types create emergent narratives
- Boss rotation prevents predictability
- Looting adds risk/reward decisions

### Player Agency

- Choice to pursue wreckage vs combat objectives
- Risk assessment: chase loot or protect baseship
- Resource management (time, fuel, ammo)

### Progression Feel

- Location progression creates campaign structure
- Boss difficulty curve maintains challenge
- Tech upgrades provide power fantasy
- Manifold math ensures balanced scaling

---

## Future Enhancements

### Potential Additions

- Mission-specific environmental hazards (asteroid fields, solar flares)
- Location-based visual skyboxes (Jupiter's Great Red Spot backdrop)
- Chain missions: completing one unlocks special follow-up
- Faction reputation system: help Vek defectors, gain allies
- Deep space stations as mission hubs
- Procedural escort ship types (cruisers, destroyers, carriers)
- Mining asteroids for raw materials (crafting system)
- Black market tech trading at pirate stations

### Balancing Hooks

- Mission type weights adjustable per difficulty level
- Boss pool can be reordered or gated by progression flags
- Loot rarity tunable via difficulty slider
- Enemy budget formula can be tweaked without code changes

---

## Compatibility with Design Documents

### Controls (CONTROLS.md)

- All controls unchanged
- Looting passive (proximity-based), no new keybinds required

### Gameplay (GAMEPLAY.md)

- 6DOF combat core preserved
- Launch/land/combat phases maintained
- Entity types unchanged (enemies, torpedoes, lasers)

### NPC Dialog (NPC_DIALOG_RIBRIC.md)

- Mission objectives feed ANPC intent system
- Boss names used in announcer callouts
- Location names appear in tactical comms

### Progression (starfighter_progression_bible.md)

- 15 ranks still unlock weapons/abilities
- XP/credit earning unchanged
- Boss kills award bonus XP (existing system)

---

## Conclusion

The procedural scenario system transforms Starfighter from a linear 20-wave campaign into a replayable roguelike-inspired space combat game while preserving the manifold-driven dimensional programming architecture and immersive 6DOF flight model.

Every playthrough tells a different story. Every boss is a new threat. Every wreckage is a gamble.

**The war is procedural. The missions are infinite. The stakes are always maximum.**
